import type { AgentRow } from '../components/AgentsDataProvider';
import { isStartableAgent } from '../components/NewSessionComposer';
import {
  sortSessionRows,
  type SessionRow,
} from '../components/SessionsDataProvider/helpers';

/** How many recent agents the home screen offers. */
export const RECENT_AGENTS_LIMIT = 3;

/**
 * The startable agents of the most recently started sessions, newest first,
 * each once. A session counts only when it matched an `Agent` on the fleet,
 * since only then is its agent known by identity.
 */
export function recentAgents(
  sessions: SessionRow[],
  agents: AgentRow[],
  limit: number = RECENT_AGENTS_LIMIT,
): AgentRow[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const picked: AgentRow[] = [];
  for (const session of sortSessionRows(sessions)) {
    if (picked.length >= limit) {
      break;
    }
    if (!session.agentNamespace || !session.agentTechnicalName) {
      continue;
    }
    const agent = byId.get(
      `${session.installation}/${session.agentNamespace}/${session.agentTechnicalName}`,
    );
    if (agent && isStartableAgent(agent) && !picked.includes(agent)) {
      picked.push(agent);
    }
  }
  return picked;
}
