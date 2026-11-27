// Stands in for the `claude` CLI inside a real Cell: does the station's work and reports through `genba operator`.
import { execSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const AGENT_LOG_ENV = 'FAKE_AGENT_LOG';
// Once this file exists, a forced failure stops failing.
export const AGENT_FIXED_ENV = 'FAKE_AGENT_FIXED';

const prompt = process.argv.join(' ');
const promptFile = /Read (\S+) and follow/.exec(prompt)![1]!;
const station = basename(dirname(promptFile));
const text = readFileSync(promptFile, 'utf8');
const operator = /- `(.+ operator) (?:done|verdict pass|incident )/.exec(
  text,
)![1]!;
const output = (file: string, content: string): void => {
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(join(dirname(promptFile), file), content);
};
const record = (entry: Record<string, unknown>): void => {
  const log = process.env[AGENT_LOG_ENV];
  if (log) appendFileSync(log, `${JSON.stringify({ station, ...entry })}\n`);
};
const report = (verb: string): { exitCode: number; stderr: string } => {
  try {
    execSync(`${operator} ${verb}`, { stdio: 'pipe' });
    return { exitCode: 0, stderr: '' };
  } catch (error) {
    const failure = error as { status: number; stderr: Buffer };
    return { exitCode: failure.status, stderr: String(failure.stderr) };
  }
};

const model = process.argv[process.argv.indexOf('--model') + 1];
record({
  event: 'start',
  model,
  rules: [
    ...(/## Rules\n\n[^\n]*\n\n((?:- .*\n?)+)/.exec(text)?.[1] ?? '').matchAll(
      /`([^`]+)`/g,
    ),
  ].map((match) => match[1]),
  genbaEnv: Object.keys(process.env)
    .filter((key) => key.startsWith('GENBA_'))
    .sort(),
});

const log = process.env[AGENT_LOG_ENV] ?? '';
const hungBefore =
  existsSync(log) && readFileSync(log, 'utf8').includes('"event":"hang"');
if (station === 'build' && text.includes('HANG_ONCE') && !hungBefore) {
  // Edits, then never reports: only killing the process group ends it.
  appendFileSync('greeting.txt', 'half done\n');
  record({ event: 'hang', pid: process.pid });
  setInterval(() => undefined, 1_000);
} else if (station === 'build') {
  record({ event: 'early-done', ...report('done') });
  // A forced failure leaves a file that makes `make test` fail on every attempt.
  const broken =
    text.includes('FORCE_FAILURE') &&
    !existsSync(process.env[AGENT_FIXED_ENV] ?? '');
  appendFileSync(
    broken ? 'broken.txt' : 'greeting.txt',
    `hello ${Date.now()}\n`,
  );
  output('report.md', '## Changes\n- greeting\n\n## Checks\n- make test\n');
  output('commit.txt', 'feat(app): add greeting\n');
  record({ event: 'done', ...report('done') });
} else if (station === 'audit') {
  output('audit.md', '## Verdict\npass\n\n## Findings\nnone\n');
  record({ event: 'verdict', ...report('verdict pass') });
} else if (station === 'mechanic') {
  output(
    'diagnosis.md',
    '## Cause\nbroken.txt breaks make test\n\n## Action\nA human must remove it.\n',
  );
  record({ event: 'incident', ...report('incident escalate') });
}
