export function formatDuration(durationMs: number): string {
  // Whole milliseconds: an average over runs is rarely one.
  const ms = Math.round(durationMs);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
