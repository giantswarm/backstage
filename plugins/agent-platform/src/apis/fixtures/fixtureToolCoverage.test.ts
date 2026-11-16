// Reads the plugin's source to find its tool calls.
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';
// eslint-disable-next-line no-restricted-imports
import path from 'path';

// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import { fixtureToolNames } from '@giantswarm/backstage-plugin-muster/fixtures';

import {
  AGENT_MANAGER_TOOLS,
  agentManagerToolName,
} from '../../lib/agentManager';
import {
  CLUSTER_MANAGER_TOOLS,
  clusterManagerToolName,
} from '../../lib/clusterManager';
import {
  MODEL_MANAGER_TOOLS,
  modelManagerToolName,
} from '../../lib/modelManagerBackends';
import {
  SKILL_MANAGER_TOOLS,
  skillManagerToolName,
} from '../../lib/skillManager';
import {
  TOOLCHAIN_MANAGER_TOOLS,
  toolchainManagerToolName,
} from '../../lib/toolchainManager';
import {
  WORKSPACE_MANAGER_TOOLS,
  workspaceManagerToolName,
} from '../../lib/workspaceManager';
import { agentPlatformFixtureMcpServers } from './mcpServers';

/**
 * The drift guard of fixture mode (docs/fixtures.md): every tool the
 * agent-platform clients call through muster has a fixture handler, so a new
 * tool shows in the pull request that calls it. Each client takes its tool
 * names from its `*_TOOLS` constant (its tool type allows no other), so
 * these constants are every name the clients call.
 */

const SRC = path.resolve(__dirname, '../..');

/** Every tool the clients call, by its full name in muster. */
const CALLED = [
  ...Object.values(AGENT_MANAGER_TOOLS).map(agentManagerToolName),
  ...Object.values(CLUSTER_MANAGER_TOOLS).map(clusterManagerToolName),
  ...Object.values(MODEL_MANAGER_TOOLS).map(modelManagerToolName),
  ...Object.values(SKILL_MANAGER_TOOLS).map(skillManagerToolName),
  ...Object.values(TOOLCHAIN_MANAGER_TOOLS).map(toolchainManagerToolName),
  ...Object.values(WORKSPACE_MANAGER_TOOLS).map(workspaceManagerToolName),
];

/**
 * The tools the clients call that fixture mode does not answer. A call fails
 * with `FixtureToolMissingError` and the page shows the error.
 */
const NOT_SERVED = new Set([
  // Creating and deleting a workload cluster from the Clusters page. The
  // fixture cluster-manager's `get_info` leaves both out of its tools, so the
  // page offers neither action.
  clusterManagerToolName(CLUSTER_MANAGER_TOOLS.createCluster),
  clusterManagerToolName(CLUSTER_MANAGER_TOOLS.deleteCluster),
]);

/**
 * The files that call `musterApi.callTool`, each with a tool type that only
 * the constants above satisfy. A new call site goes here once its tool names
 * are in `CALLED`.
 */
const CALL_SITES = [
  'apis/AgentManagerClient.ts',
  'apis/ClusterManagerClient.ts',
  'apis/ModelManagerToolsClient.ts',
  // SkillManagerClient, ToolchainManagerClient and WorkspaceManagerClient.
  'lib/managerToolCall.ts',
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__fixtures__', 'fixtures'].includes(entry.name)
        ? []
        : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name)
      ? [file]
      : [];
  });
}

/** `musterApi.callTool(…)`, not the `callTool()` of a comment. */
const CALL = /\.callTool(?:WithProgress)?\(\s*[^)\s]/;

describe('fixture mode’s tool handlers', () => {
  it('know every file that calls a tool', () => {
    const callers = sourceFiles(SRC)
      .filter(file => CALL.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(SRC, file))
      .sort();

    expect(callers).toEqual([...CALL_SITES].sort());
  });

  const handled = fixtureToolNames(agentPlatformFixtureMcpServers);

  it('answer every tool the clients call, or list it as not served', () => {
    expect(
      CALLED.filter(tool => !handled.has(tool) && !NOT_SERVED.has(tool)),
    ).toEqual([]);
  });

  it('list nothing as not served that is no longer called or now answered', () => {
    expect(
      [...NOT_SERVED].filter(
        tool => !CALLED.includes(tool) || handled.has(tool),
      ),
    ).toEqual([]);
  });
});
