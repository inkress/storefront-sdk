import type { StorefrontEvents } from './types';

export type EventHandler<T = any> = (data: T) => void;

/**
 * Simple event emitter for SDK events
 */
export class EventEmitter {
  private events: Map<string, Set<EventHandler>> = new Map();

  on<K extends keyof StorefrontEvents>(
    event: K, 
    handler: EventHandler<StorefrontEvents[K]>
  ): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    
    this.events.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  off<K extends keyof StorefrontEvents>(
    event: K, 
    handler: EventHandler<StorefrontEvents[K]>
  ): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.events.delete(event);
      }
    }
  }

  emit<K extends keyof StorefrontEvents>(
    event: K, 
    data: StorefrontEvents[K]
  ): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  once<K extends keyof StorefrontEvents>(
    event: K, 
    handler: EventHandler<StorefrontEvents[K]>
  ): void {
    const onceHandler = (data: StorefrontEvents[K]) => {
      handler(data);
      this.off(event, onceHandler);
    };
    
    this.on(event, onceHandler);
  }

  removeAllListeners(event?: keyof StorefrontEvents): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  listenerCount(event: keyof StorefrontEvents): number {
    const handlers = this.events.get(event);
    return handlers ? handlers.size : 0;
  }

  eventNames(): (keyof StorefrontEvents)[] {
    return Array.from(this.events.keys()) as (keyof StorefrontEvents)[];
  }
}
