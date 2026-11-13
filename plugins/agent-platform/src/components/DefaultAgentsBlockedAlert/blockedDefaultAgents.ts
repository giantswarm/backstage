import type { AgentManagerAgentReading } from '../../hooks/useAgentManagerAgents';
import { awaitsDefaultModel } from '../../lib/agentManager';
import type { AgentRow } from '../AgentsDataProvider';

/**
 * A default agent no session can start with, and why: the platform's default
 * agent waits for a default model, or it failed for a reason of its own,
 * which the controller's message names.
 */
export type BlockedDefaultAgent = {
  agent: AgentRow;
  reason: 'no-model' | 'failed';
  /** The controller's message, for `failed`; absent when it gave none. */
  message?: string;
};

/**
 * Whether the agent's own spec names no model: no inline ModelConfig and no
 * referenced `AgentTemplate`, whose model the portal does not read.
 */
function namesNoModel(agent: AgentRow): boolean {
  return !agent.modelConfigId && !agent.templateRef;
}

/**
 * The default agents among `agents` that may be waiting for a model, which
 * only agent-manager's `get_agent` tells: not ready, and naming no model of
 * their own.
 */
export function defaultAgentsToRead(
  agents: readonly AgentRow[],
  defaultAgentIds: ReadonlySet<string>,
): AgentRow[] {
  return agents.filter(
    agent =>
      defaultAgentIds.has(agent.id) &&
      agent.readiness !== 'ready' &&
      namesNoModel(agent),
  );
}

/**
 * The default agents among `agents` (by the ids agent-manager names) that
 * cannot start sessions, sorted by environment and namespace.
 *
 * "No model yet" is said only where agent-manager confirms it
 * (`awaitsDefaultModel`: the platform's own agent, without a model, not
 * ready), since adding a model fixes only that one; `readings` holds its
 * `get_agent` answers, keyed by agent id. An agent awaiting that answer is
 * left out until it lands. Every other failed default agent is reported with
 * the controller's message, a model of its own or not: where the cause is not
 * known, the controller's words are not guessed over. One with a model that
 * is still converging will start, and is left out.
 */
export function blockedDefaultAgents(
  agents: readonly AgentRow[],
  defaultAgentIds: ReadonlySet<string>,
  readings: ReadonlyMap<string, AgentManagerAgentReading>,
): BlockedDefaultAgent[] {
  const blocked: BlockedDefaultAgent[] = [];
  for (const agent of agents) {
    if (!defaultAgentIds.has(agent.id) || agent.readiness === 'ready') {
      continue;
    }
    if (namesNoModel(agent)) {
      const reading = readings.get(agent.id);
      if (!reading?.settled) {
        continue;
      }
      if (awaitsDefaultModel(reading.agent)) {
        blocked.push({ agent, reason: 'no-model' });
        continue;
      }
    }
    if (agent.readiness === 'failed') {
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
