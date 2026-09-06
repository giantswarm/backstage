import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  useInstallationInventory,
  useInstallations,
} from '@giantswarm/backstage-plugin-gs';
import { kagentApiRef } from '../../apis';
import { sessionsQueryKey } from '../../lib/queryKeys';
import { useKagentCapabilitiesMap } from '../../hooks/useKagentCapabilities';
import { useAgents } from '../AgentsDataProvider';
import {
  buildAgentIndex,
  isListableSession,
  SessionRow,
  sortSessionRows,
  toSessionRow,
} from './helpers';

/** The backend's kagent installation list changes with config, not with navigation. */
const INSTALLATIONS_STALE_TIME_MS = 60 * 60 * 1000;

export type SessionsContextValue = {
  /** Sessions flattened into plain rows, most recent activity first. */
  rows: SessionRow[];
  /**
   * Initial load: no rows yet and the fleet is still being queried. Only true
   * until the first installation responds — one slow installation must not keep
   * the whole table in a skeleton.
   */
  isLoading: boolean;
  /** Rows are shown, but more installations are still resolving. */
  isLoadingMore: boolean;
  /** Whether any installation is configured at all. */
  hasInstallations: boolean;
  /**
   * Installations we queried but couldn't read. Surfaced instead of silently
   * dropped, so an empty list is distinguishable from a partial one.
   *
   * Excludes installations where kagent simply isn't deployed — that is the
   * common case across the fleet and not something a user can act on.
   */
  unreachableInstallations: string[];
  /**
   * Installations that reported a session list which is **not** scoped to the
   * signed-in user, because their kagent runs in `unsecure` mode. Rows are still
   * shown; the UI must stop describing them as the user's own.
   */
  notUserScopedInstallations: string[];
};

const SessionsContext = createContext<SessionsContextValue | undefined>(
  undefined,
);

/**
 * Lists the signed-in user's kagent sessions across every installation that
 * runs kagent and that the backend proxies, and exposes them as plain rows.
 *
 * Agent names and avatars are resolved against the `Agent` CRs loaded by
 * {@link AgentsDataProvider}, so this must be mounted inside one.
 *
 * Unlike {@link AgentsDataProvider} this keeps **no sticky per-installation
 * cache**. That machinery exists there because `useResources` returns fresh
 * arrays every render and a transient error blanks them; react-query already
 * retains the last successful `data` per installation across failed refetches,
 * and an installation genuinely dropping out of the queried set *should* prune
 * its rows. Please don't "restore parity" — it would add state with nothing to
 * fix.
 */
