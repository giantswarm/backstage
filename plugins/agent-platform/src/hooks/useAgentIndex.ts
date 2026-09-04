import { useMemo } from 'react';
import { useAgents } from '../components/AgentsDataProvider';
import { buildAgentIndex } from '../components/SessionsDataProvider/helpers';

/**
 * The fleet-wide `Agent` index a session's `agent_id` is resolved against,
 * rebuilt only when the agents actually change.
 *
 * The subtlety is the memo key, which is why this is a hook rather than a line
 * repeated at each call site. It is keyed on id **and** display name:
 * `AgentRow.id` is `installation/namespace/name`, which does not change when an
 * agent's display-name annotation does. `AgentsDataProvider` picks such an edit
 * up — its signature includes `resourceVersion` — and emits fresh rows, so
 * keying on ids alone would leave the index holding the previous objects and
 * every surface showing the old name until an agent is added or removed.
 *
 * Three places need the index — the sessions list, the session detail page and
 * the switcher rail — and all three must name an agent identically, so the key
 * belongs in one place.
 */
export function useAgentIndex() {
  const { rows: agentRows } = useAgents();
  const agentRowsKey = agentRows
    .map(agent => `${agent.id}@${agent.name}`)
    .join('|');

  return useMemo(
    () => buildAgentIndex(agentRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentRowsKey],
  );
}
