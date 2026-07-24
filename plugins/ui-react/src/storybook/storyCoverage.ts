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

  return { undocumented, staleAllowlist };
}

/** True when every exported component is documented and the allowlist is clean. */
export function isStoryCoverageComplete(result: StoryCoverageResult): boolean {
  return result.undocumented.length === 0 && result.staleAllowlist.length === 0;
}
