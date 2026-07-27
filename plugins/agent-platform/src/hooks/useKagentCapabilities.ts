import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import {
  capabilitiesForVersion,
  FALLBACK_KAGENT_CAPABILITIES,
  KagentCapabilities,
} from '../lib/kagentCapabilities';

/**
 * A kagent version changes on upgrade, not on navigation, so probe rarely. The
 * plugin's QueryClientProvider persists this for an hour anyway.
 */
const VERSION_STALE_TIME_MS = 60 * 60 * 1000;

/** React-query key for one installation's kagent version probe. */
export const kagentVersionQueryKey = (installation: string) =>
  ['agent-platform', 'kagent', 'version', installation] as const;

/** React-query key for one installation's kagent identity probe. */
export const kagentIdentityQueryKey = (installation: string) =>
  ['agent-platform', 'kagent', 'me', installation] as const;

/** Installations we've already warned about, so the log stays quiet. */
const warnedAboveCeiling = new Set<string>();

/**
 * Per-installation kagent capabilities.
 *
 * Keyed per installation on purpose: the fleet can run mixed kagent versions,
 * and each installation is an independent deployment with its own version *and*
 * its own auth mode.
 *
 * Two probes back this, both non-fatal:
 *
 * - `/version` → the feature flags. A failure degrades that installation to the
 *   oldest supported version rather than erroring.
 * - `/me` → whether sessions are actually scoped to the signed-in user (they are
 *   not when the controller runs in `unsecure` mode).
 *
 * Neither probe gates the sessions query: capabilities annotate the list, they
 * do not block it.
 */
export function useKagentCapabilitiesMap(
  installations: string[],
): (installation: string) => KagentCapabilities {
  const kagentApi = useApi(kagentApiRef);

  const versionQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: kagentVersionQueryKey(installation),
      queryFn: () => kagentApi.getVersion(installation),
      staleTime: VERSION_STALE_TIME_MS,
      retry: 1,
    })),
  });

  const identityQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: kagentIdentityQueryKey(installation),
      queryFn: () => kagentApi.getIdentity(installation),
      staleTime: VERSION_STALE_TIME_MS,
      retry: 1,
    })),
  });

  // useQueries returns fresh arrays every render, so the memo below keys off a
  // stable signature of the outcomes rather than the array identities. Computed
  // plainly (not memoized) because it is the memo's own dependency and is cheap.
  const signature = installations
    .map((installation, index) => {
      const version = versionQueries[index];
      const identity = identityQueries[index];
      return `${installation}:${version?.status}:${version?.data ?? ''}:${
        identity?.status
      }:${identity?.data?.sub ?? ''}`;
    })
    .join('|');

  const byInstallation = useMemo(() => {
    const result = new Map<string, KagentCapabilities>();

    installations.forEach((installation, index) => {
      const rawVersion = versionQueries[index]?.data;
      const capabilities = rawVersion
        ? capabilitiesForVersion(rawVersion)
        : FALLBACK_KAGENT_CAPABILITIES;

      if (
        capabilities.isAboveTestedCeiling &&
        !warnedAboveCeiling.has(installation)
      ) {
        warnedAboveCeiling.add(installation);
        // eslint-disable-next-line no-console
        console.warn(
          `Installation '${installation}' runs kagent ${capabilities.rawVersion}, which is newer than the version this UI was tested against. Proceeding optimistically.`,
        );
      }

      // The identity probe only tells us something once it has resolved; until
      // then leave isUserScoped undefined rather than implying either answer.
      const identityQuery = identityQueries[index];
      const isUserScoped =
        identityQuery?.status === 'success'
          ? isUserScopedSubject(identityQuery.data?.sub)
          : undefined;

      result.set(installation, { ...capabilities, isUserScoped });
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installations, signature]);

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

/**
 * kagent's `unsecure` auth mode ignores the forwarded token and resolves every
 * caller to a shared built-in user, so seeing that subject means the list is not
 * this user's.
 */
const UNSCOPED_SUBJECTS = ['admin@kagent.dev'];

function isUserScopedSubject(sub: string | undefined): boolean {
  if (!sub) {
    // No subject reported at all: we can't confirm scoping, so don't claim it.
    return false;
  }
  return !UNSCOPED_SUBJECTS.includes(sub);
}
