/**
 * The largest value in a table column, which every data bar in it is scaled
 * against.
 *
 * Non-numeric and negative values count as zero rather than skewing or
 * inverting the scale, and an all-empty column returns `0` — which `DataBar`
 * reads as "draw no fill", so a column of em dashes draws empty tracks rather
 * than full bars.
 *
 * The agent-platform plugin has the same function for its own tables
 * (`lib/measures.ts`). Duplicated rather than shared because these two plugins
 * deliberately do not depend on each other — muster attaches its section to the
 * Usage tab by node id precisely so neither has to. Four lines is a cheaper
 * price than that coupling; if a third caller appears, promote it to
 * `ui-react` beside `DataBar`.
 */
export function columnMax<T>(
  rows: readonly T[],
  read: (row: T) => number | undefined,
): number {
  return rows.reduce((max, row) => {
    const value = read(row);
    return typeof value === 'number' && Number.isFinite(value) && value > max
      ? value
      : max;
  }, 0);
}
