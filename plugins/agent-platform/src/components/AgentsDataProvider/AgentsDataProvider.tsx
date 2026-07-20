import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Agent,
  isNotFoundError,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import { useModelConfigs } from '../ModelConfigsProvider';
import { AgentRow, sortAgentRows, toAgentRow } from './helpers';

export type AgentsContextValue = {
  /** Agents flattened into plain rows, ordered by installation + name. */
  rows: AgentRow[];
  /**
   * Initial load: no rows to show yet and the fleet is still being queried.
   * Only true until the first installation responds — a single slow or failing
   * installation must not keep the whole table in a skeleton state.
   */
  isLoading: boolean;
  /**
   * Rows are already shown, but some installations are still being queried (so
   * more rows may appear). Lets the UI show a subtle "loading more" hint instead
   * of a blocking skeleton.
   */
  isLoadingMore: boolean;
  /** Whether any installation is configured at all. */
  hasInstallations: boolean;
  /**
   * Installations we queried but couldn't read (unreachable, or the user lacks
   * permission to list Agents there). Surfaced instead of silently dropped so
   * an empty result is distinguishable from a partial/failed one.
   */
  unreachableInstallations: string[];
};

const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);

/**
 * Lists kagent Agents across every reachable installation (all namespaces) and
 * exposes them as plain rows. Model references are resolved against the
 * ModelConfigs queried by {@link ModelConfigsProvider}, so this must be mounted
 * inside one.
 */
