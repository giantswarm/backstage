/**
 * Pure logic for the Storybook coverage gate.
 *
 * The gate's one job: given the set of components `ui-react` exports, the set
 * of components that have a `*.stories.tsx`, and an allowlist of components
 * intentionally left without a story, report what is undocumented — and surface
 * allowlist entries that no longer match any export so the allowlist can't
 * silently rot.
 *
 * This function is deliberately free of any filesystem or Storybook runtime
 * concerns so it can be unit-tested in isolation; the thin CLI wrapper
 * (`scripts/check-story-coverage.mts`) reads the real exports/files/allowlist
 * and calls it.
 */

export interface StoryCoverageInput {
  /** Component names barrel-exported by the library (e.g. `AsyncValue`). */
  exportedComponents: string[];
  /** Component names that have a co-located `*.stories.tsx`. */
  storiedComponents: string[];
  /** Component names intentionally documented-elsewhere / not storied. */
  allowlist: string[];
}

export interface StoryCoverageResult {
  /** Exported components with no story and no allowlist entry — a failure. */
  undocumented: string[];
  /**
   * Allowlist entries that don't match any current export — a failure, so the
   * allowlist can't hide stale entries after a component is renamed/removed.
   */
  staleAllowlist: string[];
  /**
   * Stories whose component is no longer exported (e.g. a story left behind
   * after a component was renamed or removed) — a failure, so the story set
   * can't silently drift out of sync with the barrel.
   */
  danglingStories: string[];
  /**
   * Allowlist entries whose component actually has a story — a failure, so the
   * allowlist stays a list of genuine exceptions rather than accumulating
   * entries that no longer need excusing.
   */
  redundantAllowlist: string[];
}

export function checkStoryCoverage(
  input: StoryCoverageInput,
): StoryCoverageResult {
  const exported = new Set(input.exportedComponents);
  const storied = new Set(input.storiedComponents);
  const allowlisted = new Set(input.allowlist);

  const undocumented = [...exported]
    .filter(name => !storied.has(name) && !allowlisted.has(name))
    .sort();

  const staleAllowlist = [...allowlisted]
    .filter(name => !exported.has(name))
    .sort();

  const danglingStories = [...storied]
    .filter(name => !exported.has(name))
    .sort();

  const redundantAllowlist = [...allowlisted]
    .filter(name => storied.has(name))
    .sort();

  return { undocumented, staleAllowlist, danglingStories, redundantAllowlist };
}

/** True when every exported component is documented and nothing has drifted. */
export function isStoryCoverageComplete(result: StoryCoverageResult): boolean {
  return (
    result.undocumented.length === 0 &&
    result.staleAllowlist.length === 0 &&
    result.danglingStories.length === 0 &&
    result.redundantAllowlist.length === 0
  );
}
