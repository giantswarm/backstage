import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import {
  useQueries,
  useQueryClient,
  type QueryObserverResult,
} from '@tanstack/react-query';
import {
  ClusterAccessState,
  ClusterAccessStatusEntry,
  clusterAccessStatusApiRef,
} from '../clusterAccessStatus';
import { useInstallations } from '../installations';
import {
  isPlatformComponents,
  NO_PLATFORM_COMPONENTS,
} from './parseApiGroupList';
import {
  isInventoryAuthError,
  probeInstallationInventory,
} from './probeInstallationInventory';
import {
  INSTALLATION_INVENTORY_QUERY_KEY_PREFIX,
  INSTALLATION_INVENTORY_STALE_TIME_MS,
  installationInventoryQueryKey,
} from './queryKey';
import type {
  InstallationInventory,
  InstallationInventoryEntry,
  InstallationProbeState,
  PlatformComponent,
  PlatformComponents,
} from './types';
import { findHomeInstallation } from './useHomeInstallation';

type AccessState = ClusterAccessState | 'unknown';

/**
 * What one probe query contributes to an entry. Plain data, so react-query's
 * `combine` can share it structurally and the hook re-computes only when an
 * answer actually changes. `data` is `unknown` on purpose: a rehydrated entry
 * may carry whatever an older release stored under the key.
 */
type ProbeResult = {
  data: unknown;
  error: Error | null;
  isError: boolean;
};

/** States in which a pending probe may still answer. */
const CAN_STILL_ANSWER = new Set<AccessState>(['healthy', 'connecting']);

/**
 * A transition into `healthy` from one of these is "healthy again": the
 * installation was unreachable, signed out or dropped from the status set
 * meanwhile, and its inventory may have changed, so it is read again.
 */
const HEALTHY_AGAIN_FROM = new Set<AccessState | 'absent'>([
  'degraded',
  'session-expired',
  'absent',
]);

/**
 * Home first, then the installations whose access probes settled (their first
 * state other than `connecting`) in that order, then the rest in config order.
 * Exported for tests.
 */
export function orderInstallations(
  names: string[],
  home: string | undefined,
  settledSequence: ReadonlyMap<string, number>,
): string[] {
  const configIndex = new Map(names.map((name, index) => [name, index]));
  const rank = (name: string) =>
    settledSequence.get(name) ?? Number.POSITIVE_INFINITY;
  return [...names].sort((a, b) => {
    if (a === home) {
      return -1;
    }
    if (b === home) {
      return 1;
    }
    const rankA = rank(a);
    const rankB = rank(b);
    // Two unsettled installations compare as Infinity === Infinity and fall
    // through to their config order.
    if (rankA !== rankB) {
      return rankA < rankB ? -1 : 1;
    }
    return (configIndex.get(a) ?? 0) - (configIndex.get(b) ?? 0);
  });
}

/**
 * One inventory of the platform components per installation, from one
 * `GET /apis` per installation through the kubernetes proxy.
 *
 * Which installations run kagent, muster, KServe or CAPI is fleet state that
 * every Agent Platform tab needs before it can decide whom to query, so it is
 * read once here instead of by each tab listing (and 404ing on) its own
 * resource on every installation. The cluster-access status says which
 * installations are reachable and signed in; this hook adds what they run.
 *
 * - The home installation is probed first, as a foreground request, the moment
 *   its access state is `healthy`; every other installation as a background
 *   request (behind foreground page reads) as its own state turns `healthy`.
 *   An installation that is not `healthy` is never asked.
 * - Answers are cached for an hour under `installationInventoryQueryKey` and,
 *   under the agent-platform QueryClientProvider, persisted to localStorage.
 *   A persisted entry of another shape reads as "not answered yet" and is
 *   fetched again (`isPlatformComponents`).
 * - `refresh()` re-reads every healthy installation; an installation turning
 *   `healthy` again after `degraded`, `session-expired` or leaving the status
 *   set is re-read on its own.
 * - A probe the API server refused (401, 403) is not asked again on its own:
 *   the answer does not change until the person signs in again. It stays
 *   `failed`, with the error, for the gates to explain
 *   (`selectInventoryFailure`); `refresh()` and a healthy-again transition
 *   still re-run it.
 *
 * Runs under whichever react-query client is in context (agent-platform's,
 * muster's or gs's own) and creates none of its own.
 */
