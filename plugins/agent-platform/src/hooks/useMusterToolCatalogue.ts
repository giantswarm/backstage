import { useQuery } from '@tanstack/react-query';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import { musterToolCatalogueQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

export type MusterToolCatalogue = {
  /** Every tool the caller's session can see, unscoped. */
  tools: ToolSummary[];
  /** Servers muster lists but the caller has not signed in to. */
  serversRequiringAuth: string[];
  isLoading: boolean;
  /** The muster plugin is not installed; there is no catalogue to browse. */
  isUnavailable: boolean;
  error?: string;
};

/**
 * The caller's per-session tool catalogue from muster's `list_tools` — the
 * unscoped list the Tools step browses and picks from, plus the servers whose
 * tools are hidden until the caller signs in to them. Per user, so never
 * persisted; re-read after a sign-in completes (see `lib/queryKeys.ts`).
 */
export function useMusterToolCatalogue(
  installation: string | undefined,
): MusterToolCatalogue {
  const musterApi = useMusterPluginApi();
  const enabled = Boolean(installation) && Boolean(musterApi);

  const { data, isLoading, error } = useQuery({
    queryKey: musterToolCatalogueQueryKey(installation ?? ''),
    enabled,
    queryFn: () => musterApi!.listTools(installation),
  });

  return {
    tools: data?.tools ?? [],
    serversRequiringAuth: (data?.servers_requiring_auth ?? []).map(
      server => server.name,
    ),
    isLoading: enabled && isLoading,
    isUnavailable: !musterApi,
    error: error ? (error as Error).message : undefined,
  };
}
