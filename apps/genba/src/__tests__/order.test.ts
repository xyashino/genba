import { describe, expect, it } from 'vitest';
import { parseOrderMarkdown, resolveOrderDag } from '../domain/order.ts';

describe('Order markdown parser and single-parent DAG', () => {
  it('parses frontmatter, heading title, depends_on, and default line', () => {
    const order = parseOrderMarkdown(
      'add-auth',
      `---
priority: high
depends_on: add-users
plan: auth-v1
---

# Add OAuth login

Support GitHub OAuth.
`,
    );

    expect(order).toEqual({
      slug: 'add-auth',
      title: 'Add OAuth login',
      body: '# Add OAuth login\n\nSupport GitHub OAuth.',
      line: 'standard',
      priority: 'high',
      parentSlug: 'add-users',
      planId: 'auth-v1',
      status: 'queued',
    });
  });

  it('orders a stacked single-parent DAG topologically from roots to children', () => {
    const child = parseOrderMarkdown(
      'add-ui',
      '---\ndepends_on: add-api\n---\n# UI',
    );
    const root = parseOrderMarkdown('add-db', '# DB');
    const mid = parseOrderMarkdown(
      'add-api',
      '---\ndepends_on: add-db\n---\n# API',
    );

    const dag = resolveOrderDag([child, root, mid]);
    expect(dag.ordered.map((order) => order.slug)).toEqual([
      'add-db',
      'add-api',
      'add-ui',
    ]);
    expect(dag.roots.map((order) => order.slug)).toEqual(['add-db']);
  });

  it('rejects duplicate slugs, missing parents, self-links, and cycles', () => {
    const a = parseOrderMarkdown('a', '---\ndepends_on: b\n---\n# A');
    const b = parseOrderMarkdown('b', '---\ndepends_on: a\n---\n# B');
    const missing = parseOrderMarkdown('c', '---\ndepends_on: ghost\n---\n# C');
    const self = parseOrderMarkdown('d', '---\ndepends_on: d\n---\n# D');

    expect(() => resolveOrderDag([a, b])).toThrow(/cycle/i);
    expect(() => resolveOrderDag([missing])).toThrow(/missing parent/i);
    expect(() => resolveOrderDag([self])).toThrow(/depend on itself/i);
    expect(() => resolveOrderDag([a, a])).toThrow(/duplicate/i);
  });
});
