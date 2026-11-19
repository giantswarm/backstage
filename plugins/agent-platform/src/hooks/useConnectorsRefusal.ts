import { useEffect, useMemo } from 'react';

import { connectorRefusalsOf } from '../lib/organizationConnectors';
import { useNewAgentForm } from '../components/NewAgentFormProvider';

/**
 * Hands agent-manager's refusals of the selected connectors, among a review
 * step's dry-run and write messages, to the Tools step, which shows them in
 * agent-manager's words next to the connectors (`OrganizationConnectors`).
 * A check that answered without one clears what an earlier one reported.
 */
export function useConnectorsRefusal(
  messages: readonly (string | undefined)[],
  answered: boolean,
): void {
  const { state, setConnectorsRefusal } = useNewAgentForm();
  const signature = JSON.stringify(connectorRefusalsOf(messages));
  const refusals = useMemo(
    () => JSON.parse(signature) as string[],
    [signature],
  );
  const connectors = state.connectors;
  useEffect(() => {
    if (refusals.length > 0) {
      setConnectorsRefusal({ connectors, messages: refusals });
    } else if (answered) {
      setConnectorsRefusal(undefined);
    }
  }, [refusals, answered, connectors, setConnectorsRefusal]);
}
