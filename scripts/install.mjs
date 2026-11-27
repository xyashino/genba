// Installs the compiled binary from `bun run build` into a bin directory on this machine.
import { access, chmod, copyFile, mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WIN = process.platform === 'win32';
const BIN_NAME = WIN ? 'genba.exe' : 'genba';
const DEFAULT_SOURCE = join(ROOT, 'apps/genba/dist');

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

const defaultBinDir = () =>
  WIN
    ? join(
        process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
        'genba',
        'bin',
      )
    : join(homedir(), '.local', 'bin');

const binDirOf = (prefix) => {
  const base = prefix ?? process.env.PREFIX;
  const dir = base ? join(base, 'bin') : defaultBinDir();
  return process.env.DESTDIR ? join(process.env.DESTDIR, dir) : dir;
};

const onPath = (dir) => {
  const same = (a, b) => (WIN ? a.toLowerCase() === b.toLowerCase() : a === b);
  return (process.env.PATH ?? '')
    .split(delimiter)
    .some((entry) => entry !== '' && same(resolve(entry), resolve(dir)));
};

const main = async () => {
  const { values } = parseArgs({
    options: { prefix: { type: 'string' }, source: { type: 'string' } },
  });
  const source = join(values.source ?? DEFAULT_SOURCE, BIN_NAME);
  if (!(await exists(source))) {
    throw new Error(`missing ${source}: run bun run build first`);
  }
  const binDir = binDirOf(values.prefix);
  await mkdir(binDir, { recursive: true });
  const target = join(binDir, BIN_NAME);
  // Rename over the old file: copying onto a running binary fails with ETXTBSY.
  const staged = `${target}.new`;
  await copyFile(source, staged);
  if (!WIN) await chmod(staged, 0o755);
  await rename(staged, target);
  console.log(`installed ${target}`);
  if (!onPath(binDir)) {
    console.log(
      WIN
        ? `add to PATH: $env:Path = "${binDir};" + $env:Path`
        : `add to PATH: export PATH="${binDir}:$PATH"`,
    );
  }
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
