// Bun mounts a compiled binary's own sources under this virtual root.
const COMPILED_ROOT = '/$bunfs/';

/** The argv prefix that starts this same genba again, compiled or from source. */
export const selfCommand = (): string[] =>
  Bun.main.startsWith(COMPILED_ROOT)
    ? [process.execPath]
    : [process.execPath, Bun.main];
