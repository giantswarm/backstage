import { useMemo } from 'react';
import { useAgents } from '../components/AgentsDataProvider';
import { buildAgentIndex } from '../components/SessionsDataProvider/helpers';

/**
 * The fleet-wide `Agent` index a session's `agent_id` is resolved against,
 * rebuilt only when the agents actually change.
 *
 * The subtlety is the memo key, which is why this is a hook rather than a line
 * repeated at each call site. It is keyed on id, display name **and** the
 * session gate: `AgentRow.id` is `installation/namespace/name`, which does not
 * change when an agent's display-name annotation does, nor when agent-manager's
 * availability settles. `AgentsDataProvider` picks either up and emits fresh
 * rows, so keying on ids alone would leave the index holding the previous
 * objects: every surface showing the old name until an agent is added or
 * removed, and a row built while availability was read staying
 * `isSessionPending` — the session page then never offers a new session.
 *
 * Three places need the index — the sessions list, the session detail page and
 * the switcher rail — and all three must name an agent identically, so the key
 * belongs in one place.
 */
export function useAgentIndex() {
  const { rows: agentRows } = useAgents();
  const agentRowsKey = agentRows
    .map(
      agent =>
        `${agent.id}@${agent.name}@${agent.isSessionPending ? 'pending' : ''}@${
          agent.sessionBlocker ?? ''
        }`,
    )
    .join('|');

  return useMemo(
    () => buildAgentIndex(agentRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentRowsKey],
  );
}
