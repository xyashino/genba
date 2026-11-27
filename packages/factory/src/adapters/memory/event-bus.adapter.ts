import type { FactoryEvent } from '../../application/core/context.ts';
import type { EventBus } from '../../application/ports/event-bus.port.ts';

export const createEventBus = (): EventBus => {
  const listeners = new Set<(event: FactoryEvent) => void>();
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
