/**
 * Client-side classification of an aggregated tool by how dangerous executing
 * it is. This mirrors the muster-backend `/call` guard (same verb list) so the
 * UI's prediction matches what the proxy will actually accept, and adds a
 * hard block for cluster-mutating verbs that must never be run from the portal
 * because every cluster is GitOps-managed.
 *
 * ponytail: a substring/name heuristic, not a real capability model — muster
 * exposes no read/write annotation, so a misnamed mutating tool could read as
 * `readonly` (or a read tool named "...settings" reads as `mutating` because it
 * contains "set"). The verb list is intentionally identical to the backend's so
 * the two agree. Upgrade path: a server-provided read/write annotation per tool.
 */

export type ToolRisk = 'readonly' | 'mutating' | 'blocked';

/**
 * Verbs that mark a tool as mutating. Kept identical to MUTATING_VERBS in
 * plugins/muster-backend/src/router.ts so the client guard and the server guard
 * never disagree.
 */
const MUTATING_VERBS = [
  'apply',
  'create',
  'update',
  'delete',
  'patch',
  'scale',
  'restart',
  'stop',
  'start',
  'exec',
  'write',
  'remove',
  'set',
];

/**
 * Verbs that write directly to a cluster's desired state. These are hard-blocked
 * in the UI regardless of the installation's `allowMutations` flag: clusters are
 * managed via GitOps, never by ad-hoc apply/patch from the portal.
 */
const CLUSTER_WRITE_VERBS = ['apply', 'patch'];

export function classifyTool(name: string): ToolRisk {
  const lower = name.toLowerCase();
  if (CLUSTER_WRITE_VERBS.some(verb => lower.includes(verb))) {
    return 'blocked';
  }
  if (MUTATING_VERBS.some(verb => lower.includes(verb))) {
    return 'mutating';
  }
  return 'readonly';
}
