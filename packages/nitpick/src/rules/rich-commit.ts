import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePrompt, renderPrompt } from '@repo/prompt/prompt';
import type { RuleUnit } from '../config.js';

export const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];
const BULLET = /^\s*- \S/;
const FOOTER =
  /^(\s*- )?\s*(co-authored-by|signed-off-by|reviewed-by|acked-by|refs?|fixes|closes|resolves|breaking[ -]change|generated (with|by))\b|🤖/i;
const SESSION_TRAILER =
  /^Claude-Session: https:\/\/claude\.ai\/code\/session_[\w-]+$/;
const TYPES_TEXT = COMMIT_TYPES.join(', ');
const FIX = renderPrompt(
  parsePrompt(
    readFileSync(new URL('rich-commit-fix.md', import.meta.url), 'utf8'),
  ),
  { inputs: { types: TYPES_TEXT } },
).trim();

export const validateRichCommit = (
  message: string,
  { types }: { types: string[] },
): string[] => {
  const subjectPattern = new RegExp(
    String.raw`^(${types.join('|')})\([^()\s]+\)!?: \S.*$`,
  );
  const lines = message.replaceAll('\r\n', '\n').trimEnd().split('\n');
  if (SESSION_TRAILER.test(lines.at(-1) as string)) {
    lines.pop();
    if (lines.at(-1) === '') lines.pop();
  }
  const [subject = '', blank, ...body] = lines;
  const problems: string[] = [];

  if (!subjectPattern.test(subject)) {
    problems.push(`Subject must be "type(scope)!: title", found "${subject}"`);
  }
  if (blank === undefined) {
    problems.push('Body with a "- " change list is required');
    return problems;
  }
  if (blank !== '') problems.push('Blank line required after subject');
  if (!body.some((line) => line.startsWith('- '))) {
    problems.push('Body must contain a "- " change list');
  }
  for (const line of body) {
    if (FOOTER.test(line)) {
      problems.push(
        `Footer, trailer, reference or credit not allowed, found "${line}"`,
      );
    } else if (line === '') {
      problems.push('Blank line not allowed inside the change list');
    } else if (!BULLET.test(line)) {
      problems.push(
        `Only "- " list items are allowed after the subject, found "${line}"`,
      );
    }
  }

  return problems;
};

export const richCommit: RuleUnit = {
  importance: 'A',
  fix: FIX,
  doc: {
    file: fileURLToPath(new URL('rich-commit.md', import.meta.url)),
    inputs: { types: TYPES_TEXT },
  },
  run: ({ git, report }) => {
    for (const message of git.commitMessages)
      for (const problem of validateRichCommit(message, {
        types: COMMIT_TYPES,
      }))
        report(problem);
  },
};
