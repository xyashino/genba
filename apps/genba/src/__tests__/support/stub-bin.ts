import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const tempDir = (prefix: string): string =>
  mkdtempSync(join(tmpdir(), `genba-${prefix}-`));

/** Installs a support script as an executable named like the CLI it stands in for. */
export const installStub = (script: string, binary: string): string => {
  const dir = tempDir('bin');
  const source = fileURLToPath(new URL(script, import.meta.url));
  const path = join(dir, binary);
  writeFileSync(
    path,
    `#!/bin/sh\nexec "${process.execPath}" "${source}" ${binary} "$@"\n`,
  );
  chmodSync(path, 0o755);
  return dir;
};
