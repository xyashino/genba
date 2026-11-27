import type { FactoryEvent } from '../core/context.ts';

export type EventBus = {
  publish(event: FactoryEvent): void;
  subscribe(listener: (event: FactoryEvent) => void): () => void;
};
