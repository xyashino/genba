import { describe, expect, it } from 'vitest';
import { parseRole, renderRole } from '@repo/cell/domain/role';
import { templateAssets } from '../builtin/assets.ts';
import { BUILTIN_ROLES } from '../builtin/registry.ts';

describe('Built-in ROLE.md contracts', () => {
  it('parses all built-in runtime roles and renders builder prompt via @repo/prompt', () => {
    for (const [id, source] of Object.entries(BUILTIN_ROLES)) {
      const role = parseRole(source);
      expect(role.prompt.id).toBe(id);
      expect(role.prompt.stage).toBe('runtime');
    }

    const builder = parseRole(BUILTIN_ROLES.builder);
    const rendered = renderRole(builder, {
      order: 'Add /health endpoint',
      checks: 'bun run ci:verify',
      feedback: 'None',
      lessons: 'No raw px',
      operatorCommand: 'genba operator',
    });
    expect(rendered).toContain('Add /health endpoint');
    expect(rendered).toContain('genba operator done');
  });

  it('writes only line files on init so repos inherit built-in roles by default', () => {
    const written = templateAssets({
      project: { setup: [], verify: [] },
      runner: 'claude',
      hasOrigin: false,
    });

    expect(written.map((asset) => asset.path).sort()).toEqual([
      '.genba/lines/fast.yml',
      '.genba/lines/feature.yml',
      '.genba/lines/standard.yml',
    ]);
  });
});
