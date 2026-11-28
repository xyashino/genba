import { importOrdersContract } from '@repo/contracts/orders.contract';
import type { z } from 'zod';
import { resolveOrderDag } from '@repo/line/order';
import { initialSteps } from '../../../domain/schedule.ts';
import type { FactoryContext } from '../../core/context.ts';
import { nowOf } from '../../core/context.ts';
import { InvalidOrderGraph } from '../../core/error-handling.ts';
import { cliProcedure } from '../../core/procedure.ts';

type ImportInput = z.output<typeof importOrdersContract.in.body>;

const orderedOf = (
  incoming: ImportInput['orders'],
  known: ReadonlySet<string>,
): ImportInput['orders'] => {
  const bySlug = new Map(incoming.map((order) => [order.slug, order]));
  try {
    // A parent that is already stored does not take part in this batch's graph.
    return resolveOrderDag(
      incoming.map((order) => ({
        ...order,
        parentSlug:
          order.parentSlug !== null && known.has(order.parentSlug)
            ? null
            : order.parentSlug,
        status: 'queued',
      })),
    ).ordered.map((order) => bySlug.get(order.slug)!);
  } catch (error) {
    throw new InvalidOrderGraph(
      error instanceof Error ? error.message : 'invalid order graph',
    );
  }
};

const importOrders = (
  context: FactoryContext,
  { orders }: ImportInput,
): { imported: number; skipped: number } => {
  const known = new Set(context.store.listOrders().map((order) => order.slug));
  const incoming = orders.filter((order) => !known.has(order.slug));
  const ordered = orderedOf(incoming, known).map((order) => ({
    order,
    steps: initialSteps(context.lineOf(order.line)),
  }));
  const at = nowOf(context);
  context.store.transaction(() => {
    for (const { order, steps } of ordered) {
      const id = context.newId('ord');
      context.store.insertOrder(
        {
          ...order,
          id,
          status: 'queued',
          prUrl: null,
          prNumber: null,
          prOutcome: null,
          resetWorktree: false,
          createdAt: at,
          updatedAt: at,
          startedAt: null,
          deliveredAt: null,
          mergedAt: null,
        },
        steps.map((step) => ({
          ...step,
          id: context.newId('step'),
          orderId: id,
          startedAt: null,
          finishedAt: null,
        })),
      );
    }
  });
  for (const { order } of ordered) {
    context.publish({
      type: 'order',
      at,
      order: order.slug,
      status: 'queued',
    });
  }
  return { imported: ordered.length, skipped: orders.length - incoming.length };
};

export const importOrdersProcedure = cliProcedure(importOrdersContract)(
  ({ body }, ctx) => ({ code: 200 as const, ...importOrders(ctx, body) }),
);
