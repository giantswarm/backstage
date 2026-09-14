import { Theme } from '@material-ui/core';

/**
 * The categorical series palette: eight hues in a fixed order, for a chart
 * whose series are *identities* (a model, an agent) rather than a magnitude or
 * a status.
 *
 * **The order is the colour-blindness safety mechanism, not a preference.**
 * Adjacent slots are what a stacked segment or a neighbouring bar puts side by
 * side, and this ordering is one of the few that clears every adjacent gate in
 * both modes. Re-ordering it, or substituting a hue, silently breaks that —
 * re-validate before touching either.
 *
 * Verified against this app's chart surfaces (`background.paper`: `#FFFFFF`
 * light, `#424242` dark), seven slots, adjacent pairs:
 *
 * - light — worst adjacent CVD ΔE 9.1 (protan), normal-vision ΔE 19.6
 * - dark — worst adjacent CVD ΔE 8.4 (protan), normal-vision ΔE 19.3
 *
 * Both clear the ≥8 CVD target and the ≥15 normal-vision floor. Several slots
 * sit below 3:1 contrast against the surface, which obliges **relief**: every
 * chart using this palette must be accompanied by a legend and by a table of
 * the same figures, so identity never rests on the fill alone. The Cost tab's
 * per-model and per-agent tables are that relief for the usage charts.
 *
 * The dark column is the same eight hues re-stepped for a dark surface, not a
 * second palette and not an automatic lightening.
 */
const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
] as const;

const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const;

/**
 * How many identities a chart may colour before the rest have to be pooled.
 *
 * One fewer than the palette, because the pool itself needs a slot — and it
 * takes a neutral grey rather than a ninth hue, so "everything else" never
 * reads as one more peer series. A ninth generated hue is the thing this cap
 * exists to prevent: it would land inside another slot's CVD distance and no
 * validation covers it.
 */
export const MAX_CATEGORICAL_SERIES = CATEGORICAL_LIGHT.length - 1;

/** The label the pooled remainder is given. */
export const OTHER_SERIES_LABEL = 'Other';

/**
 * The categorical colours for the active theme, longest-lived first.
 *
 * Assign by position in a **stable** ranking of the series — never by whatever
 * order a response happened to arrive in, and never cycled past the end. A
 * colour belongs to the entity, so a chart re-rendered with one series missing
 * must not repaint the survivors.
 */
export function categoricalColors(theme: Theme): readonly string[] {
  return theme.palette.type === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

/** The neutral grey for the pooled remainder. */
export function otherSeriesColor(theme: Theme): string {
  return theme.palette.type === 'dark' ? '#8a8a85' : '#9e9d97';
}

/**
 * Colour one ranked series list, pooling anything past
 * {@link MAX_CATEGORICAL_SERIES}.
 *
 * Returns the colour for each key it can name plus, when the list was longer
 * than the palette, the set of keys the caller must fold into
 * {@link OTHER_SERIES_LABEL}.
 */
export function assignSeriesColors(
  rankedKeys: readonly string[],
  theme: Theme,
): { colors: Map<string, string>; pooled: string[] } {
  const palette = categoricalColors(theme);
  const kept = rankedKeys.slice(0, MAX_CATEGORICAL_SERIES);
  const pooled = rankedKeys.slice(MAX_CATEGORICAL_SERIES);

  const colors = new Map<string, string>();
  kept.forEach((key, index) => colors.set(key, palette[index]));
  if (pooled.length > 0) {
    colors.set(OTHER_SERIES_LABEL, otherSeriesColor(theme));
  }

  return { colors, pooled };
}