export function AgentsDataProvider({ children }: { children: ReactNode }) {
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);

  // Only query reachable installations so the fleet-wide query doesn't fan out
  // to unreachable/forbidden clusters (each hangs for the full proxy timeout
  // and retries, dominating the tail). Same rationale as ModelConfigsProvider.
  const { installations: reachableInstallations, isProbing } =
    useReachableInstallations(allInstallations);

  // allInstallations/reachableInstallations are derived fresh each render; key
  // memos/effects on their contents rather than their (unstable) identity.
  const allInstallationsKey = allInstallations.join(',');
  const reachableInstallationsKey = reachableInstallations.join(',');

  // Single Agent version (v1alpha2), so skip API version discovery — it adds
  // round-trips per cluster for no benefit here. `clustersData` is the raw
  // per-cluster list result (present, and possibly empty, only for clusters that
  // responded successfully); `resources` are those hydrated into Agent instances.
  const { resources, clustersData, isLoading, errors } = useResources(
    reachableInstallations,
    Agent,
    {},
    { enableDiscovery: false },
  );

  // Model labels resolve progressively as ModelConfigs arrive; we deliberately
  // don't block the agent rows on the ModelConfig query settling.
  const { modelConfigsFor } = useModelConfigs();

  // Sticky, per-installation caches. The set of installations `useResources`
  // queries churns during a session: it starts optimistically wide (every
  // configured installation) and then narrows to the reachable subset once the
  // cluster-access probes settle. `resources`/`errors` only ever reflect the
  // *current* set, so an installation dropping out of that set would otherwise
  // make its agents vanish from the table. We instead remember the last-known
  // result per installation and only ever replace an installation's entry when
  // it responds again — so a healthy installation's agents stay put even after
  // it leaves the queried set (or a background refetch transiently fails).
  const [agentsByInstallation, setAgentsByInstallation] = useState<
    Record<string, Agent[]>
  >({});
  const [erroredInstallations, setErroredInstallations] = useState<string[]>(
    [],
  );

  // Stable signature of this render's per-cluster outcome, so the reconciling
  // effect runs only when the actual results change (clustersData/errors are
  // fresh arrays every render).
  const readSignature = useMemo(() => {
    const ok = clustersData.map(
      ({ cluster, data }) =>
        // Include resourceVersion so an in-place edit to an existing Agent
        // (same name, changed model/description/skills/annotation) changes the
        // signature and the reconcile effect refreshes its cached instance.
        `ok:${cluster}:${data
          .map(
            item =>
              `${item.metadata?.name ?? ''}@${
                item.metadata?.resourceVersion ?? ''
              }`,
          )
          .join(',')}`,
    );
    // Include the error discriminator: the reconcile effect classifies by error
    // name (a 404 is an empty read, anything else is a failure), so a same-cluster
    // error→error transition that flips the name (404 ⇄ 403) must change the
    // signature, or the effect wouldn't re-run and would keep the stale verdict.
    const failed = errors.map(
      e =>
        `err:${e.cluster}:${
          e.type === 'incompatibility' ? 'incompat' : e.error.name
        }`,
    );
    return [...ok, ...failed].sort().join('|');
  }, [clustersData, errors]);

  useEffect(() => {
    // A 404 means the kagent.dev API group isn't installed on that cluster —
    // kagent simply isn't deployed there. Treat it as a successful empty read
    // (zero agents), not a "couldn't read" failure: the cluster is reachable and
    // we can list it, there just are no Agents. Genuine failures (403 forbidden,
    // unreachable) still count as errors.
    const notInstalled = new Set(
      errors.filter(isNotFoundError).map(e => e.cluster),
    );

    // Clusters that responded successfully this render (empty result included),
    // plus the kagent-not-installed 404s treated as empty.
    const succeeded = new Set([
      ...clustersData.map(c => c.cluster),
      ...notInstalled,
    ]);
    const nextAgents: Record<string, Agent[]> = {};
    for (const cluster of succeeded) {
      nextAgents[cluster] = [];
    }
    for (const agent of resources) {
      nextAgents[agent.cluster]?.push(agent);
    }
    setAgentsByInstallation(prev => ({ ...prev, ...nextAgents }));

    const failedNow = errors
      .map(e => e.cluster)
      .filter(cluster => !succeeded.has(cluster));
    setErroredInstallations(prev => {
      const next = new Set(prev);
      // A successful read clears any prior "couldn't read" for that cluster;
      // a fresh failure (with no success this render) marks it.
      for (const cluster of succeeded) {
        next.delete(cluster);
      }
      for (const cluster of failedNow) {
        next.add(cluster);
      }
      return Array.from(next).sort();
    });
    // Keyed on the stable signature; clustersData/resources/errors are the
    // fresh-every-render inputs the signature already summarises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readSignature]);

  // Prune cached entries for installations that have durably left the reachable
  // set (session-expired, degraded, or removed from config). They are no longer
  // queried, so they'd never produce a success/error to refresh or clear them —
  // leaving stale agents shown as if live. A *transient* refetch failure keeps
  // the installation reachable, so its rows are retained; only a durable
  // drop-out is pruned here.
  useEffect(() => {
    const reachable = new Set(reachableInstallations);
    setAgentsByInstallation(prev => {
      const kept = Object.fromEntries(
        Object.entries(prev).filter(([cluster]) => reachable.has(cluster)),
      );
      return Object.keys(kept).length === Object.keys(prev).length
        ? prev
        : kept;
    });
    setErroredInstallations(prev => {
      const kept = prev.filter(cluster => reachable.has(cluster));
      return kept.length === prev.length ? prev : kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachableInstallationsKey]);

  const value = useMemo<AgentsContextValue>(() => {
    const rows = sortAgentRows(
      Object.entries(agentsByInstallation).flatMap(([cluster, agents]) =>
        agents.map(agent => toAgentRow(agent, modelConfigsFor(cluster))),
      ),
    );

    // Surface only the genuinely actionable case: a currently-healthy cluster we
    // have *nothing* for. Intersecting with the reachable (healthy) set means a
    // cluster that degrades mid-session drops out of the card immediately — the
    // sidebar Cluster-access widget owns that state, so we'd otherwise duplicate
    // it. And if we're still showing an installation's last-known agents, don't
    // also claim we couldn't read it.
    const reachableSet = new Set(reachableInstallations);
    const unreachableInstallations = erroredInstallations.filter(
      cluster =>
        reachableSet.has(cluster) && !agentsByInstallation[cluster]?.length,
    );

    // The fleet-wide query reports "loading" until every installation settles,
    // so gate the blocking state on having no rows yet — otherwise one slow or
    // failing installation would hide agents already loaded from healthy ones.
    // Also gate on hasInstallations: with none configured, useReachableInstallations
    // reports isProbing forever (its empty-status fallback), which would otherwise
    // pin isLoading true and hide the "no installations configured" empty state.
    const hasInstallations = allInstallations.length > 0;
    const isBusy = hasInstallations && (isProbing || isLoading);
    return {
      rows,
      isLoading: isBusy && rows.length === 0,
      isLoadingMore: isBusy && rows.length > 0,
      hasInstallations,
      unreachableInstallations,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    agentsByInstallation,
    erroredInstallations,
    isLoading,
    isProbing,
    modelConfigsFor,
    allInstallationsKey,
    reachableInstallationsKey,
  ]);

  return (
    <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
  );
}

export function useAgents(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error('useAgents must be used within an AgentsDataProvider');
  }
  return ctx;
}
