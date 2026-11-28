import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { StorePort } from '../../application/ports/store.port.ts';
import { openGenbaDb } from '../../db/client.ts';
import { incidents, jobs, orderSteps, orders } from '../../db/schema.ts';

const ACTIVE = ['claimed', 'running'] as const;

export const createSqliteStore = (sqlitePath: string): StorePort => {
  const db = openGenbaDb(sqlitePath);
  const inserted = sql`rowid`;
  return {
    transaction: (work) =>
      db.transaction(() => work(), { behavior: 'immediate' }),
    listOrders: () => db.select().from(orders).orderBy(inserted).all(),
    findOrder: (key) =>
      db
        .select()
        .from(orders)
        .where(or(eq(orders.id, key), eq(orders.slug, key)))
        .get(),
    insertOrder: (order, steps) => {
      db.insert(orders).values(order).run();
      for (const step of steps) db.insert(orderSteps).values(step).run();
    },
    updateOrder: (id, patch) => {
      db.update(orders).set(patch).where(eq(orders.id, id)).run();
    },
    stepsOf: (orderId) =>
      db
        .select()
        .from(orderSteps)
        .where(eq(orderSteps.orderId, orderId))
        .orderBy(inserted)
        .all(),
    insertStep: (step) => {
      db.insert(orderSteps).values(step).run();
    },
    updateStep: (id, patch) => {
      db.update(orderSteps).set(patch).where(eq(orderSteps.id, id)).run();
    },
    jobsOf: (orderId) =>
      db
        .select()
        .from(jobs)
        .where(eq(jobs.orderId, orderId))
        .orderBy(inserted)
        .all(),
    activeJobs: () =>
      db
        .select()
        .from(jobs)
        .where(inArray(jobs.status, [...ACTIVE]))
        .all(),
    findJob: (id) => db.select().from(jobs).where(eq(jobs.id, id)).get(),
    insertJob: (job) => {
      db.insert(jobs).values(job).run();
    },
    updateJob: (id, patch) => {
      db.update(jobs).set(patch).where(eq(jobs.id, id)).run();
    },
    listIncidents: () => db.select().from(incidents).orderBy(inserted).all(),
    findIncident: (id) =>
      db.select().from(incidents).where(eq(incidents.id, id)).get(),
    openIncidentOf: (orderId) =>
      db
        .select()
        .from(incidents)
        .where(
          and(eq(incidents.orderId, orderId), isNull(incidents.resolvedAt)),
        )
        .orderBy(desc(inserted))
        .get(),
    insertIncident: (incident) => {
      db.insert(incidents).values(incident).run();
    },
    updateIncident: (id, patch) => {
      db.update(incidents).set(patch).where(eq(incidents.id, id)).run();
    },
    close: () => {
      db.$client.close();
    },
  };
};
