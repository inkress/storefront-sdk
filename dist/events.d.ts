import type { StorefrontEvents } from './types';
export type EventHandler<T = any> = (data: T) => void;
/**
 * Simple event emitter for SDK events
 */
export declare class EventEmitter {
    private events;
    on<K extends keyof StorefrontEvents>(event: K, handler: EventHandler<StorefrontEvents[K]>): () => void;
    off<K extends keyof StorefrontEvents>(event: K, handler: EventHandler<StorefrontEvents[K]>): void;
    emit<K extends keyof StorefrontEvents>(event: K, data: StorefrontEvents[K]): void;
    once<K extends keyof StorefrontEvents>(event: K, handler: EventHandler<StorefrontEvents[K]>): void;
    removeAllListeners(event?: keyof StorefrontEvents): void;
    listenerCount(event: keyof StorefrontEvents): number;
    eventNames(): (keyof StorefrontEvents)[];
}
//# sourceMappingURL=events.d.ts.map