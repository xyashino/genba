import { Database } from 'bun:sqlite';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { incidentSchema } from '@repo/contracts/incidents.contract';
import type { Incident } from '@repo/contracts/incidents.contract';
import { jobSchema } from '@repo/contracts/jobs.contract';
import {
  orderStepSchema,
  workOrderSchema,
} from '@repo/contracts/orders.contract';
import type { OrderStep, WorkOrder } from '@repo/contracts/orders.contract';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openGenbaDb } from '../adapters/sqlite/db.js';
import {
  incidents,
  jobs,
  orderSteps,
  orders,
} from '../adapters/sqlite/schema.js';
import { tempDir } from './support/stub-bin.js';

const AT = '2026-11-27T10:00:00.000Z';

const order: WorkOrder = {
  id: 'o1',
  slug: 'add-login',
  title: 'Add login',
  body: 'body',
  line: 'standard',
  priority: 'high',
  status: 'merged',
  parentSlug: 'add-users',
  planId: 'auth',
  prUrl: 'https://github.com/acme/app/pull/7',
  prNumber: 7,
  prOutcome: 'merged',
  createdAt: AT,
  updatedAt: AT,
  startedAt: AT,
  deliveredAt: AT,
  mergedAt: AT,
};

const step: OrderStep = {
  id: 's1',
  orderId: 'o1',
  stationId: 'build',
  status: 'passed',
  attemptsUsed: 1,
  maxAttempts: 3,
  startedAt: AT,
  finishedAt: AT,
};

const jobRow = {
  id: 'j1',
  orderId: 'o1',
  stepId: 's1',
  cellId: 'cell-1',
  stationId: 'build',
  attempt: 1,
  status: 'completed' as const,
  runner: 'claude',
  model: 'sonnet',
  tier: 'strong' as const,
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 30,
  cacheWriteTokens: 40,
  costUsd: 0.42,
  durationMs: 1200,
  startedAt: AT,
  finishedAt: AT,
};

const incident: Incident = {
  id: 'i1',
  orderId: 'o1',
  stepId: 's1',
  reason: 'step_retries_exhausted',
  triageOwner: 'supervisor',
  summary: 'gate red',
  diagnosis: 'flaky test',
  issueUrl: 'https://github.com/acme/app/issues/8',
  draftPrUrl: 'https://github.com/acme/app/pull/7',
  resolution: 'escalate',
  createdAt: AT,
  resolvedAt: AT,
};

const dbPath = (): string => join(tempDir('db'), '.genba-local', 'genba.db');

const seeded = (path = dbPath()) => {
  const db = openGenbaDb(path);
  db.insert(orders).values(order).run();
  db.insert(orderSteps).values(step).run();
  db.insert(jobs).values(jobRow).run();
  db.insert(incidents).values(incident).run();
  return db;
};

describe('genba database', () => {
  it('creates a private WAL database in a new folder', () => {
    const path = dbPath();

    openGenbaDb(path);

    const mode = new Database(path).query('PRAGMA journal_mode').get();
    expect(mode).toEqual({ journal_mode: 'wal' });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('round-trips orders, steps, and incidents with forge links', () => {
    const db = seeded();

    expect(workOrderSchema.parse(db.select().from(orders).get())).toEqual(
      order,
    );
    expect(orderStepSchema.parse(db.select().from(orderSteps).get())).toEqual(
      step,
    );
    expect(incidentSchema.parse(db.select().from(incidents).get())).toEqual(
      incident,
    );
  });

  it('keeps job usage and cost telemetry', () => {
    const db = seeded();

    const row = db.select().from(jobs).get()!;

    expect(row).toEqual(jobRow);
    expect(jobSchema.parse({ ...row, usage: row }).usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheWriteTokens: 40,
    });
  });

  it('keeps data when reopened', () => {
    const path = dbPath();
    seeded(path);

    const reopened = openGenbaDb(path);

    expect(reopened.select().from(orders).all()).toHaveLength(1);
  });

  it('refuses a duplicate slug and an orphan job', () => {
    const db = seeded();

    expect(() =>
      db
        .insert(orders)
        .values({ ...order, id: 'o2' })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(jobs)
        .values({ ...jobRow, id: 'j2', orderId: 'nope' })
        .run(),
    ).toThrow();
  });

  it('removes steps, jobs, and incidents with their order', () => {
    const db = seeded();

    db.delete(orders).where(eq(orders.id, 'o1')).run();

    expect(db.select().from(orderSteps).all()).toEqual([]);
    expect(db.select().from(jobs).all()).toEqual([]);
    expect(db.select().from(incidents).all()).toEqual([]);
  });
});
