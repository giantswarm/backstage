import { useMemo } from 'react';

import { buildCatalogue, type CatalogueGroup } from '../lib/toolset';
import { useMusterServers } from './useMusterServers';
import { useMusterToolCatalogue } from './useMusterToolCatalogue';

/**
 * The caller's catalogue, grouped as the Tools step groups it, for naming an
 * agent's reach per connector (T103) — or `undefined` while it is not needed,
 * still loading, failed, or muster is not installed, so the sentence falls
 * back to counting the picked tools. Read from the same cached queries as the
 * Tools step and the agent page.
 */
export function useReachCatalogue(
  installation: string | undefined,
  needed: boolean,
): CatalogueGroup[] | undefined {
  const scope = needed ? installation : undefined;
  const catalogue = useMusterToolCatalogue(scope);
  const { servers, isLoading: isLoadingServers } = useMusterServers(scope);
  const ready =
    Boolean(scope) &&
    !catalogue.isUnavailable &&
    !catalogue.isLoading &&
    !catalogue.error &&
    !isLoadingServers;
  return useMemo(
    () =>
      ready
        ? buildCatalogue(
            catalogue.tools,
            servers,
            catalogue.serversRequiringAuth,
          )
        : undefined,
    [ready, catalogue.tools, servers, catalogue.serversRequiringAuth],
  );
}
