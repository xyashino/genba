import { slugSchema } from '@repo/contract-kit/fields';
import { orderPrioritySchema } from '@repo/contracts/enums';
import type { OrderPriority } from '@repo/contracts/enums';
import { parse } from 'yaml';
import { z } from 'zod';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const HEADING = /^#\s+(.+?)\s*$/m;

const frontmatterSchema = z.object({
  title: z.string().trim().min(1).optional(),
  line: z.string().trim().min(1).optional(),
  priority: orderPrioritySchema.default('medium'),
  depends_on: slugSchema.optional(),
  parent: slugSchema.optional(),
  plan: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
});

export type ParsedOrder = {
  slug: string;
  title: string;
  body: string;
  line: string;
  priority: OrderPriority;
  parentSlug: string | null;
  planId: string | null;
  status: string;
};

export type OrderDag = {
  ordered: ParsedOrder[];
  roots: ParsedOrder[];
  childrenByParent: Map<string, ParsedOrder[]>;
};

export const parseOrderMarkdown = (
  rawSlug: string,
  source: string,
  defaultLine = 'standard',
): ParsedOrder => {
  const slug = slugSchema.parse(rawSlug);
  const normalized = source.replaceAll('\r\n', '\n');
  const match = FRONTMATTER.exec(normalized);
  const meta = frontmatterSchema.parse(
    match ? (parse(match[1] ?? '') ?? {}) : {},
  );
  const body = (match ? (match[2] ?? '') : normalized).trim();
  const title = meta.title ?? HEADING.exec(body)?.[1] ?? slug;

  return {
    slug,
    title,
    body,
    line: meta.line ?? defaultLine,
    priority: meta.priority,
    parentSlug: meta.depends_on ?? meta.parent ?? null,
    planId: meta.plan ?? null,
    status: meta.status ?? 'queued',
  };
};

export const resolveOrderDag = (orders: readonly ParsedOrder[]): OrderDag => {
  const bySlug = new Map<string, ParsedOrder>();
  for (const order of orders) {
    if (bySlug.has(order.slug)) {
      throw new Error(`duplicate order slug "${order.slug}"`);
    }
    bySlug.set(order.slug, order);
  }

  const childrenByParent = new Map<string, ParsedOrder[]>();
  const roots: ParsedOrder[] = [];

  for (const order of orders) {
    if (order.parentSlug === null) {
      roots.push(order);
      continue;
    }
    if (order.parentSlug === order.slug) {
      throw new Error(`order "${order.slug}" cannot depend on itself`);
    }
    if (!bySlug.has(order.parentSlug)) {
      throw new Error(
        `order "${order.slug}" depends on missing parent "${order.parentSlug}"`,
      );
    }
    const siblings = childrenByParent.get(order.parentSlug) ?? [];
    siblings.push(order);
    childrenByParent.set(order.parentSlug, siblings);
  }

  const ordered: ParsedOrder[] = [];
  const visited = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    visited.add(current.slug);
    ordered.push(current);
    for (const child of childrenByParent.get(current.slug) ?? []) {
      queue.push(child);
    }
  }

  if (visited.size !== orders.length) {
    const stuck = orders
      .filter((order) => !visited.has(order.slug))
      .map((order) => order.slug);
    throw new Error(`order dependency cycle detected: ${stuck.join(', ')}`);
  }

  return { ordered, roots, childrenByParent };
};
