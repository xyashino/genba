import { createForgeRouter as buildForgeRouter } from './adapters/forge/router.ts';
import { detectForgeRemote as detectRemote } from './adapters/forge/detect.ts';
import { createGitAdapter as buildGitAdapter } from './adapters/git/git.ts';
import { createRunnerCatalog as buildRunnerCatalog } from './adapters/runners/catalog.ts';
import type { ForgePort as Forge } from './ports/forge.port.ts';
import type { GitPort as Git } from './ports/git.port.ts';
import type { RunnerCatalogPort as RunnerCatalog } from './ports/runner.port.ts';

export const createForgeRouter = buildForgeRouter;
export const detectForgeRemote = detectRemote;
export const createGitAdapter = buildGitAdapter;
export const createRunnerCatalog = buildRunnerCatalog;

export type ForgePort = Forge;
export type GitPort = Git;
export type RunnerCatalogPort = RunnerCatalog;
