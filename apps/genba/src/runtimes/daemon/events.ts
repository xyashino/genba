import type { DaemonEvent } from './core/context.ts';

export type EventBus = {
  publish(event: DaemonEvent): void;
  subscribe(listener: (event: DaemonEvent) => void): () => void;
};

export const createEventBus = (): EventBus => {
  const listeners = new Set<(event: DaemonEvent) => void>();
  return {
    publish: (event) => {
      for (const listener of listeners) listener(event);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
