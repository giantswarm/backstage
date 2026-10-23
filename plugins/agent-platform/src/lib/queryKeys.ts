/**
 * The fleet-wide sessions list for one installation.
 *
 * A helper rather than a literal because five callers share it — the provider
 * that fills it, the agent detail page's sessions card, and the create, rename
 * and delete mutations that invalidate it. A typo in any one of them would leave
 * a write that appears to succeed while the list it changed never refreshes,
 * which is exactly the kind of bug nothing fails on.
 *
 * The first two segments matter beyond identity: `components/QueryClientProvider`
 * decides what may be persisted to localStorage by inspecting them, and
 * `'sessions'` is on the never-persist list — session titles are user-scoped
 * chat content.
 *
 * The per-session keys (`sessionQueryKey`, `sessionTasksQueryKey`) live with the
 * hook that owns those reads, in `hooks/useSessionDetail.ts`.
 */
export function sessionsQueryKey(installation: string) {
  return ['agent-platform', 'kagent', 'sessions', installation] as const;
}

/**
 * The backend's kagent installation list with per-installation reachability
 * (`GET /kagent/installations`, read by `useKagentInstallations`).
 *
 * Carries a version segment because the cache is persisted across releases
 * and the data shape changed: the previous key,
 * `['agent-platform', 'kagent', 'installations']`, held an array of *names*
 * for up to an hour in every browser, and this one holds objects. A stale
 * entry under the old key is simply never read again; a reader of this key
 * still guards the shape (`isKagentInstallationList`) so a foreign entry is
 * treated as "not answered yet" and refetched -- backstage#2264's rule.
 */
export function kagentInstallationsQueryKey() {
  return ['agent-platform', 'kagent', 'installations', 'v2'] as const;
}

/**
 * Derived state for one installation's sessions — what the switcher rail groups
 * by, computed by the backend.
 *
 * `'session-states'` is on `components/QueryClientProvider`'s never-persist list
 * for the same reason `'sessions'` is: it is one user's sessions, keyed by ids
 * only that user can resolve. Cheap to refetch, and wrong to leave on the disk
 * of a shared workstation.
 */
export function sessionStatesQueryKey(installation: string) {
  return ['agent-platform', 'kagent', 'session-states', installation] as const;
}

/**
 * The caller's usage summary for one installation, computed by the backend.
 *
 * `'session-usage'` is on `components/QueryClientProvider`'s never-persist list
 * for a stronger version of the reason `'sessions'` is: this is a breakdown of
 * what one person ran and which tools they reached for, which is a behavioural
 * profile and must not outlive sign-out on a shared workstation's disk.
 */
export function sessionUsageQueryKey(installation: string) {
  return ['agent-platform', 'kagent', 'session-usage', installation] as const;
}

/**
 * The caller's own model cost on one installation, per window. Under `kagent`
 * with the per-user reads, so `QueryClientProvider` keeps it off the disk.
 */
export function modelCostQueryKey(installation: string, days: number) {
  return [
    'agent-platform',
    'kagent',
    'model-cost',
    installation,
    days,
  ] as const;
}

/**
 * The model-manager reads, per installation — through muster as the person,
 * but about the installation: its inventory, backend descriptors and pull
 * jobs are the same for every user, so they are prefixed `model-manager` (not
 * `kagent`, not `muster`) and `components/QueryClientProvider` persists them.
 * Whether an installation has a model-manager at all is the `muster` question
 * (`musterServersQueryKey` below).
 */
export function modelManagerBackendQueryKey(installation: string) {
  return ['agent-platform', 'model-manager', 'backend', installation] as const;
}

/**
 * The list of every backend the installation's model-manager runs (`GET
 * /api/v1/backends`, model-manager 0.17 on). A key of its own, not the
 * single-descriptor key above: the cache is persisted across releases, and
 * an entry written by an older portal under `backend` holds one descriptor
 * object where this one holds an array.
 */
export function modelManagerBackendsQueryKey(installation: string) {
  return ['agent-platform', 'model-manager', 'backends', installation] as const;
}

export function modelManagerModelsQueryKey(installation: string) {
  return ['agent-platform', 'model-manager', 'models', installation] as const;
}

export function modelManagerJobsQueryKey(installation: string) {
  return ['agent-platform', 'model-manager', 'jobs', installation] as const;
}

export function modelManagerNodesQueryKey(installation: string) {
  return ['agent-platform', 'model-manager', 'nodes', installation] as const;
}
export function modelManagerPresetsQueryKey(
  installation: string,
  backend?: string,
) {
  return [
    'agent-platform',
    'model-manager',
    'presets',
    installation,
    backend ?? '',
  ] as const;
}
/** `check_fit` of one model on one backend, as the Serve dialog asks it. */
export function modelManagerFitQueryKey(
  installation: string,
  backend: string | undefined,
  model: string,
  placement: string = '',
  node: string = '',
) {
  return [
    'agent-platform',
    'model-manager',
    'fit',
    installation,
    backend ?? '',
    model,
    placement,
    node,
  ] as const;
}

