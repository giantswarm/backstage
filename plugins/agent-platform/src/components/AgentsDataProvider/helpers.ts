import type { crds } from '@giantswarm/k8s-types';
import type { Query } from '@tanstack/react-query';
import {
  Agent,
  AgentReadiness,
  deriveAgentReadiness,
  getAgentStatusChangedAt,
  isAgentTransitional,
  KubeObjectInterface,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Baseline poll for the fleet-wide agent list. Deliberately equal to the query
 * client's `staleTime` (see `QueryClientProvider`): interval refetches are *not*
 * gated by staleness, so a shorter interval would refetch data the client still
 * considers fresh and reintroduce exactly the background-refetch churn that
 * `staleTime` was set to avoid.
 *
 * This tier only exists to notice agents created, edited or deleted elsewhere
 * (kubectl, another tab, the scaffolder) — not to watch one converge, which is
 * what the transitional tier below is for.
 */
const BASELINE_REFETCH_INTERVAL_MS = 60_000;

/**
 * Poll for an installation that has an agent still converging. Matches kagent's
 * own UI, and roughly the controller's reconcile cadence.
 */
const TRANSITIONAL_REFETCH_INTERVAL_MS = 5_000;

/**
 * How long an agent may sit in a non-ready state before we stop treating it as
 * "converging" and let its installation fall back to the baseline.
 *
 * Without this bound a *permanently* broken agent — an unpullable image, a spec
 * the controller keeps rejecting — is transitional forever and would pin its
 * installation at the fast interval for as long as anyone leaves the tab open.
 * kagent's own UI has that bug. A healthy agent converges well inside this
 * window, and past it polling faster cannot help: the fix is a spec change,
 * which bumps the generation and starts the window again.
 */
const TRANSITIONAL_MAX_AGE_MS = 3 * 60_000;

/**
 * Per-installation refetch interval for the agent list.
 *
 * `useResources` applies this to each installation's list query separately, and
 * react-query re-evaluates it after every fetch resolves — so this needs no
 * provider state and is self-correcting: the installation an agent was just
 * created on tightens to the fast interval, converges, and relaxes on its own,
 * while installations whose agents are all ready never leave the baseline.
 *
 * Note that interval refetches only fire while the tab is focused
 * (`refetchIntervalInBackground` defaults to `false`), which is the same
 * guard kagent's UI implements by hand with `document.hidden`.
 */
export function getAgentsRefetchInterval(
  query: Query<KubeObjectInterface[]>,
): number {
  const items = query.state.data;
  if (!items?.length) {
    return BASELINE_REFETCH_INTERVAL_MS;
  }

  const now = Date.now();

  // This query lists Agents, so its items are Agent JSON — narrow to read the
  // status conditions the shared derivation expects.
  const isConverging = (items as crds.kagent.v1alpha2.Agent[]).some(json => {
    if (!isAgentTransitional(deriveAgentReadiness(json))) {
      return false;
    }

    const changedAt = getAgentStatusChangedAt(json);

    // No usable timestamp: treat the agent as just-changed rather than as stuck,
    // so a genuinely new agent is still picked up quickly.
    return changedAt === undefined || now - changedAt < TRANSITIONAL_MAX_AGE_MS;
  });

  return isConverging
    ? TRANSITIONAL_REFETCH_INTERVAL_MS
    : BASELINE_REFETCH_INTERVAL_MS;
}

/**
 * A single agent flattened into a plain row for the table. Plain objects (not
 * `Agent` instances) so default sorting/rendering is trivial and the table
 * layer stays decoupled from the resource classes.
 */
export type AgentRow = {
  /** Stable unique key: installation + namespace + resource name. */
  id: string;
  installation: string;
  namespace: string;
  /** Display name (annotation) falling back to the resource name. */
  name: string;
  /**
   * Technical (DNS-1123) resource name. Seeds the deterministic avatar — the
   * avatar derives from the technical name, not the display name.
   */
  technicalName: string;
  description: string;
  /**
   * Human-readable model label resolved from the referenced ModelConfig, or
   * `undefined` when the agent references no model (e.g. BYO agents).
   */
  model?: string;
  skillCount: number;
  /** Readiness derived from the agent's status conditions. */
  readiness: AgentReadiness;
  /**
   * Detail explaining a non-ready readiness (the reconcile error, or
   * "N/M pods are ready"), for a tooltip. `undefined` when there is nothing to
   * explain.
   */
  readinessMessage?: string;
  /**
   * Soft warning that the spec uses features the chosen runtime does not
   * support. Independent of readiness — a ready agent can carry one.
   */
  unsupportedFeaturesWarning?: string;
};

/**
 * Resolve an agent's `spec.declarative.modelConfig` reference to a
 * human-readable label by joining against the ModelConfigs on the same
 * installation. ModelConfigs are namespaced and must live in the agent's
 * namespace, so we match on both name and namespace.
 *
 * Falls back to the raw reference name when the ModelConfig can't be found
 * (unreadable, not yet loaded, or on another installation), and to `undefined`
 * when the agent references no model at all.
 */
export function resolveModelLabel(
  agent: Agent,
  modelConfigs: ModelConfig[],
): string | undefined {
  const ref = agent.getModelConfigName();
  if (!ref) {
    return undefined;
  }

  const namespace = agent.getNamespace();
  const match = modelConfigs.find(
    mc => mc.getName() === ref && mc.getNamespace() === namespace,
  );

  return match?.getDisplayName() ?? ref;
}

/** Flatten an `Agent` resource into a plain {@link AgentRow}. */
export function toAgentRow(
  agent: Agent,
  modelConfigs: ModelConfig[],
): AgentRow {
  const installation = agent.cluster;
  const namespace = agent.getNamespace() ?? '';
  const name = agent.getName();

  return {
    id: `${installation}/${namespace}/${name}`,
    installation,
    namespace,
    name: agent.getDisplayName(),
    technicalName: name,
    description: agent.getDescription() ?? '',
    model: resolveModelLabel(agent, modelConfigs),
    skillCount: agent.getSkillCount(),
    readiness: agent.getReadiness(),
    readinessMessage: agent.getReadinessMessage(),
    unsupportedFeaturesWarning: agent.getUnsupportedFeaturesWarning(),
  };
}

/** Stable ordering: by installation, then display name. */
export function sortAgentRows(rows: AgentRow[]): AgentRow[] {
  return [...rows].sort(
    (a, b) =>
      a.installation.localeCompare(b.installation) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Severity order for the readiness column: ascending sorts worst-first, so one
 * click puts the agents that need attention at the top. Alphabetical order on
 * the label would be meaningless ("Not accepted" < "Not ready" < "Pending" <
 * "Ready" only by accident).
 */
const READINESS_SEVERITY: Record<AgentReadiness, number> = {
  notAccepted: 0,
  notReady: 1,
  pending: 2,
  ready: 3,
};

/**
 * Client-side sort for the agents table, mirroring `sortSessionsBy`.
 *
 * Every column falls back to the display name as a tiebreaker so equal values
 * (one installation, or a whole table of ready agents) keep a stable, readable
 * order rather than the arbitrary one the fleet queries happened to resolve in.
 */
export function sortAgentsBy(
  rows: AgentRow[],
  sort: { column: unknown; direction: 'ascending' | 'descending' },
): AgentRow[] {
  const column = String(sort.column);
  const factor = sort.direction === 'ascending' ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (column === 'readiness') {
      const bySeverity =
        READINESS_SEVERITY[a.readiness] - READINESS_SEVERITY[b.readiness];
      return bySeverity !== 0
        ? bySeverity * factor
        : a.name.localeCompare(b.name);
    }

    if (column === 'skills') {
      return a.skillCount === b.skillCount
        ? a.name.localeCompare(b.name)
        : (a.skillCount - b.skillCount) * factor;
    }

    // Keep the default view grouped by installation, then name — the ordering
    // the list had before it was sortable.
    if (column === 'installation') {
      return (
        a.installation.localeCompare(b.installation) * factor ||
        a.name.localeCompare(b.name)
      );
    }

    const aValue = String(a[column as keyof AgentRow] ?? '');
    const bValue = String(b[column as keyof AgentRow] ?? '');
    return (
      aValue.localeCompare(bValue) * factor || a.name.localeCompare(b.name)
    );
  });
}
