import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeFs } from '@repo/host/fs/node-fs';
import { resolveGuidance, skillIndexOf } from '../domain/guidance.ts';
import type { GuidanceEntry } from '../domain/guidance.ts';
import { rulePathsOf } from '@repo/line/runtime-paths';
import { tempDir } from './support/stub-bin.ts';

const repoWith = (files: Record<string, string>): string => {
  const root = tempDir('guidance');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
};

const ruleFiles = (...files: string[]): string =>
  repoWith(Object.fromEntries(files.map((file) => [file, 'rule\n'])));

const resolveExact = (root: string, ...names: string[]) =>
  resolveGuidance(
    createNodeFs(),
    root,
    names.map((name): GuidanceEntry => ({
      kind: 'exact',
      candidates: rulePathsOf('rules', name),
    })),
  );

describe('listed rules and skills', () => {
  it('gives every file of a folder, nested ones included', async () => {
    const root = ruleFiles(
      'rules/coding/b.md',
      'rules/coding/a.md',
      'rules/coding/deep/c.md',
      'rules/coding/.hidden',
    );

    await expect(resolveExact(root, 'coding')).resolves.toEqual({
      files: [
        'rules/coding/a.md',
        'rules/coding/b.md',
        'rules/coding/deep/c.md',
      ],
      missing: [],
    });
  });

  it('gives only the named file, with or without its extension, once', async () => {
    const root = ruleFiles(
      'rules/git.md',
      'rules/coding/a.md',
      'rules/coding/b.md',
    );

    await expect(
      resolveExact(root, 'git', 'coding/a', 'coding/a.md'),
    ).resolves.toEqual({
      files: ['rules/coding/a.md', 'rules/git.md'],
      missing: [],
    });
  });

  it('reports an absent exact rule and an empty folder as missing', async () => {
    const root = ruleFiles('rules/git.md');
    mkdirSync(join(root, 'rules', 'empty'));

    await expect(resolveExact(root, 'empty', 'ghost')).resolves.toEqual({
      files: [],
      missing: [
        'rules/empty or rules/empty.md',
        'rules/ghost or rules/ghost.md',
      ],
    });
  });

  it('resolves wildcard and glob rules without failing when folder is absent', async () => {
    const root = ruleFiles(
      'rules/go-style.md',
      'rules/coding/a.md',
      'rules/notes.txt',
    );

    await expect(
      resolveGuidance(createNodeFs(), root, [
        { kind: 'glob', baseDir: 'rules', pattern: '*.md' },
        { kind: 'glob', baseDir: 'rules', pattern: 'coding/**' },
        { kind: 'glob', baseDir: 'nonexistent', pattern: '**' },
      ]),
    ).resolves.toEqual({
      files: ['rules/coding/a.md', 'rules/go-style.md'],
      missing: [],
    });
  });

  it('extracts name and description from SKILL.md frontmatter for the skills index', async () => {
    const root = repoWith({
      'skills/evidence/SKILL.md':
        '---\nname: evidence\ndescription: "Proof that a change works"\n---\nBody\n',
      'skills/plain/SKILL.md': '# Plain skill\n',
    });

    await expect(
      skillIndexOf(createNodeFs(), root, [
        'skills/evidence/SKILL.md',
        'skills/plain/SKILL.md',
      ]),
    ).resolves.toEqual([
      {
        path: 'skills/evidence/SKILL.md',
        name: 'evidence',
        description: 'Proof that a change works',
      },
      { path: 'skills/plain/SKILL.md' },
    ]);
  });
});
