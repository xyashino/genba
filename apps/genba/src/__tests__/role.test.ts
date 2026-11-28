import { describe, expect, it } from 'vitest';
import { BUILTIN_ROLES } from '../builtin/registry.ts';
import { templateAssets } from '../builtin/assets.ts';
import {
  guidanceOf,
  parseRole,
  renderRole,
  validateRoleGuards,
} from '../domain/role.ts';

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
      feedback: 'None',
      lessons: 'No raw px',
      operatorCommand: 'genba operator',
    });
    expect(rendered).toContain('Add /health endpoint');
    expect(rendered).toContain('genba operator done');
  });

  it('resolves wildcards, globs, and exact names while rejecting path traversal', () => {
    const planner = parseRole(BUILTIN_ROLES.planner);

    expect(
      guidanceOf(planner, { rules: 'docs/rules', skills: '.agents/skills' }),
    ).toEqual({
      rules: [{ kind: 'glob', baseDir: 'docs/rules', pattern: '**' }],
      skills: [
        { kind: 'glob', baseDir: '.agents/skills', pattern: '*/SKILL.md' },
      ],
    });

    const custom = parseRole(
      '---\nid: custom\nstage: runtime\nrules: [coding/**, git]\nskills: [evidence]\n---\nbody\n',
    );
    expect(
      guidanceOf(custom, { rules: 'docs/rules', skills: '.agents/skills' }),
    ).toEqual({
      rules: [
        { kind: 'glob', baseDir: 'docs/rules', pattern: 'coding/**' },
        { kind: 'exact', candidates: ['docs/rules/git', 'docs/rules/git.md'] },
      ],
      skills: [
        { kind: 'exact', candidates: ['.agents/skills/evidence/SKILL.md'] },
      ],
    });

    expect(() =>
      parseRole('---\nid: x\nstage: runtime\nrules: [../secrets]\n---\nbody\n'),
    ).toThrow('inside the rules folder');
  });

  it('inherits inputs, outputs, guards, and body when extending a built-in role', () => {
    const extended = parseRole(
      '---\nid: builder\nstage: runtime\nextends: builtin:builder\nrules: [go-style]\n---\n\n## Repo Notes\nRun go test ./...\n',
      BUILTIN_ROLES,
    );

    expect(extended.config.rules).toEqual(['go-style']);
    expect(extended.config.skills).toEqual(['*']);
    expect(extended.config.guards.requireDiff).toBe(true);
    expect(Object.keys(extended.config.outputs)).toEqual(['report', 'commit']);

    const rendered = renderRole(extended, {
      order: 'Add handler',
      checks: 'go test ./...',
      feedback: 'None',
      lessons: 'None',
      operatorCommand: 'genba operator',
    });
    expect(rendered).toContain('You implement the work order alone.');
    expect(rendered).toContain('Run go test ./...');

    expect(() =>
      parseRole(
        '---\nid: x\nstage: runtime\nextends: builtin:ghost\n---\n',
        BUILTIN_ROLES,
      ),
    ).toThrow('unknown "builtin:ghost"');
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

  it('enforces requireDiff, forbidPaths, and conventional commit format', () => {
    const builder = parseRole(BUILTIN_ROLES.builder);

    const violations = validateRoleGuards(
      builder,
      {
        changedPaths: [],
        outputs: {
          'report.md': '## Changes\n- Added endpoint\n',
          'commit.txt': 'bad subject line\n',
        },
      },
      'write',
    );
    expect(violations).toEqual([
      'role "builder" requires repository changes but diff is empty',
      'output "commit.txt" first line must be conventional "type(scope): title"',
    ]);

    const clean = validateRoleGuards(
      builder,
      {
        changedPaths: ['src/health.ts'],
        outputs: {
          'report.md':
            '## Changes\n- Added health\n## Checks\n- ci:verify passed\n',
          'commit.txt':
            'feat(api): add health endpoint\n\n- Add /health route\n',
        },
      },
      'write',
    );
    expect(clean).toEqual([]);
  });

  it('rejects repository modifications from read-only roles', () => {
    const doctor = parseRole(BUILTIN_ROLES.doctor);

    const violations = validateRoleGuards(
      doctor,
      {
        changedPaths: ['src/app.ts'],
        outputs: {
          'audit.md': '## Verdict\nPass\n## Findings\nNone\n',
        },
      },
      'read',
    );
    expect(violations).toEqual([
      'read-only role "doctor" modified repository files: src/app.ts',
    ]);
  });

  it('requires a heading only when a role asks for one', () => {
    const role = parseRole(
      '---\nid: x\nstage: runtime\noutputs:\n  report:\n    file: report.md\n    requiredHeadings: [Checks]\n---\nbody\n',
    );

    const violations = validateRoleGuards(
      role,
      { changedPaths: [], outputs: { 'report.md': '## Changes\n- one\n' } },
      'write',
    );

    expect(violations).toEqual([
      'output "report.md" missing required heading "Checks"',
    ]);
  });

  it('blocks changed files that match a forbidPaths glob', () => {
    const role = parseRole(
      '---\nid: x\nstage: runtime\nguards:\n  forbidPaths: ["*.env", "**/*.pem", "secrets/*"]\n---\nbody\n',
    );

    const violations = validateRoleGuards(
      role,
      {
        changedPaths: ['prod.env', 'a/key.pem', 'secrets/x', 'src/app.ts'],
        outputs: {},
      },
      'write',
    );

    expect(violations).toHaveLength(3);
  });
});
