/** Parsed JSON lines of a run log; stderr noise and plain text are skipped. */
export const jsonLinesOf = (log: string): unknown[] =>
  log.split('\n').flatMap((line) => {
    if (!line.startsWith('{')) return [];
    try {
      return [JSON.parse(line) as unknown];
    } catch {
      return [];
    }
  });
