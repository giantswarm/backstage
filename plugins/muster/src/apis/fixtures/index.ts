/**
 * The muster plugin's fixture data for other fixture modules
 * (docs/fixtures.md). A subpath of its own
 * (`@giantswarm/backstage-plugin-muster/fixtures`) so nothing reaches a
 * production build through the package's main entry; only fixture modules
 * and tests import it.
 */
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentToolsArgument, ToolSummary } from '../types';
import { reportForAgent } from './agentApprovalFixtures';
import { connectorKeyOf, connectorRefOf } from './musterFixtureData';
import { musterFixtureState } from './musterFixtureState';

/**
 * muster's objects in an installation of the page's data set, as its
 * Kubernetes API lists them: an `MCPServer` per connector, as the connector
 * writes leave them, and a `Workflow` per workflow. The same array while
 * nothing changed, a new one after a write.
 */
export function musterKubernetesObjectsOf(
  installation: string,
): KubeObjectInterface[] {
  return musterFixtureState().kubernetesObjectsOf(installation);
}

/**
 * An installation's connector tools as an agent's tool list sees them, as
 * muster's `filter_tools` reports them with `agentTools`: the approval with
 * its deciding entry and the connector's own setting, the connectors behind
 * each tool, and whether the guest is their connector admin. For
 * agent-manager's fixture, which asks muster which connectors an `Allow`
 * needs a grant of, as agent-manager does.
 */
export function musterAgentToolReportOf(
  installation: string,
  agentTools: AgentToolsArgument,
): ToolSummary[] {
  const snapshot = musterFixtureState().snapshotOf(installation);
  const connectors = new Map(
    snapshot.connectors.map(connector => [
      connectorKeyOf(connector),
      connector,
    ]),
  );
  return reportForAgent(
    [...snapshot.served.values()],
    agentTools,
    snapshot.presets,
    tool => {
      const connector = tool.server ? connectors.get(tool.server) : undefined;
      return connector ? [connectorRefOf(connector)] : undefined;
    },
  );
}
