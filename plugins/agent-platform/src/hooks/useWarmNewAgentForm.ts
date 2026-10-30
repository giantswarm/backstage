import { useMemo } from 'react';
import {
  useHomeInstallation,
  useInstallations,
} from '@giantswarm/backstage-plugin-gs';

import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from './useAgentManager';

const NONE: string[] = [];

/**
 * Starts the New agent form's two muster reads for the environment it most
 * likely opens on (the only one configured, else the home installation)
 * while the person is still on the agents list: whether that muster
 * registers agent-manager, then agent-manager's `get_info` (where the person
 * may create). The form asks the same hooks, so its Organization field finds
 * both in the cache instead of waiting for them in a row. One installation,
 * the hooks' own staleness, and `get_info` only where agent-manager is
 * reachable as the person.
 */
export function useWarmNewAgentForm(): void {
  const { installations, isLoading } = useInstallations();
  const { home } = useHomeInstallation();
  let likely: string | undefined;
  if (!isLoading) {
    likely = installations.length === 1 ? installations[0].name : home?.name;
  }
  const scope = useMemo(() => (likely ? [likely] : NONE), [likely]);
  const availability = useAgentManagerAvailability(scope);
  useAgentManagerInfo(
    likely && availability.presenceOf(likely) === 'available'
      ? likely
      : undefined,
  );
}
