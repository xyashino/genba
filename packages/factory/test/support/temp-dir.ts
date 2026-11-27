import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const tempDir = (prefix: string): string =>
  mkdtempSync(join(tmpdir(), `genba-${prefix}-`));
