// eslint-disable-next-line no-restricted-imports
import path from 'path';

// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import {
  fixtureToolCoverage,
  fixtureToolNames,
} from '@giantswarm/backstage-plugin-muster/testUtils';

import {
  CLUSTER_MANAGER_TOOLS,
  clusterManagerToolName,
} from '../../lib/clusterManager';
import { agentPlatformFixtureMcpServers } from './mcpServers';

/**
 * The drift guard of fixture mode (docs/fixtures.md): every tool the
 * agent-platform pages call through muster has a fixture handler, or is
 * listed below with the reason, so a new tool shows in the pull request that
 * calls it.
 */

/**
 * The tools the pages call that fixture mode does not answer. A call fails
 * with `FixtureToolMissingError` and the page shows the error.
 */
const NOT_SERVED = new Set([
  // Creating and deleting a workload cluster from the Clusters page. The
  // fixture cluster-manager's `get_info` leaves both out of its tools, so the
  // page offers neither action.
  clusterManagerToolName(CLUSTER_MANAGER_TOOLS.createCluster),
  clusterManagerToolName(CLUSTER_MANAGER_TOOLS.deleteCluster),
]);

/** The calls whose tool name is only known at runtime: none. */
const UNRESOLVED = new Set<string>();

describe('fixture mode’s tool handlers', () => {
  const report = fixtureToolCoverage({
    srcDir: path.resolve(__dirname, '../..'),
    handled: fixtureToolNames(agentPlatformFixtureMcpServers),
    notServed: NOT_SERVED,
    unresolved: UNRESOLVED,
  });

  it('answer every tool the pages call, or list it as not served', () => {
    expect(report.missing).toEqual([]);
  });

  it('list nothing as not served that is answered or no longer called', () => {
    expect(report.staleNotServed).toEqual([]);
  });

  it('know every tool name the pages call, or list the call', () => {
    expect(report.unresolved).toEqual([]);
  });

  it('list no call whose tool name is now known', () => {
    expect(report.staleUnresolved).toEqual([]);
  });
});
