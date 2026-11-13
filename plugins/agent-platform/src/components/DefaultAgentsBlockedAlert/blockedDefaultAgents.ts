import type { AgentRow } from '../AgentsDataProvider';

/**
 * A default agent no session can start with, and why: it references no model
 * (the platform's default agent waits for a default model), or it failed for
 * a reason of its own, which the controller's message names.
 */
export type BlockedDefaultAgent = {
  agent: AgentRow;
  reason: 'no-model' | 'failed';
  /** The controller's message, for `failed`; absent when it gave none. */
  message?: string;
};

/**
 * The default agents among `agents` (by the ids agent-manager names) that
 * cannot start sessions, sorted by environment and namespace. An agent
 * without a model is blocked whatever its readiness says, short of ready; one
 * with a model only once it has failed — one still converging will start.
 */
export function blockedDefaultAgents(
  agents: readonly AgentRow[],
  defaultAgentIds: ReadonlySet<string>,
): BlockedDefaultAgent[] {
  const blocked: BlockedDefaultAgent[] = [];
  for (const agent of agents) {
    if (!defaultAgentIds.has(agent.id) || agent.readiness === 'ready') {
      continue;
    }
    if (!agent.modelConfigId) {
      blocked.push({ agent, reason: 'no-model' });
    } else if (agent.readiness === 'failed') {
      blocked.push({
        agent,
        reason: 'failed',
        message: agent.readinessMessage?.trim() || undefined,
      });
    }
  }
  return blocked.sort(
    (a, b) =>
      a.agent.installation.localeCompare(b.agent.installation) ||
      a.agent.namespace.localeCompare(b.agent.namespace),
  );
}
