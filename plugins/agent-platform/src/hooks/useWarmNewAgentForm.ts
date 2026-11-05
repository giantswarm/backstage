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
 * likely opens on (the only one configured, else the home installation):
 * whether that muster registers agent-manager, then agent-manager's
 * `get_info` (where the person may create). The form asks the same hooks, so
 * its Owner field finds both in the cache instead of waiting for them in a
 * row. Mounted by every step of the form itself (`NewAgentStep`), where
 * `get_info` then runs beside the reads that pick the environment rather
 * than after them, and by the agents list, so the form opens with both
 * answered. One installation, the hooks' own staleness, and `get_info` only
 * where agent-manager is reachable as the person.
 */
export function useWarmNewAgentForm({
  enabled = true,
}: { enabled?: boolean } = {}): void {
  const { installations, isLoading } = useInstallations();
  const { home } = useHomeInstallation();
  let likely: string | undefined;
  if (enabled && !isLoading) {
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
