/**
 * Formats how long ago the live health reads were last updated, for the
 * dashboard / MCP-servers freshness indicator (ADR D4). Pure so it can be unit
 * tested without rendering; the component supplies `now` from a ticking clock.
 *
 * Returns an empty string when there is no successful read yet (no timestamp),
 * so the caller can render nothing during the cold first load.
 */
export function formatUpdatedAgo(
  updatedAt: number | undefined,
  now: number,
): string {
  if (!updatedAt || updatedAt <= 0) {
    return '';
  }
  const secs = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (secs < 5) {
    return 'updated just now';
  }
  if (secs < 60) {
    return `updated ${secs}s ago`;
  }
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `updated ${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  return `updated ${hrs}h ago`;
}
