import type { AgentRow } from '../components/AgentsDataProvider';

/**
 * Whether a session can be started with this agent: it is ready, and its
 * installation's agent-manager can start one as the person
 * (`AgentRow.sessionBlocker`), which is no longer being read
 * (`AgentRow.isSessionPending`).
 *
 * Shared so the picker, the remembered default and the callers that decide
 * whether to *offer* a picker
 * at all share one predicate — a page withholding the composer on a different rule
 * than the picker filters on would either show an empty dropdown or hide a usable
 * one.
 */
export function isStartableAgent(agent: AgentRow): boolean {
  return (
    agent.readiness === 'ready' &&
    !agent.sessionBlocker &&
    !agent.isSessionPending
  );
}
