import type { AgentRow } from '../components/AgentsDataProvider';
import { isStartableAgent } from '../components/NewSessionComposer';
import type { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  lastActiveAt,
  sortSessionRows,
  type SessionRow,
} from '../components/SessionsDataProvider/helpers';

/** How many recent agents the home screen offers. */
export const RECENT_AGENTS_LIMIT = 3;

/** A recent agent, and when the person last used it. */
export type RecentAgentUse = {
  agent: AgentRow;
  /**
   * The latest session's last turn where its state is known, its `createdAt`
   * otherwise, when kagent reported one.
   */
  lastUsedAt?: string;
};

/**
 * The agents of the most recently used sessions, newest first, each once,
 * with when each was last used. A session's use is its last turn where
 * `states` (keyed by session row id) knows it, its start otherwise
 * ({@link lastActiveAt}), as {@link agentLastUsedAt} orders the Agents list.
 * A session counts only when it matched an `Agent` on the fleet, since only
 * then is its agent known by identity. Sessions are walked newest first and
 * stop at `limit` agents, so a person with hundreds of sessions costs no
 * more than the few it takes.
 *
 * `startableOnly` (the default) skips an agent no session can start on now,
 * for a list that starts one; a list that opens the agent's page keeps it,
 * since its page is where to see what is wrong.
 */
export function recentAgentUses(
  sessions: SessionRow[],
  agents: AgentRow[],
  {
    limit = RECENT_AGENTS_LIMIT,
    startableOnly = true,
    states,
  }: {
    limit?: number;
    startableOnly?: boolean;
    states?: ReadonlyMap<string, SessionStateEntry>;
  } = {},
): RecentAgentUse[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const picked: RecentAgentUse[] = [];
  let ranked = sortSessionRows(sessions);
  if (states && states.size > 0) {
    // Stable: sessions with the same use keep the start order.
    const used = (session: SessionRow) =>
      lastActiveAt(session, states.get(session.id)) ?? Number.MIN_SAFE_INTEGER;
    ranked = ranked.sort((a, b) => used(b) - used(a));
  }
  for (const session of ranked) {
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
      (!startableOnly || isStartableAgent(agent)) &&
      !picked.some(use => use.agent === agent)
    ) {
      const state = states?.get(session.id);
      const at = state && lastActiveAt(session, state);
      picked.push({
        agent,
        lastUsedAt:
          at !== undefined ? new Date(at).toISOString() : session.createdAt,
      });
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
  return recentAgentUses(sessions, agents, { limit }).map(use => use.agent);
}

/**
 * When the person last used each agent, epoch ms by agent id: the latest
 * activity of its sessions ({@link lastActiveAt}, with `states` keyed by
 * session row id). An agent without a dated session has no entry.
 */
export function agentLastUsedAt(
  sessions: readonly SessionRow[],
  states?: ReadonlyMap<string, SessionStateEntry>,
): Map<string, number> {
  const latest = new Map<string, number>();
  for (const session of sessions) {
    if (!session.agentNamespace || !session.agentTechnicalName) {
      continue;
    }
    const at = lastActiveAt(session, states?.get(session.id));
    if (at === undefined) {
      continue;
    }
    const id = `${session.installation}/${session.agentNamespace}/${session.agentTechnicalName}`;
    latest.set(id, Math.max(at, latest.get(id) ?? at));
  }
  return latest;
}
