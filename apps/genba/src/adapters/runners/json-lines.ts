// A run log mixes stdout and stderr, so lines that are not JSON are skipped.
export const jsonLinesOf = (log: string): unknown[] =>
  log.split('\n').flatMap((line): unknown[] => {
    if (!line.trimStart().startsWith('{')) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
