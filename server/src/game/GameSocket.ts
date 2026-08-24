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
  heartbeatMs?: number;
  sendQueueIntervalMs?: number;
  reconnectDelayMs?: number;
  reconnectStableMs?: number;
  maxReconnectDelayMs?: number;
}

interface QueueTask {
  cmd: string;
  params: Record<string, unknown>;
  seq: number;
  respKey?: string;
  sleep?: number;
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

/** 会话探活间隔：定期发送只读指令验证游戏会话是否仍然有效 */
const PROBE_INTERVAL_MS = 90 * 1000;

export class GameSocket extends EventEmitter<GameSocketEvents> {
  private readonly url: string;
  private readonly heartbeatMs: number;
  private readonly sendQueueIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly reconnectStableMs: number;
  private readonly maxReconnectDelayMs: number;
  private stableTimer: NodeJS.Timeout | null = null;
  private probeTimer: NodeJS.Timeout | null = null;

  private ws: WebSocket | null = null;
  private status: GameSocketStatus = 'disconnected';
  private ack = 0;
  private seq = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDeadline: number | null = null;
  private intentionalClose = false;

  private sendQueue: QueueTask[] = [];
  private sendTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private pending = new Map<number, PendingPromise>();
  private debounceCache = new Map<string, { value: unknown; ts: number }>();

  constructor(options: GameSocketOptions) {
    super();
    this.url = options.url;
    this.heartbeatMs = options.heartbeatMs ?? 5000;
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
        this.setStatus('connected');
        this.startHeartbeat();
        this.startQueueLoop();
        this.startProbe();
        // 仅当连接稳定一段时间后才重置重连计数，避免"连上即断"导致无限重连
        if (this.stableTimer) clearTimeout(this.stableTimer);
        this.stableTimer = setTimeout(() => {
          this.reconnectAttempts = 0;
          this.reconnectDeadline = null;
          wsLog.info('连接已稳定，重置重连计数');
        }, this.reconnectStableMs);
        resolve();
      };

      const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
        try {
          if (isBinary) {
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
    this.stopProbe();
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
      if (this.isConnected()) this.sendHeartbeat();
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

  private startProbe(): void {
    this.stopProbe();
    void this.probe();
    this.probeTimer = setInterval(() => void this.probe(), PROBE_INTERVAL_MS);
  }

  private stopProbe(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private async probe(): Promise<void> {
    try {
      await this.send('role_getroleinfo', {}, 5000);
    } catch {
      // 探活失败：会话可能已失效，若连接确实数去则关闭以触发重连
      if (!this.isConnected()) this.ws?.close();
    }
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
    this.ws?.send(buf);
    if (task.sleep) {
      await new Promise((r) => setTimeout(r, task.sleep));
    }
  }

  private sendHeartbeat(): void {
    this.enqueue('heart_beat', {}, { respKey: HEARTBEAT_CMD, seq: 0 });
  }

  private enqueue(
    cmd: string,
    params: Record<string, unknown>,
    options: { seq?: number; respKey?: string; sleep?: number } = {},
  ): number {
    const seq = options.seq ?? (cmd === 'heart_beat' ? 0 : ++this.seq);
    this.sendQueue.push({
      cmd,
      params,
      seq,
      respKey: options.respKey ?? cmd,
      sleep: options.sleep,
    });
    return seq;
  }

  async send<T = unknown>(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 5000): Promise<T> {
    if (!this.isConnected() && !this.ws) {
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