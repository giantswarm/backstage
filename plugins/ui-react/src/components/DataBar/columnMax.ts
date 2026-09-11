/**
 * The largest value in a table column, which every {@link DataBar} in it is
 * scaled against.
 *
 * Non-numeric, null and negative values count as zero rather than skewing or
 * inverting the scale, and an all-empty column returns `0` — which `DataBar`
 * reads as "draw no fill", so a column of em dashes draws empty tracks rather
 * than full bars.
 *
 * Lives here, beside its only consumer, rather than in each calling plugin.
 * It was briefly duplicated in `agent-platform` and `muster` on the grounds
 * that those two must not depend on each other — true, but beside the point:
 * both already depend on this package, so this is the shared home, and the
 * drift risk was concrete. The two plugins' bars sit on the same page, and a
 * later change to the scaling rule landing in one copy would have made them
 * scale differently there.
 */
export function columnMax<T>(
  rows: readonly T[],
  read: (row: T) => number | undefined | null,
): number {
  return rows.reduce((max, row) => {
    const value = read(row);
    return typeof value === 'number' && Number.isFinite(value) && value > max
      ? value
      : max;
  }, 0);
}
