import { useEffect, useState } from 'react';
import type { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { agentSettingUpUntil } from '../lib/agentProvisioning';

/**
 * Whether a failed agent is still read as being set up — its failure one that
 * resolves on its own while the agent is provisioned, and recent enough to
 * still be expected to (see {@link agentSettingUpUntil}).
 *
 * The end of that window schedules its own render. The Agent read polls, but
 * an unchanged answer is structurally shared and renders nothing, so an agent
 * whose failure persists would otherwise keep reading as "setting up" until
 * something else happened to render the page.
 */
export function useAgentSettingUp(agent: Agent | undefined): boolean {
  const until = agent ? agentSettingUpUntil(agent) : undefined;
  const [, setExpired] = useState<number>();
  useEffect(() => {
    if (until === undefined) {
      return undefined;
    }
    const remaining = until - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setExpired(until), remaining);
    return () => clearTimeout(timer);
  }, [until]);
  return until !== undefined && Date.now() < until;
}
