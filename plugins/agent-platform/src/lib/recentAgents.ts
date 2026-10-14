import type { AgentRow } from '../components/AgentsDataProvider';
import { isStartableAgent } from '../components/NewSessionComposer';
import {
  sortSessionRows,
  type SessionRow,
} from '../components/SessionsDataProvider/helpers';

/** How many recent agents the home screen offers. */
export const RECENT_AGENTS_LIMIT = 3;

/** A recent agent, and when the person's latest session with it started. */
export type RecentAgentUse = {
  agent: AgentRow;
  /** The latest session's `createdAt`, when kagent reported one. */
  lastUsedAt?: string;
};

/**
 * The startable agents of the most recently started sessions, newest first,
 * each once, with when each was last used. A session counts only when it
 * matched an `Agent` on the fleet, since only then is its agent known by
 * identity. Sessions are walked newest first and stop at `limit` agents, so a
 * person with hundreds of sessions costs no more than the few it takes.
 */
export function recentAgentUses(
  sessions: SessionRow[],
  agents: AgentRow[],
  limit: number = RECENT_AGENTS_LIMIT,
): RecentAgentUse[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const picked: RecentAgentUse[] = [];
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
    if (
      agent &&
      isStartableAgent(agent) &&
      !picked.some(use => use.agent === agent)
    ) {
      picked.push({ agent, lastUsedAt: session.createdAt });
    }
  }
  return picked;
}

/**
 * The startable agents of the most recently started sessions, newest first,
 * each once. See {@link recentAgentUses}.
 */
export function recentAgents(
  sessions: SessionRow[],
  agents: AgentRow[],
  limit: number = RECENT_AGENTS_LIMIT,
): AgentRow[] {
  return recentAgentUses(sessions, agents, limit).map(use => use.agent);
}
