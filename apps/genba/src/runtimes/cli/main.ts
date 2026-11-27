import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createForgeRouter } from '../../adapters/forge/router.ts';
import { createNodeFs } from '../../adapters/fs/node-fs.ts';
import { createGitAdapter } from '../../adapters/git/git.ts';
import { selfCommand } from '../../adapters/process/self.ts';
import { createProcessAdapter } from '../../adapters/process/spawn.ts';
import { createRunnerCatalog } from '../../adapters/runners/catalog.ts';
import { EXIT } from '../../domain/exit-codes.ts';
import { PORT_ENV, portOf } from '../../domain/runtime-paths.ts';
import {
  ApiError,
  ApiUnreachableError,
} from '../../ports/loopback-api.port.ts';
import { runDoctor } from './commands/doctor.ts';
import { runIncidentList, runIncidentResolve } from './commands/incidents.ts';
import { runInit } from './commands/init.ts';
import {
  runCancel,
  runImport,
  runOrder,
  runQueue,
  runRun,
} from './commands/orders.ts';
import { runScale, runStart, runStop, runWatch } from './commands/daemon.ts';
import { runWatchFull } from './commands/watch-full.ts';
import { runOnce } from '../standalone/main.ts';
import type { CliDeps } from './context.ts';
import { CliError } from './context.ts';

const USAGE = `usage: genba <command>
  init [--force]               detect the repo and write .genba/config.json
  doctor [--json]              check config, runners, forge login, daemon
  start [cells]                start the daemon with N cells
  scale <cells>                change the number of cells
  stop                         stop cells and the daemon
  import <file|dir>...         queue order markdown files
  run <order.md>               queue one order and follow it to the end
  run <order.md> --once        run it here: no daemon, no queue
  queue [--json]               list orders
  order <slug> [--json]        show one order
  order cancel <slug>          cancel an order
  incident [--all] [--json]    list open incidents
  incident resolve <id> <resolution> [--step <station>] [--diagnosis <text>]
  watch [--json]               stream daemon events
  watch --full [--cell <name>] [--order <slug>]
                               Cell history in detail, then live
  operator <verb>              used by agents inside a station`;

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      force: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      once: { type: 'boolean', default: false },
      cell: { type: 'string' },
      order: { type: 'string' },
      all: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      step: { type: 'string' },
      diagnosis: { type: 'string' },
    },
  });

const depsOf = (): CliDeps => {
  const processes = createProcessAdapter();
  const git = createGitAdapter(processes);
  return {
    cwd: process.cwd(),
    port: portOf(process.env[PORT_ENV]),
    selfCommand: selfCommand(),
    fs: createNodeFs(),
    readTextIfPresent: (path) =>
      existsSync(path) ? readFileSync(path, 'utf8') : undefined,
    git,
    process: processes,
    catalog: createRunnerCatalog(),
    forgeOf: (manifest) =>
      createForgeRouter({
        process: processes,
        git,
        config: { provider: manifest.git.provider, host: manifest.git.host },
      }),
    out: (text) => console.log(text),
    err: (text) => console.error(text),
  };
};

const route = (
  deps: CliDeps,
  { values, positionals }: ReturnType<typeof parse>,
): Promise<number> | null => {
  const [command, first, second, third] = positionals;
  const { json } = values;
  switch (command) {
    case 'init':
      return runInit(deps, { force: values.force });
    case 'doctor':
      return runDoctor(deps, { json });
    case 'start':
      return runStart(deps, first);
    case 'scale':
      return first === undefined ? null : runScale(deps, first);
    case 'stop':
      return runStop(deps);
    case 'import':
      return first === undefined ? null : runImport(deps, positionals.slice(1));
    case 'run':
      if (first === undefined) return null;
      return values.once ? runOnce(deps, first) : runRun(deps, first);
    case 'queue':
      return runQueue(deps, { json });
    case 'order':
      if (first === 'cancel') {
        return second === undefined ? null : runCancel(deps, second);
      }
      return first === undefined ? null : runOrder(deps, first, { json });
    case 'incident':
      if (first === 'resolve') {
        return second === undefined || third === undefined
          ? null
          : runIncidentResolve(deps, second, third, {
              step: values.step,
              diagnosis: values.diagnosis,
            });
      }
      return first === undefined || first === 'list'
        ? runIncidentList(deps, { all: values.all, json })
        : null;
    case 'watch': {
      const { full, cell, order } = values;
      if (full) return json ? null : runWatchFull(deps, { cell, order });
      return cell === undefined && order === undefined
        ? runWatch(deps, { json })
        : null;
    }
    default:
      return null;
  }
};

export const runCli = async (argv: readonly string[]): Promise<number> => {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    console.error(
      `${error instanceof Error ? error.message : error}\n${USAGE}`,
    );
    return EXIT.argument;
  }
  if (parsed.values.help) {
    console.log(USAGE);
    return EXIT.ok;
  }
  try {
    const result = route(depsOf(), parsed);
    if (result === null) {
      console.error(USAGE);
      return EXIT.argument;
    }
    return await result;
  } catch (error) {
    if (error instanceof ApiUnreachableError) {
      console.error(error.message);
      return EXIT.unreachable;
    }
    if (error instanceof CliError || error instanceof ApiError) {
      console.error(error.message);
      return EXIT.refused;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT.refused;
  }
};