export function SessionsDataProvider({ children }: { children: ReactNode }) {
  const kagentApi = useApi(kagentApiRef);
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);

  // Which installations run kagent: those whose inventory has the `kagent.dev`
  // API group and whose access is healthy, home first (gs
  // `useInstallationInventory`, one `GET /apis` per installation shared by every
  // tab). Same reason as the other providers, and then some: a sessions request
  // to an installation without kagent is doomed, and each one mints that
  // installation's Dex token before it can fail.
  const inventory = useInstallationInventory();
  const kagentInstallations = inventory.installationsWith('kagent');
  const isProbing = inventory.isLoading || inventory.isProbing;

  // Which installations the backend proxies kagent for: a kagent URL derived
  // per installation, or the configured `agentPlatform.kagent.installations`
  // (URL override and hard allowlist). The intersection with the inventory is
  // what gets queried — the backend knows the URLs, the inventory knows who runs
  // kagent; neither alone is enough.
  //
  // We deliberately *wait* for this before querying anything. It is one cheap
  // backend call, cached for an hour and persisted, so paying a single round-trip
  // up front is far cheaper than a wasted request to an installation the backend
  // has no route for.
  const {
    data: proxiedInstallations,
    isLoading: isLoadingAllowlist,
    isError: allowlistFailed,
  } = useQuery({
    queryKey: ['agent-platform', 'kagent', 'installations'],
    queryFn: () => kagentApi.listInstallations(),
    staleTime: INSTALLATIONS_STALE_TIME_MS,
  });

  // Key memos on contents, not identity: both arrays are derived fresh each
  // render. Extracted to variables so the deps can be statically checked.
  const kagentKey = kagentInstallations.join(',');
  const proxiedKey = proxiedInstallations?.join(',');

  const targets = useMemo(() => {
    // If the backend's list itself is unavailable, fall back to the inventory's
    // kagent installations rather than showing an empty page: a backend hiccup
    // shouldn't look like "you have no sessions".
    if (allowlistFailed) {
      return kagentInstallations;
    }
    if (!proxiedInstallations) {
      return [];
    }
    const allowed = new Set(proxiedInstallations);
    return kagentInstallations.filter(installation =>
      allowed.has(installation),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kagentKey, proxiedKey, allowlistFailed]);

  const sessionQueries = useQueries({
    queries: targets.map(installation => ({
      queryKey: sessionsQueryKey(installation),
      queryFn: () => kagentApi.listSessions(installation),
      // No `retry` override: the QueryClientProvider predicate already declines
      // to retry NotFoundError/ServiceUnavailableError, which is the normal
      // outcome for the installations without kagent.
    })),
  });

  const capabilitiesFor = useKagentCapabilitiesMap(targets);

  const { rows: agentRows } = useAgents();
  // Keyed on id *and* display name: `AgentRow.id` is
  // `installation/namespace/name`, which does not change when an agent's
  // display-name annotation does. AgentsDataProvider picks such an edit up (its
  // signature includes resourceVersion) and emits fresh rows, so keying on ids
  // alone would leave this index holding the previous objects and the table
  // showing the old name until an agent is added or removed.
  const agentRowsKey = agentRows
    .map(agent => `${agent.id}@${agent.name}`)
    .join('|');
  const agentIndex = useMemo(
    () => buildAgentIndex(agentRows),
    // Rebuild only when the agents actually change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentRowsKey],
  );

  // useQueries returns fresh arrays every render, so key the memo on a stable
  // signature of the per-installation outcomes.
  const readSignature = targets
    .map((installation, index) => {
      const query = sessionQueries[index];
      return `${installation}:${query?.status}:${query?.dataUpdatedAt}:${
        (query?.error as Error | null)?.name ?? ''
      }`;
    })
    .join('|');

  const value = useMemo<SessionsContextValue>(() => {
    const rows: SessionRow[] = [];
    const unreachable: string[] = [];

    targets.forEach((installation, index) => {
      const query = sessionQueries[index];
      if (!query) {
        return;
      }

      if (query.data) {
        rows.push(
          ...query.data
            .filter(isListableSession)
            .map(session => toSessionRow(session, agentIndex)),
        );
        return;
      }

      if (query.status !== 'error') {
        return;
      }

      // "kagent isn't deployed here" is the common case across the fleet and
      // isn't actionable, so it contributes nothing and stays silent. The backend
      // funnels every such outcome into a 404 → NotFoundError: kagent's own 404,
      // an unknown-installation 400, and connection-level failures (DNS, TLS,
      // refused). It deliberately does not use a 5xx for these, because anything
      // >= 500 is logged at `error` and forwarded to Sentry — once per
      // kagent-less installation per page view.
      //
      // ServiceUnavailableError is still treated as silent for safety, though the
      // backend now only raises it when *no* installation is configured at all, in
      // which case no session query runs.
      //
      // Anything else — including UpstreamError for a 5xx, a timeout or an
      // unreadable body — means kagent answered and failed, which is worth saying.
      const errorName = (query.error as Error | null)?.name;
      const notDeployed =
        errorName === 'NotFoundError' ||
        errorName === 'ServiceUnavailableError';
      if (!notDeployed) {
        unreachable.push(installation);
      }
    });

    // Only flag installations we are actually showing rows from: warning that a
    // list "isn't yours" is meaningless when the list is empty.
    const installationsWithRows = new Set(rows.map(row => row.installation));
    const notUserScopedInstallations = targets.filter(
      installation =>
        installationsWithRows.has(installation) &&
        // Strictly `false`. `undefined` means the probe hasn't resolved or kagent
        // reported no subject at all, and claiming either answer there would show
        // a healthy installation a warning it hasn't earned.
        capabilitiesFor(installation).isUserScoped === false,
    );

    const hasInstallations = allInstallations.length > 0;
    // Includes the backend's list and the inventory: without them there is a
    // window where nothing is loading yet and the table would flash "No sessions
    // found." before the first installation is even queried.
    const isBusy =
      hasInstallations &&
      (isProbing ||
        isLoadingAllowlist ||
        sessionQueries.some(query => query.isLoading));

    return {
      rows: sortSessionRows(rows),
      isLoading: isBusy && rows.length === 0,
      isLoadingMore: isBusy && rows.length > 0,
      hasInstallations,
      unreachableInstallations: unreachable,
      notUserScopedInstallations,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readSignature,
    agentIndex,
    capabilitiesFor,
    isProbing,
    isLoadingAllowlist,
    allInstallations.length,
  ]);

  return (
    <SessionsContext.Provider value={value}>
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) {
    throw new Error('useSessions must be used within a SessionsDataProvider');
  }
  return ctx;
}
