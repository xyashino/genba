// Every branch imports lazily, so `genba operator` never loads the daemon, SQLite, or the CLI.
const runOperatorVerb = async (args: string[]): Promise<number> => {
  const [{ runOperator }, { createOperatorClient }, exits, port] =
    await Promise.all([
      import('./operator/main.ts'),
      import('./operator/client.ts'),
      import('./operator/exit-map.ts'),
      import('@repo/cell/ports/operator.port'),
    ]);
  const url = process.env[port.OPERATOR_URL_ENV];
  const token = process.env[port.CYCLE_TOKEN_ENV];
  if (!url || !token) {
    console.error('genba operator only works inside a station run by a Cell');
    return 3;
  }
  return runOperator(args, {
    client: createOperatorClient({ url, token }),
    exitCodeFor: exits.exitCodeFor,
    errorLineFor: exits.errorLineFor,
    out: (text) => console.log(text),
    err: (text) => console.error(text),
  });
};

const dispatch = async (argv: string[]): Promise<number> => {
  const [command, ...rest] = argv;
  switch (command) {
    case 'operator':
      return runOperatorVerb(rest);
    case '__daemon': {
      const [{ startFactory }, { selfCommand }] = await Promise.all([
        import('@repo/factory/start'),
        import('@repo/host/process/self'),
      ]);
      return startFactory({
        repoRoot: process.cwd(),
        selfCommand: selfCommand(),
        cellVerb: '__cell',
      });
    }
    case '__cell': {
      const { runCell } = await import('@repo/cell/main');
      return runCell(rest[0] ?? '');
    }
    default: {
      const { runCli } = await import('./cli/main.ts');
      return runCli(argv);
    }
  }
};

process.exit(await dispatch(process.argv.slice(2)));