/**
 * The muster-backed reads the agent creation Tools step and the agent detail
 * page make: the aggregator's presets, the per-session tool catalogue and the
 * resolution of one toolset for the caller.
 *
 * Deliberately prefixed `muster`, not `agent-platform`: the muster plugin's
 * `useServerSignIn` — rendered inline on both surfaces — invalidates every
 * `['muster', …]` query once a sign-in completes, and that is exactly when the
 * catalogue and the resolution must be re-read (the newly connected server's
 * tools appear). Sharing the prefix makes that one invalidation reach them.
 *
 * All three are per user (a resolution is toolset ∩ the caller's own session
 * catalogue; even the preset list is read through the caller's session), so
 * `components/QueryClientProvider` keeps the whole `muster` prefix out of
 * localStorage. New keys for a new data shape, per backstage#2264.
 */
export function musterToolsetPresetsQueryKey(installation: string) {
  return ['muster', 'agent-platform', 'toolset-presets', installation] as const;
}

export function musterToolCatalogueQueryKey(installation: string) {
  return ['muster', 'agent-platform', 'tool-catalogue', installation] as const;
}

/** Whether a toolset includes one tool, asked of muster by the tool's name. */
export function musterToolsetIncludesQueryKey(
  installation: string,
  selectors: string[],
  tool: string,
) {
  return [
    'muster',
    'agent-platform',
    'toolset-includes',
    installation,
    selectors.join(','),
    tool,
  ] as const;
}

export function musterToolsetResolutionQueryKey(
  installation: string,
  selectors: string[],
) {
  return [
    'muster',
    'agent-platform',
    'toolset-resolution',
    installation,
    selectors.join(','),
  ] as const;
}

/**
 * The agent-manager reads the create flow makes through muster as the
 * signed-in person: whether the installation's muster lists agent-manager at
 * all, what that agent-manager composes (`get_info`), the dry run of the
 * agent under review and the readiness of the one just created. All per
 * person, all under the `muster` prefix for the same two reasons as above:
 * they are never persisted, and the muster plugin's sign-in invalidation
 * re-reads them once the person connects to agent-manager.
 */
export function musterServersQueryKey(installation: string) {
  return ['muster', 'agent-platform', 'mcp-servers', installation] as const;
}

export function musterAgentManagerInfoQueryKey(installation: string) {
  return [
    'muster',
    'agent-platform',
    'agent-manager-info',
    installation,
  ] as const;
}

export function musterValidateAgentQueryKey(
  installation: string,
  specSignature: string,
) {
  return [
    'muster',
    'agent-platform',
    'validate-agent',
    installation,
    specSignature,
  ] as const;
}

/**
 * `get_agent_status` for one agent, optionally scoped to the write that is
 * being watched.
 *
 * `watch` identifies the write being followed, and it is part of the key on
 * purpose: a verdict is only about the revision that write produced, so two
 * watches must not share a cache entry. Without it, an `Update skills` on an
 * agent that was already `ready` inherits the previous watch's settled entry —
 * and its terminal `refetchInterval` — and reports success for a revision the
 * Harness has not compiled.
 *
 * It is unique per write rather than derived from the generation being waited
 * for. Two writes can start from the same generation — press `Update skills`
 * twice on an agent whose release cannot reconcile, so the template never moves
 * — and keying on the generation would serve the second one the first's
 * settled, timed-out entry, skipping the waiting alert entirely.
 *
 * A read with no write behind it (the detail page asking whether an agent
 * exists at all, and the create flow, which has no earlier generation) passes
 * nothing and keeps the plain key, so those still share one entry.
 */
export function musterAgentStatusQueryKey(
  installation: string,
  namespace: string,
  name: string,
  watch?: string,
) {
  return [
    'muster',
    'agent-platform',
    'agent-status',
    installation,
    namespace,
    name,
    ...(watch === undefined ? [] : [watch]),
  ] as const;
}

/**
 * The agent-manager reads the edit, update-skills and delete paths make on
 * one agent — as the signed-in person, under the same `muster` prefix (never
 * persisted, re-read when the person connects to agent-manager).
 */
export function musterAgentManagerAgentQueryKey(
  installation: string,
  namespace: string,
  name: string,
) {
  return [
    'muster',
    'agent-platform',
    'agent-manager-agent',
    installation,
    namespace,
    name,
  ] as const;
}

export function musterAgentManagerModelConfigsQueryKey(
  installation: string,
  namespace: string,
) {
  return [
    'muster',
    'agent-platform',
    'agent-manager-model-configs',
    installation,
    namespace,
  ] as const;
}

export function musterAgentManagerEgressPoliciesQueryKey(
  installation: string,
  namespace: string,
) {
  return [
    'muster',
    'agent-platform',
    'agent-manager-egress-policies',
    installation,
    namespace,
  ] as const;
}

