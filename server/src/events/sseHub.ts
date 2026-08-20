import { bus, type BusEvent } from './bus.js';

export interface SseClient {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  tokenIds: Set<string> | null;
}

const encoder = new TextEncoder();

function writeEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: BusEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  try {
    controller.enqueue(encoder.encode(data));
  } catch {
    // closed
  }
}

function writePing(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.enqueue(encoder.encode(`: ping\n\n`));
  } catch {
    // closed
  }
}

class SseHub {
  private clients = new Map<string, SseClient>();

  attach(id: string, tokenIds: string[] | null): ReadableStream<Uint8Array> {
    const set = tokenIds && tokenIds.length ? new Set(tokenIds) : null;
    const clientRef: { current: SseClient | null } = { current: null };

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const client: SseClient = {
          id,
          controller,
          tokenIds: set,
        };
        clientRef.current = client;
        this.clients.set(id, client);
        bus.emit('sse.attach', { type: 'sse.attach', tokenIds: client.tokenIds ? Array.from(client.tokenIds) : null });

        writeEvent(controller, {
          type: 'task.log',
          runId: id,
          level: 'info',
          message: 'SSE connected',
          ts: new Date().toISOString(),
        });

        const onEvent = (payload: BusEvent) => {
          if (client.tokenIds && payload.type === 'ws.status' && !client.tokenIds.has(payload.tokenId)) return;
          if (
            client.tokenIds &&
            payload.type === 'game.event' &&
            !client.tokenIds.has(payload.tokenId)
          )
            return;
          if (
            client.tokenIds &&
            payload.type === 'task.log' &&
            payload.tokenId &&
            !client.tokenIds.has(payload.tokenId)
          )
            return;
          writeEvent(controller, payload);
        };
        const onStatus = (payload: BusEvent) => onEvent(payload);
        const onTask = (payload: BusEvent) => onEvent(payload);

        bus.on('event', onEvent);
        bus.on('status', onStatus);
        bus.on('task', onTask);

        const ping = setInterval(() => writePing(controller), 25_000);

        (controller as unknown as { __cleanup?: () => void }).__cleanup = () => {
          clearInterval(ping);
          bus.off('event', onEvent);
          bus.off('status', onStatus);
          bus.off('task', onTask);
          this.clients.delete(id);
          bus.emit('sse.detach', { type: 'sse.detach', tokenIds: client.tokenIds ? Array.from(client.tokenIds) : null });
        };
      },
      cancel: () => {
        const c = (clientRef.current as unknown as { __cleanup?: () => void } | null) ?? null;
        c?.__cleanup?.();
        this.clients.delete(id);
      },
    });

    return stream;
  }

  detach(id: string): void {
    this.clients.delete(id);
  }

  size(): number {
    return this.clients.size;
  }
}

export const sseHub = new SseHub();