export function useInstallationInventory(): InstallationInventory {
  const kubernetesApi = useApi(kubernetesApiRef);
  const statusApi = useApi(clusterAccessStatusApiRef);
  const configApi = useApi(configApiRef);
  const queryClient = useQueryClient();
  const { installations, isLoading: isLoadingInstallations } =
    useInstallations();
  const mainProvider = configApi.getOptionalString('gs.authProvider');
  const home = findHomeInstallation(installations, mainProvider)?.name;

  const [statusEntries, setStatusEntries] = useState<
    ClusterAccessStatusEntry[]
  >(() => statusApi.getSnapshot());
  // The order in which access probes settled, per installation (refs: they
  // are bookkeeping for the subscription below, not render state of their
  // own; every change to them precedes a `setStatusEntries`).
  const settledSequence = useRef(new Map<string, number>());
  const previousStates = useRef(new Map<string, AccessState | 'absent'>());

  useEffect(() => {
    const subscription = statusApi.status$().subscribe(next => {
      const present = new Set<string>();
      for (const entry of next) {
        present.add(entry.installation);
        if (
          entry.state !== 'connecting' &&
          !settledSequence.current.has(entry.installation)
        ) {
          settledSequence.current.set(
            entry.installation,
            settledSequence.current.size,
          );
        }
        const previous = previousStates.current.get(entry.installation);
        if (
          entry.state === 'healthy' &&
          previous !== undefined &&
          HEALTHY_AGAIN_FROM.has(previous)
        ) {
          // The query is still disabled at this point (the render with the new
          // state has not happened), so this only marks it stale; the fetch
          // starts when `enabled` flips below. No duplicate request.
          queryClient.invalidateQueries({
            queryKey: installationInventoryQueryKey(entry.installation),
          });
        }
        previousStates.current.set(entry.installation, entry.state);
      }
      for (const installation of previousStates.current.keys()) {
        if (!present.has(installation)) {
          previousStates.current.set(installation, 'absent');
        }
      }
      setStatusEntries(next);
    });
    return () => subscription.unsubscribe();
  }, [statusApi, queryClient]);

  const accessStates = useMemo(
    () =>
      new Map<string, AccessState>(
        statusEntries.map(entry => [entry.installation, entry.state]),
      ),
    [statusEntries],
  );

  // `installations` is a stable snapshot from the module store; the names are
  // keyed on their contents because the array below is derived each render.
  const configuredNames = installations.map(installation => installation.name);
  const configuredKey = configuredNames.join(',');
  const ordered = useMemo(
    () => orderInstallations(configuredNames, home, settledSequence.current),
    // settledSequence is updated in the subscription right before every
    // statusEntries change, so statusEntries stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configuredKey, home, statusEntries],
  );

  const combine = useCallback(
    (
      results: QueryObserverResult<PlatformComponents, Error>[],
    ): ProbeResult[] =>
      results.map(result => ({
        data: result.data,
        error: result.error,
        isError: result.isError,
      })),
    [],
  );

  const probes = useQueries({
    queries: ordered.map(installation => {
      const queryKey = installationInventoryQueryKey(installation);
      return {
        queryKey,
        queryFn: () =>
          probeInstallationInventory(kubernetesApi, installation, {
            background: installation !== home,
          }),
        enabled: accessStates.get(installation) === 'healthy',
        // A rehydrated entry of another shape is stale at once, so it is
        // fetched again instead of read; a real answer is kept for an hour.
        staleTime: (query: { state: { data: unknown } }) =>
          isPlatformComponents(query.state.data)
            ? INSTALLATION_INVENTORY_STALE_TIME_MS
            : 0,
        // A probe the API server refused stays failed until the person signs
        // in again, so no mount re-runs it. A failed query has no data and is
        // therefore always stale; without this, every mount of the hook on the
        // page -- the section's provider, the header's selector, a view's
        // note, each on its own render -- asked the same question again,
        // retry predicate or not: one rejected token showed up as ten
        // `401 GET /apis` per page load. Other failures (a 5xx, a timeout)
        // keep the default and are retried on the next mount.
        retryOnMount: !isInventoryAuthError(
          queryClient.getQueryState(queryKey)?.error,
        ),
      };
    }),
    combine,
  });

  const statusKnown = statusEntries.length > 0;

  return useMemo<InstallationInventory>(() => {
    const configByName = new Map(
      installations.map(installation => [installation.name, installation]),
    );

    const entries: InstallationInventoryEntry[] = ordered.map(
      (installation, index) => {
        const probe = probes[index];
        const answered = isPlatformComponents(probe?.data);
        let state: InstallationProbeState = 'pending';
        if (answered) {
          state = 'answered';
        } else if (probe?.isError) {
          state = 'failed';
        }
        return {
          installation,
          home: installation === home,
          pipeline: configByName.get(installation)?.pipeline,
          accessState: accessStates.get(installation) ?? 'unknown',
          probe: state,
          components: answered
            ? (probe.data as PlatformComponents)
            : NO_PLATFORM_COMPONENTS,
          error: probe?.error ?? undefined,
        };
      },
    );

    const canStillAnswer = (entry: InstallationInventoryEntry) =>
      entry.probe === 'pending' && CAN_STILL_ANSWER.has(entry.accessState);
    // An installation whose access probe has not settled is not listed by
    // `installationsWith` yet (it is not `healthy`), even when its inventory
    // answer is already in the cache from an earlier visit -- so a tab has
    // nothing to query for it *for now*, not for good. It counts as still
    // settling, or a pinned installation would read as "no agents here" for
    // the seconds until its `/version` probe answers.
    const accessSettling = (entry: InstallationInventoryEntry) =>
      entry.accessState === 'connecting';
    const homeEntry = entries.find(entry => entry.home);
    // Until the status set has any entry at all (the cluster-access connector
    // seeds it right after the auth providers initialise, but a page can mount
    // first), nothing is known yet: report loading rather than an empty fleet.
    const nothingKnownYet = entries.length > 0 && !statusKnown;

    const installationsWith = (component: PlatformComponent) =>
      entries
        .filter(
          entry =>
            entry.probe === 'answered' &&
            entry.components[component] &&
            entry.accessState === 'healthy',
        )
        .map(entry => entry.installation);

    const refresh = () => {
      // Refetches the active (healthy, mounted) probes now and marks the rest
      // stale for whenever they become active.
      queryClient.invalidateQueries({
        queryKey: INSTALLATION_INVENTORY_QUERY_KEY_PREFIX,
      });
    };

    return {
      entries,
      home,
      isLoading:
        isLoadingInstallations ||
        nothingKnownYet ||
        (homeEntry !== undefined && canStillAnswer(homeEntry)),
      isProbing:
        nothingKnownYet ||
        entries.some(canStillAnswer) ||
        entries.some(accessSettling),
      installationsWith,
      refresh,
    };
  }, [
    ordered,
    probes,
    accessStates,
    statusKnown,
    home,
    installations,
    isLoadingInstallations,
    queryClient,
  ]);
}
