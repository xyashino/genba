import type { RunnerPort } from '../../ports/runner.port.ts';

/** A run that asks for a pane goes to `pane`; every other command stays headless. */
export const createRoutingRunner = (
  headless: RunnerPort,
  pane: RunnerPort,
): RunnerPort => {
  const owners = new Map<string, RunnerPort>();
  const ownerOf = (id: string): RunnerPort => owners.get(id) ?? headless;
  return {
    start: async (spec) => {
      const runner = spec.pane === undefined ? headless : pane;
      const handle = await runner.start(spec);
      owners.set(handle.id, runner);
      return handle;
    },
    abort: (handle) => ownerOf(handle.id).abort(handle),
    wait: (handle) => ownerOf(handle.id).wait(handle),
  };
};
