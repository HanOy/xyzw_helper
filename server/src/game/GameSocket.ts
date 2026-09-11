// @ts-nocheck
import EventEmitter3 from 'event-emitter3';
import WebSocket from 'ws';
import type { IncomingMessage } from 'node:http';
import { Buffer } from 'node:buffer';
import { g_utils, encode as bonEncode, bon } from './bonProtocol.js';
import { getDefaultBody, responseToCommandMap, errorCodeMap, cmdDebounceMap } from './commands.js';
import { logger } from '../logger.js';

const EventEmitter = EventEmitter3 as unknown as new () => EventEmitter3;

const wsLog = logger.child({ mod: 'ws' });

export interface GameSocketOptions {
  url: string;
  tokenId?: string;
  heartbeatMs?: number;
  /**
   * 僵尸连接判定阈值 (ms): 连续无入站帧超过该时长即认为 TCP 已半死, 主动断开重连。
   * 仅在**观测到过**心跳响应 (_sys/ack) 后才生效; 传 0 显式关闭。默认 heartbeatMs * 4
   */
  zombieIdleMs?: number;
  sendQueueIntervalMs?: number;
  reconnectDelayMs?: number;
  reconnectStableMs?: number;
  maxReconnectDelayMs?: number;
  onHandshakeFailed?: (tokenId: string) => void;
  /** 重连连续失败达到阈值时触发 (供后端自动续期 + 重连使用) */
  onReconnectExhausted?: (tokenId: string) => void;
}

interface QueueTask {
  cmd: string;
  params: Record<string, unknown>;
  seq: number;
  respKey?: string;
  sleep?: number;
  /** true = 响应不 emit 给上层 (bus / SSE), 仅用于清 pending, 例如 heart_beat */
  noBus?: boolean;
}

interface PendingPromise {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  originalCmd: string;
  timer: NodeJS.Timeout;
}

export type GameSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface GameSocketEvents {
  status: (status: GameSocketStatus, error?: string) => void;
  message: (msg: GameMessage) => void;
}

export interface GameMessage {
  cmd: string;
  seq?: number;
  resp?: number;
  ack?: number;
  code?: number;
  hint?: string;
  body?: unknown;
  raw?: Record<string, unknown>;
  time?: number;
}

const HEARTBEAT_CMD = '_sys/ack';

/** 非手动掉线后持续重连的时间窗口：超过则置“异常”并停止尝试 */
const RECONNECT_WINDOW_MS = 5 * 60 * 1000;

export class GameSocket extends EventEmitter<GameSocketEvents> {
  private readonly url: string;
  private readonly tokenId: string | undefined;
  private readonly onHandshakeFailed: ((tokenId: string) => void) | undefined;
  private readonly onReconnectExhausted: ((tokenId: string) => void) | undefined;
  private readonly heartbeatMs: number;
  private readonly zombieIdleMs: number;
  private readonly sendQueueIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly reconnectStableMs: number;
  private readonly maxReconnectDelayMs: number;
  private stableTimer: NodeJS.Timeout | null = null;
  // 标记不应推给前端的 seq (heart_beat 等纯保活命令), 响应收到后只清 pending/状态, 不 emit bus
  private noBusSeqs = new Set<number>();
  private everOpened = false;
  /** 最近一次收到入站帧的时间 (open 时置为当下); 0 = 尚未收到 */
  private lastInboundAt = 0;
  /**
   * 当前这条连接是否观测到过心跳响应 (_sys/ack)。
   * 每条连接都要自己证明"服务端会回 ack"才启用僵尸判定 —— 若服务端不回 ack,
   * 判定永不触发, 退化为原来的"只发不校验"保活, 不会误杀/陷入断开重连循环。
   */
  private heartbeatAckSeen = false;

  private ws: WebSocket | null = null;
  private status: GameSocketStatus = 'disconnected';
  private ack = 0;
  private seq = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDeadline: number | null = null;
  private intentionalClose = false;
  // 重连失败达阈值后是否已触发过 onReconnectExhausted, 避免同一会话里重复触发续期
  private reconnectExhaustedNotified = false;

  private sendQueue: QueueTask[] = [];
  private sendTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private pending = new Map<number, PendingPromise>();
  private debounceCache = new Map<string, { value: unknown; ts: number }>();

  constructor(options: GameSocketOptions) {
    super();
    this.url = options.url;
    this.tokenId = options.tokenId;
    this.onHandshakeFailed = options.onHandshakeFailed;
    this.onReconnectExhausted = options.onReconnectExhausted;
    this.heartbeatMs = options.heartbeatMs ?? 5000;
    // 僵尸连接判定阈值: 默认 4 个心跳周期 (4 × 5s = 20s); 显式传 0 可关闭该检测
    this.zombieIdleMs = options.zombieIdleMs ?? this.heartbeatMs * 4;
    this.sendQueueIntervalMs = options.sendQueueIntervalMs ?? 50;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 3000;
    this.reconnectStableMs = options.reconnectStableMs ?? 30000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 60000;
  }

