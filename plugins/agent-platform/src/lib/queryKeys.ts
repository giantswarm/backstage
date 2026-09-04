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
