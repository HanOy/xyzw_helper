import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { GameSocket } from '../src/game/GameSocket.js';
import { g_utils } from '../src/game/bonProtocol.js';

/**
 * 覆盖 GameSocket 连接层行为 (该文件带 @ts-nocheck, 没有静态类型兜底):
 *  1. send() 快速失败: 断连时立即抛错, 不再静默入队等到超时
 *  2. 心跳保活: 跟随原版 (浏览器端 wsAgent) 语义 —— 发**上行 `_sys/ack` 确认包**,
 *     不期待响应; 空闲连接长时间无入站帧是**正常**的, 绝不能被当成死连接误杀
 *     (2026-09-11 的回归: 曾实现"发 heart_beat 等响应, 20s 无入站即杀",
 *      导致健康连接整夜每 ~25s 被断开重连一次, 定时任务全灭)
 */

const sockets: GameSocket[] = [];
const servers: WebSocketServer[] = [];

function track(s: GameSocket): GameSocket {
  sockets.push(s);
  return s;
}

async function startServer(onConn?: (ws: WsWebSocket) => void): Promise<{ url: string }> {
  const wss = new WebSocketServer({ port: 0 });
  servers.push(wss);
  wss.on('connection', (ws) => onConn?.(ws));
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const addr = wss.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `ws://127.0.0.1:${port}` };
}

/** 轮询等待条件成立, 避免依赖固定 sleep 造成偶发失败 */
async function waitFor(fn: () => boolean, timeoutMs = 3000, stepMs = 10): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return fn();
}

afterEach(async () => {
  for (const s of sockets.splice(0)) {
    try {
      (s as unknown as { disconnect: () => void }).disconnect();
    } catch {
      // ignore
    }
  }
  for (const wss of servers.splice(0)) {
    for (const c of wss.clients) {
      try {
        c.terminate();
      } catch {
        // ignore
      }
    }
    await new Promise<void>((r) => wss.close(() => r()));
  }
});

describe('GameSocket.send 守卫 (断连快速失败)', () => {
  it('status=disconnected 但 this.ws 仍持有旧对象 → 立即抛错, 不入队', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = track(new GameSocket({ url: 'ws://127.0.0.1:1' })) as any;
    // close 之后 onClose 不置空 this.ws, 这正是旧判据 `!isConnected() && !ws` 失效的场景
    s.status = 'disconnected';
    s.ws = { readyState: 3 /* CLOSED */ };

    await expect(s.send('role_getroleinfo')).rejects.toThrow('WebSocket 未连接');
    // 旧实现会把命令塞进队列, 然后因 !isConnected() 永不发送, 静默挂到 8s 超时
    expect(s.sendQueue.length).toBe(0);
    expect(s.pending.size).toBe(0);
  });

  it('已连接时正常入队 (不误抛)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = track(new GameSocket({ url: 'ws://127.0.0.1:1' })) as any;
    s.status = 'connected';
    s.ws = { readyState: 1 /* OPEN */ };

    const p = s.send('role_getroleinfo', {}, 20);
    p.catch(() => undefined); // 预期 20ms 后超时, 挂个 catch 避免 unhandled rejection
    expect(s.sendQueue.length).toBe(1);
    expect(s.pending.size).toBe(1);
  });
});

describe('GameSocket 心跳保活 (上行 _sys/ack, 不期待响应)', () => {
  it('服务器完全不回帧 → 空闲连接绝不误杀, 持续保持 connected', async () => {
    const { url } = await startServer();
    const s = track(new GameSocket({ url, heartbeatMs: 30 })) as any;
    const statuses: string[] = [];
    s.on('status', (st: string) => statuses.push(st));

    await s.connect();
    expect(s.isConnected()).toBe(true);

    // 远超多个心跳周期; 期间服务器一帧不发 (真实游戏服对空闲连接就是这样)
    await new Promise((r) => setTimeout(r, 600));
    expect(s.isConnected()).toBe(true);
    // connect 之后的 status 事件里不允许出现 disconnected / error / reconnecting
    expect(statuses.filter((x) => x !== 'connected' && x !== 'connecting')).toHaveLength(0);
  });

  it('心跳包内容: cmd=_sys/ack 且 seq=0 (上行确认包, 而非 heart_beat 请求)', async () => {
    const frames: Buffer[] = [];
    const { url } = await startServer((ws) => {
      ws.on('message', (d) => frames.push(Buffer.from(d as ArrayBuffer)));
    });
    const s = track(new GameSocket({ url, heartbeatMs: 30 })) as any;
    await s.connect();
    expect(await waitFor(() => frames.length > 0)).toBe(true);

    const parsed = g_utils.parse(frames[0], 'auto') as {
      cmd?: unknown;
      _raw?: { cmd?: unknown; seq?: unknown };
    };
    const cmd = String(parsed.cmd ?? parsed._raw?.cmd ?? '');
    const seq = typeof parsed._raw?.seq === 'number' ? parsed._raw.seq : undefined;
    expect(cmd).toBe('_sys/ack');
    expect(seq).toBe(0);
  });
});
