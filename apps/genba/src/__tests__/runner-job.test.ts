import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoopbackEndpoint } from '../adapters/operator-endpoint/loopback.js';
import { createRunnerCatalog } from '../adapters/runners/catalog.js';
import { createHeadlessRunner } from '../adapters/runners/headless.js';
import { installStub, tempDir } from './support/stub-bin.js';

describe('runner job', () => {
  it('runs an agent that reports done and leaves its usage in the log', async () => {
    const cwd = tempDir('job');
    writeFileSync(join(cwd, 'prompt.md'), 'build the login form\n');
    const logPath = join(cwd, 'step.log');
    const catalog = createRunnerCatalog();
    const runner = createHeadlessRunner();
    const endpoint = createLoopbackEndpoint();
    const received: unknown[] = [];
    const session = await endpoint.open(async (request) => {
      received.push(request);
      return { code: 200, accepted: true };
    });
    const line = catalog.commandLine('claude', 'prompt.md')!;
    const stub = installStub('./fake-runner.ts', line.command);

    const handle = await runner.start({
      command: join(stub, line.command),
      args: line.args,
      cwd,
      env: session.env,
      logPath,
    });
    const outcome = await runner.wait(handle);
    await endpoint.close();

    expect(outcome.exitCode).toBe(0);
    expect(received).toEqual([
      { verb: 'done', summary: 'build the login form' },
    ]);
    expect(
      catalog.parseUsage('claude', readFileSync(logPath, 'utf8'))?.costUsd,
    ).toBe(0.01);
  });
});
