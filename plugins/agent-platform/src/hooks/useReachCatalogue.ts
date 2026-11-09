import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { musterToolCatalogueQueryKey } from '../lib/queryKeys';
import { buildCatalogue, type CatalogueGroup } from '../lib/toolset';
import { useMusterPluginApi } from './useMusterPluginApi';
import {
  type MusterServers,
  useMusterServers,
  useMusterServersByInstallation,
} from './useMusterServers';
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

/** What `useQueries` keeps of each installation's catalogue read. */
function catalogueResults(
  results: UseQueryResult<Awaited<ReturnType<MusterApi['listTools']>>>[],
) {
  return results.map(result => (result.isSuccess ? result.data : undefined));
}

/**
 * {@link useReachCatalogue} for several installations in one hook: the
 * caller's catalogue of each installation in `installations`, built once per
 * installation from `servers` ({@link useMusterServersByInstallation}) and the
 * same cached queries. An installation whose catalogue is not ready (loading,
 * failed, no muster, its servers still loading) has no entry.
 */
export function useReachCataloguesByInstallation(
  installations: readonly string[],
  servers: ReadonlyMap<string, MusterServers>,
): ReadonlyMap<string, CatalogueGroup[]> {
  const musterApi = useMusterPluginApi();
  const answers = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterToolCatalogueQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () => musterApi!.listTools(installation),
    })),
    combine: catalogueResults,
  });

  return useMemo(() => {
    const byInstallation = new Map<string, CatalogueGroup[]>();
    installations.forEach((installation, index) => {
      const answer = answers[index];
      const own = servers.get(installation);
      if (!answer || !own || own.isLoading) {
        return;
      }
      byInstallation.set(
        installation,
        buildCatalogue(
          answer.tools ?? [],
          own.servers,
          (answer.servers_requiring_auth ?? []).map(server => server.name),
        ),
      );
    });
    return byInstallation;
  }, [installations, answers, servers]);
}
