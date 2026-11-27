import { describe, expect, it } from 'vitest';
import { BUILTIN_ROLES } from '../builtin/registry.js';
import { parseRole, renderRole, validateRoleGuards } from '../domain/role.js';

describe('Built-in ROLE.md contracts and live guards', () => {
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
      rules: 'Strict TypeScript',
      feedback: 'None',
      lessons: 'No raw px',
      operatorCommand: 'genba operator',
    });
    expect(rendered).toContain('Add /health endpoint');
    expect(rendered).toContain('genba operator done');
  });

  it('enforces requireDiff, forbidPaths, required headings, and conventional commit format', () => {
    const builder = parseRole(BUILTIN_ROLES.builder);

    const violations = validateRoleGuards(builder, {
      changedPaths: [],
      outputs: {
        'report.md': '## Changes\n- Added endpoint\n',
        'commit.txt': 'bad subject line\n',
      },
    });
    expect(violations).toEqual([
      'role "builder" requires repository changes but diff is empty',
      'output "report.md" missing required heading "Checks"',
      'output "commit.txt" first line must be conventional "type(scope): title"',
    ]);

    const clean = validateRoleGuards(builder, {
      changedPaths: ['src/health.ts'],
      outputs: {
        'report.md':
          '## Changes\n- Added health\n## Checks\n- ci:verify passed\n',
        'commit.txt': 'feat(api): add health endpoint\n\n- Add /health route\n',
      },
    });
    expect(clean).toEqual([]);
  });

  it('rejects repository modifications from read-only roles and forbidden paths', () => {
    const doctor = parseRole(BUILTIN_ROLES.doctor);

    const violations = validateRoleGuards(doctor, {
      changedPaths: ['.git/config', 'src/app.ts'],
      outputs: {
        'audit.md': '## Verdict\nPass\n## Findings\nNone\n',
      },
    });
    expect(violations).toEqual([
      'read-only role "doctor" modified repository files: .git/config, src/app.ts',
      'path ".git/config" is forbidden by pattern ".git/**"',
    ]);
  });
});
