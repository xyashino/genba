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

  it('lists the files each role must read and rejects names that leave the folder', () => {
    const planner = parseRole(BUILTIN_ROLES.planner);

    expect(
      guidanceOf(planner, { rules: 'docs/rules', skills: '.agents/skills' }),
    ).toEqual({
      rules: ['coding', 'testing', 'typescript'].map((name) => [
        `docs/rules/${name}`,
        `docs/rules/${name}.md`,
      ]),
      skills: [['.agents/skills/caveman/SKILL.md']],
    });
    expect(() =>
      parseRole('---\nid: x\nstage: runtime\nrules: [../secrets]\n---\nbody\n'),
    ).toThrow('inside the rules folder');
  });

  it('writes into a role only the rules and skills the repo has', () => {
    const written = templateAssets({
      project: { setup: [], verify: [] },
      runner: 'claude',
      hasOrigin: false,
      has: (path) => path === '.agents/rules/testing.md',
    }).find((asset) => asset.path === '.genba/roles/planner.md');

    expect(
      guidanceOf(parseRole(written!.text), {
        rules: '.agents/rules',
        skills: '.agents/skills',
      }),
    ).toEqual({
      rules: [['.agents/rules/testing', '.agents/rules/testing.md']],
      skills: [],
    });
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
