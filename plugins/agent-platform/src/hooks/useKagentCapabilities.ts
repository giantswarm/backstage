import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import {
  FALLBACK_KAGENT_CAPABILITIES,
  isUserScopedSubject,
  KagentCapabilities,
} from '../lib/kagentCapabilities';

/**
 * A deployment's auth mode changes on reconfiguration, not on navigation, so
 * probe rarely. The plugin's QueryClientProvider persists this for an hour.
 */
const IDENTITY_STALE_TIME_MS = 60 * 60 * 1000;

/** React-query key for one installation's kagent identity probe. */
export const kagentIdentityQueryKey = (installation: string) =>
  ['agent-platform', 'kagent', 'me', installation] as const;

/**
 * Per-installation kagent capabilities.
 *
 * Keyed per installation on purpose: each is an independent kagent deployment
 * with its own auth mode, so what holds for one says nothing about another.
 *
 * Backed by a single non-fatal `/me` probe telling us whether sessions are
 * actually scoped to the signed-in user (they are not when the controller runs
 * in `unsecure` mode). It never gates the sessions query — capabilities annotate
 * the list, they do not block it.
 */
export function useKagentCapabilitiesMap(
  installations: string[],
): (installation: string) => KagentCapabilities {
  const kagentApi = useApi(kagentApiRef);

  const identityQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: kagentIdentityQueryKey(installation),
      queryFn: () => kagentApi.getIdentity(installation),
      staleTime: IDENTITY_STALE_TIME_MS,
      // No `retry` override: a per-query value would *replace* the
      // QueryClientProvider's predicate, which returns false for
      // NotFoundError/ServiceUnavailableError precisely so that "kagent isn't
      // deployed on this installation" fails fast. Since kagent runs on only a
      // couple of installations, that is the normal outcome for most of the
      // fleet, and retrying each one would cost a doomed request plus another
      // broker token exchange.
    })),
  });

  // useQueries returns fresh arrays every render, and callers routinely derive
  // the installations array inline, so the memo below keys off this signature
  // *only* — no array identities. The signature already encodes the installation
  // names, so it captures everything the memo depends on. Same approach as
  // useReachableInstallations, which keys on `allInstallations.join(',')`.
  // Computed plainly (not memoized) because it is the memo's own dependency and
  // is cheap.
  const signature = installations
    .map((installation, index) => {
      const identity = identityQueries[index];
      return `${installation}:${identity?.status}:${identity?.data?.sub ?? ''}`;
    })
    .join('|');

  const byInstallation = useMemo(() => {
    const result = new Map<string, KagentCapabilities>();

    installations.forEach((installation, index) => {
      // The probe only tells us something once it has resolved; until then leave
      // isUserScoped undefined rather than implying either answer.
      const identityQuery = identityQueries[index];
      const isUserScoped =
        identityQuery?.status === 'success'
          ? isUserScopedSubject(identityQuery.data?.sub)
          : undefined;

      result.set(installation, { isUserScoped });
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useCallback(
    (installation: string) =>
      byInstallation.get(installation) ?? FALLBACK_KAGENT_CAPABILITIES,
    [byInstallation],
  );
}

/** Single-installation convenience wrapper. */
export function useKagentCapabilities(
  installation: string,
): KagentCapabilities {
  const installations = useMemo(() => [installation], [installation]);
  const capabilitiesFor = useKagentCapabilitiesMap(installations);
  return capabilitiesFor(installation);
}
