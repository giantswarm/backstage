import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  applyInstallationScope,
  useInstallationInventory,
  useInstallations,
  useInstallationScope,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import { isListableSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../../apis';
import { sessionsQueryKey } from '../../lib/queryKeys';
import {
  groupRowsByInstallation,
  type InstallationGroup,
} from '../../lib/installationGroups';
import { useKagentCapabilitiesMap } from '../../hooks/useKagentCapabilities';
import { useKagentInstallations } from '../../hooks/useKagentInstallations';
import { useAgents } from '../AgentsDataProvider';
import {
  buildAgentIndex,
  SessionRow,
  sortSessionRows,
  toSessionRow,
} from './helpers';

export type SessionsContextValue = {
  /**
   * Sessions flattened into plain rows: the home installation's first, then
   * the others'; most recent activity first within that.
   */
  rows: SessionRow[];
  /**
   * The same rows as one group per installation in scope, home first, each
   * with its own status (loading, rows, empty, could not be read, not
   * reachable from this portal). See `groupRowsByInstallation`.
   */
  groups: InstallationGroup<SessionRow>[];
  /** The section's installation scope the rows are narrowed to. */
  scope: InstallationScope;
  /**
   * The installations in scope that run kagent and that the backend knows a
   * kagent endpoint for, home first -- the groups' order. Includes the ones the
   * backend reports as not reachable, which are listed but never queried.
   */
  installations: string[];
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
  /**
   * Installations that run kagent but whose kagent endpoint the backend
   * reports as not reachable from this portal (its unauthenticated probe
   * failed: DNS, connection, TLS or timeout). Never queried, so nothing was
   * tried on the user's behalf and nothing can be retried -- listed in a quiet
   * note rather than counted in `unreachableInstallations`.
   */
  notReachableInstallations: string[];
};

const SessionsContext = createContext<SessionsContextValue | undefined>(
  undefined,
);

/**
 * Lists the signed-in user's kagent sessions across every installation in the
 * section's scope that runs kagent and that the backend proxies, and exposes
 * them as plain rows.
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
  const queryClient = useQueryClient();
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);

  // Which installations run kagent: those whose inventory has the `kagent.dev`
  // API group and whose access is healthy, home first (gs
  // `useInstallationInventory`, one `GET /apis` per installation shared by every
  // tab), narrowed to the section's scope. Same reason as the other providers,
  // and then some: a sessions request to an installation without kagent is
  // doomed, and each one mints that installation's Dex token before it can
  // fail.
  const inventory = useInstallationInventory();
  const { scope, home } = useInstallationScope();
  const kagentInstallations = applyInstallationScope(
    inventory.installationsWith('kagent'),
    scope,
  );
  const isProbing = inventory.isLoading || inventory.isProbing;

  // Which installations the backend proxies kagent for: a kagent URL derived
  // per installation, or the configured `agentPlatform.kagent.installations`
  // (URL override and hard allowlist) -- each with whether that URL is
  // reachable from this portal, from the backend's unauthenticated probe. The
  // intersection with the inventory is what gets queried — the backend knows
  // the URLs and whether they answer, the inventory knows who runs kagent;
  // none alone is enough.
  //
  // We deliberately *wait* for this before querying anything. It is one cheap
  // backend call, cached for an hour and persisted, so paying a single round-trip
  // up front is far cheaper than a wasted request to an installation the backend
  // has no route for.
  const {
    installations: proxiedInstallations,
    proxied,
    notReachable,
    isLoading: isLoadingAllowlist,
    isError: allowlistFailed,
  } = useKagentInstallations();

  // Key memos on contents, not identity: the arrays are derived fresh each
  // render. Extracted to variables so the deps can be statically checked.
  const kagentKey = kagentInstallations.join(',');
  const proxiedKey = proxied.join(',');
  const notReachableKey = notReachable.join(',');

  const { targets, notReachableInstallations } = useMemo(() => {
    // If the backend's list itself is unavailable, fall back to the inventory's
    // kagent installations rather than showing an empty page: a backend hiccup
    // shouldn't look like "you have no sessions".
    if (allowlistFailed) {
      return { targets: kagentInstallations, notReachableInstallations: [] };
    }
    if (!proxiedInstallations) {
      return { targets: [], notReachableInstallations: [] };
    }
    // An installation the backend reports as not reachable from this portal
    // (`reachable === false`) is skipped: its request would mint a token and
    // wait out the proxy's 10 s timeout into a 500, once per page view, for an
    // answer the backend already has. `'unknown'` (no probe settled yet) is
    // queried as before -- only an explicit `false` is acted on.
    const allowed = new Set(proxied);
    const unreachable = new Set(notReachable);
    return {
      targets: kagentInstallations.filter(installation =>
        allowed.has(installation),
      ),
      // Only installations that actually run kagent: a derived-but-unreachable
      // kagent URL on an installation without kagent is nothing to report.
      notReachableInstallations: kagentInstallations.filter(installation =>
        unreachable.has(installation),
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kagentKey, proxiedKey, notReachableKey, allowlistFailed]);

  // Home first, literally: the home installation's sessions are requested
  // alone, and the other installations' only once that request has answered
  // (or failed), so the person's own sessions are on screen before any other
  // installation is asked -- and before any other installation's token is
  // minted. Read from the cache rather than from `sessionQueries` below, which
  // this decides the `enabled` flags of; the home query is one of them, so its
  // answer re-renders this provider and the flags follow.
  const homeTargeted = home !== undefined && targets.includes(home);
  const homeState = homeTargeted
    ? queryClient.getQueryState(sessionsQueryKey(home))
    : undefined;
  const homeSettled =
    !homeTargeted ||
    homeState?.status === 'success' ||
    homeState?.status === 'error';
  const queriedTargets = homeSettled
    ? targets
    : targets.filter(installation => installation === home);

  const sessionQueries = useQueries({
    queries: targets.map(installation => ({
      queryKey: sessionsQueryKey(installation),
      queryFn: () => kagentApi.listSessions(installation),
      enabled: homeSettled || installation === home,
      // No `retry` override: the QueryClientProvider predicate already declines
      // to retry NotFoundError/ServiceUnavailableError, which is the normal
      // outcome for the installations without kagent.
    })),
  });

  // The identity probes follow the same order: no request leaves for another
  // installation before the home has answered.
  const capabilitiesFor = useKagentCapabilitiesMap(queriedTargets);

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

  const pipelineFor = useCallback(
    (installation: string) =>
      installations.find(candidate => candidate.name === installation)
        ?.pipeline,
    [installations],
  );

  const value = useMemo<SessionsContextValue>(() => {
    const rows: SessionRow[] = [];
    const unreachable: string[] = [];
    const pending: string[] = [];

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
        // No answer yet -- in flight, or not asked until the home has answered.
        pending.push(installation);
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
        !homeSettled ||
        sessionQueries.some(query => query.isLoading));

    const sortedRows = sortSessionRows(rows, home);

    // The groups: every kagent installation in scope that the backend knows an
    // endpoint for -- queried, or listed as not reachable. One the backend does
    // not proxy at all (outside its allowlist) is not a group, as it was not a
    // row before.
    const groupInstallations = kagentInstallations.filter(
      installation =>
        targets.includes(installation) ||
        notReachableInstallations.includes(installation),
    );
    const groups = groupRowsByInstallation(sortedRows, {
      installations: groupInstallations,
      home,
      pending,
      unreachable,
      notReachable: notReachableInstallations,
      pipelineFor,
    });

    return {
      rows: sortedRows,
      groups,
      scope,
      installations: groupInstallations,
      isLoading: isBusy && rows.length === 0,
      isLoadingMore: isBusy && rows.length > 0,
      hasInstallations,
      unreachableInstallations: unreachable,
      notUserScopedInstallations,
      notReachableInstallations,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readSignature,
    agentIndex,
    capabilitiesFor,
    isProbing,
    isLoadingAllowlist,
    homeSettled,
    home,
    scope,
    kagentKey,
    pipelineFor,
    allInstallations.length,
    notReachableInstallations,
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
