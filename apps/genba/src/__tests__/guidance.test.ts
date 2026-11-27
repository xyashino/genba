import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeFs } from '../adapters/fs/node-fs.ts';
import { resolveGuidance } from '../domain/guidance.ts';
import { rulePathsOf } from '../domain/runtime-paths.ts';
import { tempDir } from './support/stub-bin.ts';

const repoWith = (...files: string[]): string => {
  const root = tempDir('guidance');
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), 'rule\n');
  }
  return root;
};

const resolve = (root: string, ...names: string[]) =>
  resolveGuidance(
    createNodeFs(),
    root,
    names.map((name) => rulePathsOf('rules', name)),
  );

describe('listed rules', () => {
  it('gives every file of a folder, nested ones included', async () => {
    const root = repoWith(
      'rules/coding/b.md',
      'rules/coding/a.md',
      'rules/coding/deep/c.md',
      'rules/coding/.hidden',
    );

    await expect(resolve(root, 'coding')).resolves.toEqual({
      files: [
        'rules/coding/a.md',
        'rules/coding/b.md',
        'rules/coding/deep/c.md',
      ],
      missing: [],
    });
  });

  it('gives only the named file, with or without its extension, once', async () => {
    const root = repoWith(
      'rules/git.md',
      'rules/coding/a.md',
      'rules/coding/b.md',
    );

    await expect(
      resolve(root, 'git', 'coding/a', 'coding/a.md'),
    ).resolves.toEqual({
      files: ['rules/git.md', 'rules/coding/a.md'],
      missing: [],
    });
  });

  it('reports an absent rule and an empty folder as missing', async () => {
    const root = repoWith('rules/git.md');
    mkdirSync(join(root, 'rules', 'empty'));

    await expect(resolve(root, 'empty', 'ghost')).resolves.toEqual({
      files: [],
      missing: [
        'rules/empty or rules/empty.md',
        'rules/ghost or rules/ghost.md',
      ],
    });
  });
});
