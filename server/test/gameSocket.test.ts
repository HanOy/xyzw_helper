import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';
import { GameSocket } from '../src/game/GameSocket.js';

/**
 * 覆盖 GameSocket 两处连接层修复 (该文件带 @ts-nocheck, 没有静态类型兜底):
 *  1. 僵尸连接检测: 半死连接主动断开重连, 但服务端不回流时绝不误判
 *  2. send() 快速失败: 断连时立即抛错, 不再静默入队等到超时
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

describe('GameSocket 僵尸连接检测', () => {
  it('服务端从不回帧 → 不判定僵尸 (不会误杀 / 连接震荡)', async () => {
    const { url } = await startServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = track(new GameSocket({ url, heartbeatMs: 30, zombieIdleMs: 60, reconnectDelayMs: 10 })) as any;
    const statuses: string[] = [];
    s.on('status', (st: string) => statuses.push(st));

    await s.connect();
    expect(s.isConnected()).toBe(true);
    // 未收到过 _sys/ack → 检测保持关闭
    expect(s.heartbeatAckSeen).toBe(false);

    await new Promise((r) => setTimeout(r, 400)); // 远超若干阈值窗口
    expect(s.isZombie()).toBe(false);
    expect(s.isConnected()).toBe(true);
    expect(statuses.filter((x) => x === 'disconnected')).toHaveLength(0);
  });

  it('观测到过 ack 后转为静默 → 主动断开并自动重连', async () => {
    const { url } = await startServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = track(new GameSocket({ url, heartbeatMs: 30, zombieIdleMs: 60, reconnectDelayMs: 10 })) as any;
    const statuses: string[] = [];
    s.on('status', (st: string) => statuses.push(st));

    await s.connect();
    expect(s.isConnected()).toBe(true);

    // 制造"曾收到过心跳响应, 之后连接半死"的状态
    s.heartbeatAckSeen = true;
    s.lastInboundAt = Date.now() - 10_000;
    expect(s.isZombie()).toBe(true);

    // 心跳 tick 应触发 terminate → close → onClose → 自动重连
    expect(await waitFor(() => statuses.includes('disconnected'))).toBe(true);
    expect(await waitFor(() => s.isConnected() === true)).toBe(true);
    expect(s.reconnectAttempts).toBeGreaterThan(0);
    // 新连接必须重新证明服务端会回 ack —— 避免拿旧连接的信息误判新连接
    expect(s.heartbeatAckSeen).toBe(false);
  });

  it('zombieIdleMs=0 → 关闭检测', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = track(new GameSocket({ url: 'ws://127.0.0.1:1', zombieIdleMs: 0 })) as any;
    s.heartbeatAckSeen = true;
    s.lastInboundAt = Date.now() - 10_000_000;
    expect(s.isZombie()).toBe(false);
  });

  it('阈值内静默不判定; 刚 open 视为新鲜', async () => {
    const { url } = await startServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = track(new GameSocket({ url, heartbeatMs: 30, zombieIdleMs: 5000 })) as any;
    await s.connect();
    s.heartbeatAckSeen = true;
    expect(s.lastInboundAt).toBeGreaterThan(0); // onOpen 已置位
    expect(s.isZombie()).toBe(false);
  });
});
