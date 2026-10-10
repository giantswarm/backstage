import type { AgentRow } from '../components/AgentsDataProvider';

/**
 * The home screen's query parameter naming the agent to preselect in its
 * composer: an `AgentRow` id (`installation/namespace/name`), which is no
 * personal data — the same reference the picker's own state holds.
 */
export const NEW_SESSION_AGENT_PARAM = 'agent';

/**
 * Where "New session with this agent" leads: the shell's home (`/`, the new
 * session screen, as the rest of the plugin links it) with the agent
 * preselected. The home resolves the id against the live fleet and falls back
 * to its usual default when it names no startable agent.
 */
export function newSessionHref(agent: Pick<AgentRow, 'id'>): string {
  return `/?${NEW_SESSION_AGENT_PARAM}=${encodeURIComponent(agent.id)}`;
}
