import { onBeforeUnmount, ref } from 'vue';
import { getStoredToken } from '../api';

export type SseEvent =
  | { type: 'ws.status'; tokenId: string; status: string; error?: string }
  | { type: 'game.event'; tokenId: string; msg: Record<string, unknown> }
  | {
      type: 'task.log';
      runId: string;
      tokenId?: string;
      level: 'info' | 'warn' | 'error';
      message: string;
      ts: string;
    }
  | { type: 'task.progress'; runId: string; current: number; total: number; stage?: string };

export interface UseSseStreamOptions {
  tokenIds?: string[];
  filter?: (evt: SseEvent) => boolean;
  onEvent?: (evt: SseEvent) => void;
}

export function useSseStream(opts: UseSseStreamOptions = {}) {
  const events = ref<SseEvent[]>([]);
  const lastEvent = ref<SseEvent | null>(null);
  const connected = ref(false);
  const error = ref<string | null>(null);

  let es: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = () => {
    if (typeof window === 'undefined') return;
    const token = getStoredToken();
    if (!token) {
      error.value = 'no token';
      return;
    }
    const params = new URLSearchParams();
    if (opts.tokenIds?.length) params.set('tokenIds', opts.tokenIds.join(','));
    const url = `/api/events/stream?${params.toString()}`;
    const esNew = new EventSource(url, { withCredentials: true });
    es = esNew;
    esNew.onopen = () => {
      connected.value = true;
      error.value = null;
    };
    esNew.onerror = () => {
      connected.value = false;
      error.value = 'connection lost';
      esNew.close();
      if (!stopped) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
    esNew.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as SseEvent;
        if (opts.filter && !opts.filter(data)) return;
        events.value.push(data);
        if (events.value.length > 500) events.value.splice(0, 100);
        lastEvent.value = data;
        opts.onEvent?.(data);
      } catch {
        // ignore
      }
    };
  };

  connect();

  onBeforeUnmount(() => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (es) es.close();
  });

  return { events, lastEvent, connected, error };
}