  getStatus(): GameSocketStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      if (this.status === 'connected' || this.status === 'connecting') {
        resolve();
        return;
      }
      // 关闭可能残留的旧 socket，确保服务端释放该 token 的连接槽
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
        this.ws = null;
      }
      this.setStatus('connecting');
      try {
        this.ws = new WebSocket(this.url, {
          perMessageDeflate: false,
          handshakeTimeout: 15000,
        });
      } catch (err) {
        this.setStatus('error', (err as Error).message);
        reject(err);
        return;
      }

      const onOpen = () => {
        this.everOpened = true;
        // 刚完成握手, 底层连接确定存活; 以此为入站静默计时起点
        this.lastInboundAt = Date.now();
        // 新连接需重新证明服务端会回心跳 ack, 才允许启用僵尸判定
        this.heartbeatAckSeen = false;
        this.setStatus('connected');
        this.startHeartbeat();
        this.startQueueLoop();
        // 仅当连接稳定一段时间后才重置重连计数，避免"连上即断"导致无限重连
        if (this.stableTimer) clearTimeout(this.stableTimer);
        this.stableTimer = setTimeout(() => {
          this.reconnectAttempts = 0;
          this.reconnectDeadline = null;
          this.reconnectExhaustedNotified = false;
          wsLog.info('连接已稳定，重置重连计数');
        }, this.reconnectStableMs);
        resolve();
      };

      const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
        try {
          if (isBinary) {
            this.lastInboundAt = Date.now();
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
            const parsed = g_utils.parse(buf, 'auto');
            const raw = (parsed as { _raw?: Record<string, unknown> })._raw ?? {};
            const msg: GameMessage = {
              cmd: String(parsed.cmd ?? raw.cmd ?? ''),
              seq: typeof raw.seq === 'number' ? raw.seq : undefined,
              resp: typeof raw.resp === 'number' ? raw.resp : undefined,
              ack: typeof raw.ack === 'number' ? raw.ack : undefined,
              code: typeof raw.code === 'number' ? raw.code : undefined,
              hint: typeof raw.hint === 'string' ? raw.hint : undefined,
              body: (parsed as { rawData?: unknown }).rawData ?? raw.body,
              raw,
            };
            if (typeof msg.seq === 'number') {
              this.ack = msg.seq;
            }
            // 纯保活命令的响应 (heart_beat ack _sys/ack) 不推给上层 (ConnectionPool / SSE)
            if (msg.cmd === HEARTBEAT_CMD) {
              // 收到过心跳响应 → 说明服务端确实会回 ack, 僵尸检测可以启用了
              this.heartbeatAckSeen = true;
              this.resolvePromises(msg);
              return;
            }
            // 其他标了 noBus 的命令响应: 走 pending 清理但不 emit
            if (typeof msg.resp === 'number' && this.noBusSeqs.has(msg.resp)) {
              this.noBusSeqs.delete(msg.resp);
              this.resolvePromises(msg);
              return;
            }
            this.emit('message', msg);
            this.resolvePromises(msg);
          } else {
            const text = data.toString();
            wsLog.warn({ data: text }, 'non-binary frame received');
          }
        } catch (err) {
          wsLog.error({ err: (err as Error).message }, 'message parse failed');
        }
      };

      const onClose = (code: number, reasonBuf: Buffer) => {
        const reason = reasonBuf?.toString() ?? '';
        wsLog.info({ code, reason, reconnectAttempts: this.reconnectAttempts }, 'ws closed');
        // 握手失败 (1006 + 从未 open) → 通知上层尝试刷新 token
        if (!this.everOpened && code === 1006 && this.tokenId && this.onHandshakeFailed) {
          try {
            this.onHandshakeFailed(this.tokenId);
          } catch (err) {
            wsLog.warn({ err: (err as Error).message }, 'onHandshakeFailed callback threw');
          }
        }
        this.cleanup();
        this.setStatus('disconnected', reason || `code ${code}`);
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      const onError = (err: Error) => {
        wsLog.error({ err: err.message }, 'ws error');
        this.setStatus('error', err.message);
        reject(err);
      };

      this.ws.once('open', onOpen);
      this.ws.on('message', onMessage);
      this.ws.on('close', onClose);
      this.ws.on('error', onError);
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.reconnectDeadline = null;
    this.reconnectExhaustedNotified = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.cleanup();
    this.setStatus('disconnected');
  }

  private setStatus(status: GameSocketStatus, error?: string): void {
    this.status = status;
    this.emit('status', status, error);
  }

  private cleanup(): void {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.noBusSeqs.clear();
    for (const [seq, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('connection closed'));
    }
    this.pending.clear();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    setTimeout(() => this.sendHeartbeat(), 3000);
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return;
      // 僵尸连接检测: TCP 半开时本地 readyState 仍是 OPEN, 心跳发得出去却收不到任何响应。
      // 连续多个心跳周期无入站帧 → 判定已死, 主动断开触发重连;
      // 否则要等到下次发命令时 ws.send 才暴露问题 (任务已失败)。
      if (this.isZombie()) {
        this.handleZombie();
        return;
      }
      this.sendHeartbeat();
    }, this.heartbeatMs);
  }

  private startQueueLoop(): void {
    if (this.sendTimer) clearInterval(this.sendTimer);
    this.sendTimer = setInterval(() => {
      if (!this.sendQueue.length) return;
      if (!this.isConnected()) return;
      const task = this.sendQueue.shift();
      if (!task) return;
      this.executeTask(task).catch((err) => {
        wsLog.error({ err: err.message, cmd: task.cmd }, 'task failed');
      });
    }, this.sendQueueIntervalMs);
  }

  private async executeTask(task: QueueTask): Promise<void> {
    const ack = this.ack;
    const bodyBytes = bon.encode({ ...getDefaultBody(task.cmd), ...task.params });
    const payload: Record<string, unknown> = {
      cmd: task.cmd,
      ack,
      seq: task.seq,
      time: Date.now(),
      body: bodyBytes,
    };
    const enc = g_utils.getEnc('x');
    const encoded = bonEncode(payload, enc);
    const buf = Buffer.from(encoded);
    if (task.noBus && task.seq !== 0) this.noBusSeqs.add(task.seq);
    this.ws?.send(buf);
    if (task.sleep) {
      await new Promise((r) => setTimeout(r, task.sleep));
    }
  }

  private sendHeartbeat(): void {
    // 心跳响应不推给前端 (纯保活), 但响应仍会进入 resolvePromises 清掉 pending/状态
    this.enqueue('heart_beat', {}, { respKey: HEARTBEAT_CMD, seq: 0, noBus: true });
  }

  /**
   * 是否处于"僵尸连接"状态 (TCP 半开: 本地看着正常, 实际已收不到任何数据)。
   *
   * 仅在观测到过心跳响应 (heartbeatAckSeen) 后才启用 —— 若游戏服根本不回 ack,
   * 该判定永不触发, 退化为原来的"只发不校验"保活, 不会造成误杀/连接震荡。
   */
  private isZombie(): boolean {
    if (this.zombieIdleMs <= 0) return false;
    if (!this.heartbeatAckSeen) return false;
    if (this.lastInboundAt === 0) return false;
    return Date.now() - this.lastInboundAt > this.zombieIdleMs;
  }

  /**
   * 判定连接已失效 → 立即销毁底层 socket, 交给既有重连流程处理
   * (terminate → close 事件 → onClose → cleanup + scheduleReconnect)。
   *
   * 用 terminate 而非 close: 半开状态下 close 要等对端回 FIN, ws 默认 30s 才超时。
   * terminate 同步把 readyState 置为 CLOSING 并 destroy 底层 socket, 事件立即触发。
   */
  private handleZombie(): void {
    const idleMs = Date.now() - this.lastInboundAt;
    wsLog.warn(
      { tokenId: this.tokenId, idleMs, thresholdMs: this.zombieIdleMs },
      '心跳无响应, 判定连接已失效, 主动断开重连',
    );
    const ws = this.ws;
    if (!ws) return;
    try {
      ws.terminate();
    } catch (err) {
      wsLog.warn({ err: (err as Error).message }, 'terminate 失败, 退回 close');
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }

  private enqueue(
    cmd: string,
    params: Record<string, unknown>,
    options: { seq?: number; respKey?: string; sleep?: number; noBus?: boolean } = {},
  ): number {
    const seq = options.seq ?? (cmd === 'heart_beat' ? 0 : ++this.seq);
    this.sendQueue.push({
      cmd,
      params,
      seq,
      respKey: options.respKey ?? cmd,
      sleep: options.sleep,
      noBus: options.noBus,
    });
    return seq;
  }

  async send<T = unknown>(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 5000): Promise<T> {
    // 断连时必须**快速失败**。
    // 原判据 `!isConnected() && !ws` 用了 && 是错的: close 之后 this.ws 仍持有那个已关闭的
    // WebSocket 对象 (onClose 不置 null), 于是守卫放行 → 命令入队 → startQueueLoop 因
    // !isConnected() 永不发送 → 既不报错也不发出, 静默挂到 timeoutMs 超时。
    if (!this.isConnected()) {
      throw new Error('WebSocket 未连接');
    }
    const debounceMs = cmdDebounceMap[cmd];
    if (debounceMs) {
      const hit = this.debounceCache.get(cmd);
      if (hit && Date.now() - hit.ts < debounceMs) {
        return hit.value as T;
      }
    }
    const seq = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`请求超时: ${cmd}`));
      }, timeoutMs);
      this.pending.set(seq, {
        resolve: (v) => {
          if (debounceMs) {
            this.debounceCache.set(cmd, { value: v, ts: Date.now() });
          }
          resolve(v as T);
        },
        reject,
        originalCmd: cmd,
        timer,
      });
      this.enqueue(cmd, params, { seq });
    });
  }

  sendNoAck(cmd: string, params: Record<string, unknown> = {}): void {
    this.enqueue(cmd, params);
  }

  private resolvePromises(msg: GameMessage): void {
    const raw = msg.raw ?? {};
    const respSeq = typeof raw.resp === 'number' ? raw.resp : msg.resp;
    if (typeof respSeq === 'number' && this.pending.has(respSeq)) {
      const p = this.pending.get(respSeq)!;
      this.pending.delete(respSeq);
      clearTimeout(p.timer);
      this.completePromise(p, msg);
      return;
    }

    const respCmd = msg.cmd?.toLowerCase?.() ?? '';
    const mapped = responseToCommandMap[respCmd];
    const candidates = new Set<string>(
      typeof mapped === 'string' ? [mapped] : Array.isArray(mapped) ? mapped : [respCmd],
    );

    for (const [seq, p] of this.pending) {
      if (candidates.has(p.originalCmd)) {
        this.pending.delete(seq);
        clearTimeout(p.timer);
        this.completePromise(p, msg);
        return;
      }
    }
  }

  private completePromise(p: PendingPromise, msg: GameMessage): void {
    const code = msg.code ?? 0;
    if (code === 0 || code === undefined) {
      p.resolve(msg.body ?? msg);
    } else {
      const hint = errorCodeMap[code] ?? msg.hint ?? '未知错误';
      p.reject(new Error(`服务器错误: ${code} - ${hint}`));
    }
  }

  private scheduleReconnect(): void {
    // 手动断开：绝不自动重连，等待用户手动连接
    if (this.intentionalClose) {
      this.setStatus('disconnected');
      return;
    }
    // error+close 可能连续触发，用 reconnectTimer 去重，避免重复排程
    if (this.reconnectTimer) return;

    // 非手动掉线：在 5 分钟窗口内持续重试；窗口结束仍未连上则置“异常”并停止
    if (this.reconnectDeadline == null) {
      this.reconnectDeadline = Date.now() + RECONNECT_WINDOW_MS;
    }
    if (Date.now() >= this.reconnectDeadline) {
      wsLog.warn('重连窗口(5分钟)已结束，停止自动重连');
      this.setStatus('error', '重连超时：5 分钟内无法恢复连接，请检查网络/鉴权配置或手动重连');
      this.reconnectDeadline = null;
      return;
    }

    // 连续重连失败达阈值 → 通知上层(后端自动续期 + 重连)
    if (
      !this.reconnectExhaustedNotified &&
      this.reconnectAttempts >= 5 &&
      this.tokenId &&
      this.onReconnectExhausted
    ) {
      this.reconnectExhaustedNotified = true;
      wsLog.warn(
        { tokenId: this.tokenId, attempts: this.reconnectAttempts },
        'reconnect 失败达阈值，触发 token 自动续期',
      );
      try {
        this.onReconnectExhausted(this.tokenId);
      } catch (err) {
        wsLog.warn({ err: (err as Error).message }, 'onReconnectExhausted callback threw');
      }
    }

    this.reconnectAttempts++;
    const backoff = Math.min(
      this.reconnectDelayMs * 2 ** (this.reconnectAttempts - 1),
      this.maxReconnectDelayMs,
    );
    const remaining = this.reconnectDeadline - Date.now();
    const delay = Math.max(1000, Math.min(backoff, remaining));
    this.setStatus('reconnecting', '连接已断开，正在尝试重连...');
    wsLog.info(
      { attempt: this.reconnectAttempts, delayMs: delay, deadline: this.reconnectDeadline },
      '计划重连',
    );
    this.reconnectTimer = setTimeout(async () => {
      // 在 connect 之前清空定时器，使本次连失败后的 onClose 能再次排程(避免死锁)
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // status already updated；onClose 会再次排程
      }
    }, delay);
  }
}