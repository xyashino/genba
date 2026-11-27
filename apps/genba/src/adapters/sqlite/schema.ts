import {
  INCIDENT_REASONS,
  INCIDENT_RESOLUTIONS,
  JOB_STATUSES,
  MODEL_TIERS,
  ORDER_PRIORITIES,
  ORDER_STATUSES,
  PR_OUTCOMES,
  STEP_STATUSES,
  TRIAGE_OWNERS,
} from '@repo/contracts/enums';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Column names follow the wire contracts; timestamps stay ISO text as sent.
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    line: text('line').notNull(),
    priority: text('priority', { enum: ORDER_PRIORITIES }).notNull(),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    parentSlug: text('parent_slug'),
    planId: text('plan_id'),
    prUrl: text('pr_url'),
    prNumber: integer('pr_number'),
    prOutcome: text('pr_outcome', { enum: PR_OUTCOMES }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    startedAt: text('started_at'),
    deliveredAt: text('delivered_at'),
    mergedAt: text('merged_at'),
  },
  (table) => [
    uniqueIndex('orders_slug_unique').on(table.slug),
    index('orders_status_index').on(table.status),
  ],
);

export const orderSteps = sqliteTable(
  'order_steps',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    stationId: text('station_id').notNull(),
    status: text('status', { enum: STEP_STATUSES }).notNull(),
    attemptsUsed: integer('attempts_used').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (table) => [index('order_steps_order_index').on(table.orderId)],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    stepId: text('step_id')
      .notNull()
      .references(() => orderSteps.id, { onDelete: 'cascade' }),
    cellId: text('cell_id').notNull(),
    stationId: text('station_id').notNull(),
    attempt: integer('attempt').notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull(),
    runner: text('runner'),
    model: text('model'),
    tier: text('tier', { enum: MODEL_TIERS }),
    durationMs: integer('duration_ms'),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (table) => [
    index('jobs_order_index').on(table.orderId),
    index('jobs_started_index').on(table.startedAt),
  ],
);

export const incidents = sqliteTable(
  'incidents',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    stepId: text('step_id').references(() => orderSteps.id, {
      onDelete: 'set null',
    }),
    reason: text('reason', { enum: INCIDENT_REASONS }).notNull(),
    triageOwner: text('triage_owner', { enum: TRIAGE_OWNERS }).notNull(),
    summary: text('summary').notNull(),
    diagnosis: text('diagnosis'),
    issueUrl: text('issue_url'),
    draftPrUrl: text('draft_pr_url'),
    resolution: text('resolution', { enum: INCIDENT_RESOLUTIONS }),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
  },
  (table) => [index('incidents_order_index').on(table.orderId)],
);

export const schema = { orders, orderSteps, jobs, incidents };
