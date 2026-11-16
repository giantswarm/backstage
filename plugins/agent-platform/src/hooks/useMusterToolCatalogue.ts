import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import { musterToolCatalogueQueryKey } from '../lib/queryKeys';
import {
  portalSessionError,
  PortalSessionEndedError,
} from '../lib/portalSession';
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
  /**
   * The `error` is the portal refusing the person's session token
   * (`PortalSessionEndedError`): a sign-in to the portal is the way on.
   */
  sessionEnded?: boolean;
};

const NO_TOOLS: ToolSummary[] = [];

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

  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: musterToolCatalogueQueryKey(installation ?? ''),
    enabled,
    // The portal refusing the session token is said as that, never in its
    // words (`lib/portalSession.ts`).
    queryFn: () =>
      musterApi!.listTools(installation).catch(failure => {
        throw portalSessionError(failure);
      }),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  const serversRequiringAuth = useMemo(
    () => (data?.servers_requiring_auth ?? []).map(server => server.name),
    [data],
  );

  return {
    // A stable empty list while loading, so consumers' memos hold.
    tools: data?.tools ?? NO_TOOLS,
    serversRequiringAuth,
    isLoading: enabled && isLoading,
    isUnavailable: !musterApi,
    error: error ? (error as Error).message : undefined,
    sessionEnded: error instanceof PortalSessionEndedError,
  };
}
