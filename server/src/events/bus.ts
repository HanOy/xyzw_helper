// @ts-nocheck
import EventEmitter3 from 'event-emitter3';
import type { GameMessage, GameSocketStatus } from '../game/GameSocket.js';

export type BusEvent =
  | { type: 'ws.status'; tokenId: string; status: GameSocketStatus; error?: string }
  | { type: 'game.event'; tokenId: string; msg: GameMessage }
  | { type: 'task.log'; runId: string; tokenId?: string; level: 'info' | 'warn' | 'error'; message: string; ts: string }
  | { type: 'task.progress'; runId: string; current: number; total: number; stage?: string }
  | { type: 'sse.attach'; tokenIds: string[] | null }
  | { type: 'sse.detach'; tokenIds: string[] | null };

class TypedBus {
  private emitter: EventEmitter3;
  constructor() {
    this.emitter = new EventEmitter3();
  }
  emit(event: 'event' | 'status' | 'task' | 'sse.attach' | 'sse.detach', payload: BusEvent): boolean;
  emit(event: string, payload: BusEvent): boolean {
    return this.emitter.emit(event, payload);
  }
  on(event: 'event' | 'status' | 'task' | 'sse.attach' | 'sse.detach', listener: (payload: BusEvent) => void): this;
  on(event: string, listener: (payload: BusEvent) => void): this {
    this.emitter.on(event, listener);
    return this;
  }
  off(event: string, listener: (payload: BusEvent) => void): this {
    this.emitter.off(event, listener);
    return this;
  }
}

export const bus = new TypedBus();