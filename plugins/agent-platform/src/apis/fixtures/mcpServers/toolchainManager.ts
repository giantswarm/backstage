// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  TOOLCHAIN_MANAGER_SERVER,
  TOOLCHAIN_MANAGER_TOOLS,
  type AddSourceInput,
} from '../../../lib/toolchainManager';
import {
  toolchainManagerFixtureState,
  type ToolchainManagerFixtureState,
} from '../toolchainManagerFixtureState';
import { asJson, text } from './jsonTools';

/**
 * toolchain-manager's tools in fixture mode, on `state` (the shared one by
 * default): the toolchains and sources of the data set, and the sources and
 * pull requests a person adds, kept in memory until the page reloads.
 */
export function toolchainManagerFixtureServer(
  state: () => ToolchainManagerFixtureState = toolchainManagerFixtureState,
): FixtureMcpServer {
  const tools: FixtureMcpServer['tools'] = {
    [TOOLCHAIN_MANAGER_TOOLS.listToolchains]: (_, { installation }) =>
      state().listToolchains(installation),
    [TOOLCHAIN_MANAGER_TOOLS.describeToolchain]: (args, { installation }) =>
      state().describeToolchain(installation, {
        name: text(args, 'name'),
        ...(args.source !== undefined && { source: text(args, 'source') }),
        ...(args.version !== undefined && { version: text(args, 'version') }),
      }),
    [TOOLCHAIN_MANAGER_TOOLS.listSources]: (_, { installation }) =>
      state().listSources(installation),
    [TOOLCHAIN_MANAGER_TOOLS.addSource]: (args, { installation }) =>
      state().addSource(installation, args as AddSourceInput),
    [TOOLCHAIN_MANAGER_TOOLS.searchPackages]: args =>
      state().searchPackages(text(args, 'query')),
    [TOOLCHAIN_MANAGER_TOOLS.addPackages]: args =>
      state().addPackages(args as { name: string; packages: string[] }),
    [TOOLCHAIN_MANAGER_TOOLS.createToolchain]: (args, { installation }) =>
      state().createToolchain(installation, {
        dockerfile: text(args, 'dockerfile'),
        name: text(args, 'name'),
        source: text(args, 'source'),
      }),
    [TOOLCHAIN_MANAGER_TOOLS.buildStatus]: (args, { installation }) =>
      state().buildStatus(installation, {
        name: text(args, 'name'),
        source: text(args, 'source'),
        ...(args.pull !== undefined && { pull: Number(args.pull) }),
      }),
  };
  return { server: TOOLCHAIN_MANAGER_SERVER, tools: asJson(tools) };
}

/** toolchain-manager's tools in fixture mode. */
export const toolchainManager: FixtureMcpServer =
  toolchainManagerFixtureServer();
