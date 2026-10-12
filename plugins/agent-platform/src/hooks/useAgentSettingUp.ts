import type { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { agentSettingUpUntil } from '../lib/agentProvisioning';
import { useDeadlinePassed } from './useDeadlinePassed';

/**
 * Whether a failed agent is still read as being set up: new, and failing only
 * on a reference to an object not created yet (see
 * {@link agentSettingUpUntil}). The end of the window renders the page on its
 * own, so a failure that persists is shown without waiting for the Agent to
 * change.
 */
export function useAgentSettingUp(agent: Agent | undefined): boolean {
  const until = agent ? agentSettingUpUntil(agent) : undefined;
  const isPast = useDeadlinePassed(until);
  return until !== undefined && !isPast;
}
