import { useTheme } from '@material-ui/core';
import { categoricalColors } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The hue each numeric table column's data bar takes, keyed by **what the
 * column measures** rather than by where it sits.
 *
 * Two rules, and the second is the interesting one.
 *
 * **Keyed by measure, not by column position.** Money is the same hue on the
 * Cost tab and on Your sessions; token volume is the same hue in every table.
 * A reader moving between the four tables does not re-learn the colours, and
 * adding a column means adding a key rather than shifting every existing one.
 *
 * **Measures that mean the same thing share a slot.** The palette is eight
 * validated hues and the four tables between them show eleven columns, so a
 * hue per column is not available — and it would be the wrong goal anyway.
 * `cost` covers the gateway's measured spend *and* a session's estimate;
 * `calls` covers model calls, tool calls and MCP-server calls; `ratio` covers
 * share-of-spend and $/1M, which never appear together. Sharing is safe
 * precisely because the pairs never co-occur in one table — the invariant
 * `measures.test.ts` pins.
 *
 * **On colour-blindness:** the strict adjacent-pair gates the palette is
 * validated against exist for charts, where hue *is* the identity channel.
 * Here it is not — every column has a header and every cell renders its own
 * number, so the bar only has to look like a different column, not identify
 * one. That is why non-adjacent slots and shared slots are both fine here and
 * would not be in a chart legend.
 */
const MEASURE_SLOTS = {
  /** Invocations: model calls, tool calls, MCP-server calls. */
  calls: 0,
  /** Token volume: a total, or the input half where the two are split. */
  tokens: 1,
  /** The output half, which is smaller and priced several times higher. */
  outputTokens: 2,
  /** Money, measured or estimated. */
  cost: 3,
  sessions: 4,
  turns: 5,
  /** A derived ratio: share of spend, or $/1M tokens. */
  ratio: 6,
  avgTokensPerCall: 7,
} as const;

export type MeasureKey = keyof typeof MEASURE_SLOTS;

/** Every measure key, for the tests that pin the invariants above. */
export const MEASURE_KEYS = Object.keys(MEASURE_SLOTS) as MeasureKey[];

/** The slot a measure occupies, exposed so tests can assert distinctness. */
export function measureSlot(measure: MeasureKey): number {
  return MEASURE_SLOTS[measure];
}

/** The hue for each measure, for the active theme. */
export function useMeasureColor(): (measure: MeasureKey) => string {
  const theme = useTheme();
  const palette = categoricalColors(theme);
  return measure => palette[MEASURE_SLOTS[measure]];
}

/**
 * The largest value in a column, which every bar in it is scaled against.
 *
 * Non-numeric and negative values count as zero rather than skewing or
 * inverting the scale, and an all-empty column returns `0` — which `DataBar`
 * reads as "draw no fill", so a column of em dashes draws a column of empty
 * tracks rather than a column of full bars.
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