export function musterValidateAgentUpdateQueryKey(
  installation: string,
  updateSignature: string,
) {
  return [
    'muster',
    'agent-platform',
    'validate-agent-update',
    installation,
    updateSignature,
  ] as const;
}

export function musterCommitAgentUpdateDryRunQueryKey(
  installation: string,
  updateSignature: string,
) {
  return [
    'muster',
    'agent-platform',
    'commit-agent-update-dry-run',
    installation,
    updateSignature,
  ] as const;
}

/**
 * cluster-manager, read through the person's muster session like agent-manager
 * above: what it offers (`get_info`), the installation's clusters with their
 * marks (`list_clusters`), one cluster's pools (`list_node_pools`) and the
 * create tool's schema (the curated accelerators, the arguments it takes).
 */
export function musterClusterManagerInfoQueryKey(installation: string) {
  return [
    'muster',
    'agent-platform',
    'cluster-manager-info',
    installation,
  ] as const;
}

export function musterClusterReleasesQueryKey(installation: string) {
  return [
    'muster',
    'agent-platform',
    'cluster-releases',
    installation,
  ] as const;
}

export function musterClustersQueryKey(installation: string) {
  return ['muster', 'agent-platform', 'clusters', installation] as const;
}

export function musterNodePoolsQueryKey(
  installation: string,
  cluster: string,
  namespace: string | undefined,
) {
  return [
    'muster',
    'agent-platform',
    'node-pools',
    installation,
    cluster,
    namespace ?? '',
  ] as const;
}

export function musterCreateNodePoolSchemaQueryKey(installation: string) {
  return [
    'muster',
    'agent-platform',
    'create-node-pool-schema',
    installation,
  ] as const;
}

/**
 * workspace-manager's reads, as the signed-in person: the workspaces and
 * Organizations of the person on one installation (`list_workspaces`) and one
 * workspace with its storage and Sessions (`get_workspace`). Under the
 * `muster` prefix like the reads above: what a person sees depends on their
 * Organizations, so none of it is persisted.
 */
export function musterWorkspacesQueryKey(installation: string) {
  return ['muster', 'agent-platform', 'workspaces', installation] as const;
}

export function musterWorkspaceQueryKey(installation: string, name: string) {
  return ['muster', 'agent-platform', 'workspace', installation, name] as const;
}

/**
 * The toolchain-manager's reads, as the signed-in person: the toolchains an
 * installation offers (`list_toolchains`), one version of one
 * (`describe_toolchain`) and the sources (`list_sources`). Under the `muster`
 * prefix like the workspace-manager's: what a person sees depends on their
 * GitHub App grant, so none of it is persisted.
 */
export function musterToolchainsQueryKey(installation: string) {
  return ['muster', 'agent-platform', 'toolchains', installation] as const;
}

export function musterToolchainQueryKey(
  installation: string,
  name: string,
  version: string,
) {
  return [
    'muster',
    'agent-platform',
    'toolchains',
    installation,
    name,
    version,
  ] as const;
}

/** A package search of the create page (`search_packages`). */
export function musterToolchainPackagesQueryKey(
  installation: string,
  query: string,
) {
  return [
    'muster',
    'agent-platform',
    'toolchain-packages',
    installation,
    query,
  ] as const;
}

/** A new toolchain's pull request, from its checks to its release. */
export function musterToolchainBuildQueryKey(
  installation: string,
  source: string,
  name: string,
  pull: number,
) {
  return [
    'muster',
    'agent-platform',
    'toolchain-build',
    installation,
    source,
    name,
    pull,
  ] as const;
}

export function musterToolchainSourcesQueryKey(installation: string) {
  return [
    'muster',
    'agent-platform',
    'toolchain-sources',
    installation,
  ] as const;
}

/**
 * The syncs the person started on this page load (a create, an edit,
 * Synchronize), by workspace row id: kept in the cache, written by the writes
 * and read by the list and the workspace's page, so both say Synchronizing
 * before the manager's reads do. Nothing fetches it.
 */
export function musterWorkspaceSyncsAwaitedQueryKey() {
  return ['muster', 'agent-platform', 'workspace-syncs-awaited'] as const;
}

/**
 * The last pushes of a workspace's repositories as of its last sync
 * (`preview_workspace`): a sibling of the workspace's key, so re-reading the
 * workspace after Sync now or Delete leaves the provider previews alone.
 */
export function musterWorkspaceLastPushesQueryKey(
  installation: string,
  name: string,
  lastSyncTime: string,
) {
  return [
    'muster',
    'agent-platform',
    'workspace-last-pushes',
    installation,
    name,
    lastSyncTime,
  ] as const;
}

/**
 * The namespaces of the Agents the person may list on an installation
 * (`ListAgents` as the person). One person's view: `'agent-namespaces'` is on
 * `QueryClientProvider`'s never-persist list.
 */
export function kagentAgentNamespacesQueryKey(installation: string) {
  return [
    'agent-platform',
    'kagent',
    'agent-namespaces',
    installation,
  ] as const;
}
