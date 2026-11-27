import type { z } from 'zod';
import { ForgeError } from '../../ports/forge.port.js';
import type { ForgeRef } from '../../ports/forge.port.js';
import type { ProcessPort } from '../../ports/process.port.js';

export const ANDON_LABEL = {
  name: 'genba:andon',
  color: 'D93F0B',
  description: 'Genba escalation waiting for a human',
} as const;

// Hidden in the issue body so a later escalation of the same order finds its issue.
export const andonMarkerOf = (orderSlug: string): string =>
  `<!-- genba:andon:${orderSlug} -->`;

export const andonBodyOf = (orderSlug: string, body: string): string =>
  `${body}\n\n${andonMarkerOf(orderSlug)}`;

export const runForgeCli = async (
  process: ProcessPort,
  binary: string,
  args: readonly string[],
  cwd: string,
): Promise<string> => {
  const result = await process.run(binary, args, cwd);
  if (result.exitCode !== 0) {
    // Only the subcommand is named: the full argv carries whole PR and issue bodies.
    throw new ForgeError(
      `${binary} ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
};

export const parseForgeJson = <T>(
  schema: z.ZodType<T>,
  stdout: string,
  source: string,
): T => {
  try {
    return schema.parse(JSON.parse(stdout));
  } catch {
    throw new ForgeError(`${source} returned output genba cannot read`);
  }
};

export const createdRefOf = (
  stdout: string,
  pattern: RegExp,
  source: string,
): ForgeRef => {
  const match = pattern.exec(stdout);
  if (match === null) {
    throw new ForgeError(`${source} printed no URL`);
  }
  return { url: match[0], number: Number(match[1]) };
};
