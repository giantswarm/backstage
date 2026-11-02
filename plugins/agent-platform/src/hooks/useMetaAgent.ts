import {
  readMetaAgents,
  type MetaAgentRole,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import type { AgentRow } from '../components/AgentsDataProvider';
import { useAgents } from '../components/AgentsDataProvider';

/**
 * The agent configured to serve a meta-agent role. The configured value must
 * be qualified: `<namespace>/<name>`, or `<installation>/<namespace>/<name>`
 * to pick one installation where the agent runs in several. It must match
 * exactly one row; anything else resolves to nothing, so the feature hides:
 *
 * - a bare name: any user who can create an agent in a namespace others can
 *   list could otherwise squat on the role (security audit 1, M1);
 * - a `<namespace>/<name>` that exists on several installations: no row is
 *   preferred over another, ordering included, so the config must name the
 *   installation;
 * - an empty segment or more than three segments.
 */
export function resolveMetaAgent(
  rows: AgentRow[],
  configured: string | undefined,
): AgentRow | undefined {
  const segments = configured?.split('/') ?? [];
  if (
    segments.length < 2 ||
    segments.length > 3 ||
    segments.some(segment => segment === '')
  ) {
    return undefined;
  }
  const [name, namespace, installation] = [...segments].reverse();
  const matches = rows.filter(
    row =>
      row.technicalName === name &&
      row.namespace === namespace &&
      (installation === undefined || row.installation === installation),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * The agent serving a meta-agent role (decision G13): the agent configured
 * under `agentPlatform.metaAgents.<role>` (signed-in config), resolved against
 * the agent index by {@link resolveMetaAgent}. `undefined` while the config or
 * the agents are loading, when the role is unconfigured, and when the
 * configured reference matches no agent, or more than one — a feature gated
 * on a role renders nothing then, which is the decision's point: features
 * light up only where the role resolves.
 *
 * Reads `useAgents`, so it must be called under an `AgentsDataProvider`.
 */
export function useMetaAgent(role: MetaAgentRole): AgentRow | undefined {
  const { config } = useSignedInConfig();
  const { rows } = useAgents();
  return resolveMetaAgent(rows, readMetaAgents(config)[role]);
}
