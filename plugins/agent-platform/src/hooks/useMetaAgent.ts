import {
  readMetaAgents,
  type MetaAgentRole,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import type { AgentRow } from '../components/AgentsDataProvider';
import { useAgents } from '../components/AgentsDataProvider';

/**
 * The agent configured to serve a meta-agent role, matched against the rows:
 * by its technical (resource) name, or `<namespace>/<name>` when the config
 * qualifies it. Rows come home-installation first, so a fleet running the
 * agent in several places resolves to the home one.
 */
export function resolveMetaAgent(
  rows: AgentRow[],
  configured: string | undefined,
): AgentRow | undefined {
  if (!configured) {
    return undefined;
  }
  return rows.find(
    row =>
      row.technicalName === configured ||
      `${row.namespace}/${row.technicalName}` === configured,
  );
}

/**
 * The agent serving a meta-agent role (decision G13): the name configured
 * under `agentPlatform.metaAgents.<role>` (signed-in config), resolved against
 * the agent index. `undefined` while the config or the agents are loading,
 * when the role is unconfigured, and when the configured name matches no
 * agent — a feature gated on a role renders nothing in all three cases, which
 * is the decision's point: features light up only where the role resolves.
 *
 * Reads `useAgents`, so it must be called under an `AgentsDataProvider`.
 */
export function useMetaAgent(role: MetaAgentRole): AgentRow | undefined {
  const { config } = useSignedInConfig();
  const { rows } = useAgents();
  return resolveMetaAgent(rows, readMetaAgents(config)[role]);
}
