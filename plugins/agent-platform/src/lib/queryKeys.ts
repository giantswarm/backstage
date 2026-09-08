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
 * The model-manager reads, per installation. Prefixed `model-manager` (not
 * `kagent`) so `components/QueryClientProvider`'s user-scoped filter leaves
 * them alone: an installation's inventory, backend descriptor and pull jobs
 * are the same for every user, and safe to persist.
 */
export function modelManagerInstallationsQueryKey() {
  return ['agent-platform', 'model-manager', 'installations'] as const;
}

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
