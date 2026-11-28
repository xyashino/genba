import type { Incident } from '@repo/contracts/incidents.contract';
import type { Job } from '@repo/contracts/jobs.contract';
import type { OrderStep, WorkOrder } from '@repo/contracts/orders.contract';

export type StoredOrder = WorkOrder & { resetWorktree: boolean };

export type StoredStep = OrderStep & { feedback: string | null };

export type StoredJob = Job & { summary: string | null };

export type StorePort = {
  /** all-or-nothing: a throw rolls back every write made inside */
  transaction<T>(work: () => T): T;
  listOrders(): StoredOrder[];
  /** by id or slug */
  findOrder(key: string): StoredOrder | undefined;
  insertOrder(order: StoredOrder, steps: readonly StoredStep[]): void;
  updateOrder(id: string, patch: Partial<StoredOrder>): void;
  stepsOf(orderId: string): StoredStep[];
  insertStep(step: StoredStep): void;
  updateStep(id: string, patch: Partial<StoredStep>): void;
  jobsOf(orderId: string): StoredJob[];
  activeJobs(): StoredJob[];
  findJob(id: string): StoredJob | undefined;
  insertJob(job: StoredJob): void;
  updateJob(id: string, patch: Partial<StoredJob>): void;
  /** oldest first */
  listIncidents(): Incident[];
  findIncident(id: string): Incident | undefined;
  /** the order's newest unresolved incident */
  openIncidentOf(orderId: string): Incident | undefined;
  insertIncident(incident: Incident): void;
  updateIncident(id: string, patch: Partial<Incident>): void;
  close(): void;
};
