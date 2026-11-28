import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { EXIT } from '../../../domain/exit-codes.ts';
import { WORKTREES_DIR } from '@repo/line/runtime-paths';
import type { CliDeps } from '../context.ts';
import { CliError, manifestOf, repoRootOf } from '../context.ts';

const ID_BYTES = 4;
const TEST_PR_TITLE = 'test(genba): test PR to delete';

const testPrBodyOf = (branch: string): string =>
  `Smoke-test PR created by \`genba test pr\` to verify git author identity, push, and forge PR creation.\n\nSafe to close and delete branch \`${branch}\`.`;

/** Opens a real smoke-test PR on `test/genba-<id>` skipping git hooks, then cleans up locally. */
export const runTestPr = async (
  deps: CliDeps,
  { json }: { json: boolean },
): Promise<number> => {
  const root = await repoRootOf(deps);
  const manifest = await manifestOf(deps, root);
  if ((await deps.git.remoteUrl(root)) === null) {
    throw new CliError('origin remote is missing');
  }
  if (!(await deps.git.hasAuthorIdentity(root))) {
    throw new CliError(
      'git author identity is not configured (run git config --global user.name and user.email)',
    );
  }
  const id = randomBytes(ID_BYTES).toString('hex');
  const branch = `test/genba-${id}`;
  const worktree = join(root, WORKTREES_DIR, `test-genba-${id}`);
  await deps.git.excludeLocally(root, `${WORKTREES_DIR}/`);
  await deps.git.worktreeAdd(root, worktree, branch, manifest.git.baseBranch);
  try {
    await deps.git.commitAll(worktree, TEST_PR_TITLE, true);
    await deps.git.push(worktree, branch);
    const pr = await deps.forgeOf(manifest).publishPr({
      cwd: worktree,
      branch,
      baseBranch: manifest.git.baseBranch,
      title: TEST_PR_TITLE,
      body: testPrBodyOf(branch),
      draft: false,
    });
    deps.out(
      json
        ? JSON.stringify(
            {
              url: pr.url,
              number: pr.number,
              branch,
              title: TEST_PR_TITLE,
            },
            null,
            2,
          )
        : `opened ${pr.url} (branch ${branch})`,
    );
    return EXIT.ok;
  } finally {
    await deps.git.worktreeRemove(root, worktree).catch(() => undefined);
    await deps.git.deleteBranch(root, branch).catch(() => undefined);
  }
};
