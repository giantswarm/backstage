/**
 * The Usage screen's time-window control: the windows it offers and the URL
 * parameter they travel in, so every view of the screen reads the same scope
 * and a link carries it — the muster plugin's Connectors view included, which
 * is why this lives in the common package.
 *
 * Three fixed choices rather than a free-form picker, offered by a select
 * ("Last 7 days", …). The queries themselves take any whole number of days
 * (`llmUsageQueriesFor`), so widening this list is a one-line change here.
 */

/** The windows the select offers, in whole days. */
export const USAGE_WINDOW_OPTIONS = [7, 30, 90] as const;

export type UsageWindowDays = (typeof USAGE_WINDOW_OPTIONS)[number];

/** The URL search parameter the chosen window travels in (`?window=7d`). */
export const USAGE_WINDOW_PARAM = 'window';

/**
 * The default, and the value that keeps the URL clean of the parameter.
 *
 * The same 30 days as `WINDOW_DAYS` in `llmUsageQueries` — stated here rather
 * than imported, because that module's initialiser reads the gs metric
 * registry, and this one is also loaded by the scope controls, which have no
 * business pulling the whole query layer in (and whose tests mock the gs
 * package away). `usageWindow.test.ts` keeps the two from drifting.
 */
export const DEFAULT_USAGE_WINDOW_DAYS: UsageWindowDays = 30;

/**
 * The window a URL parameter names, or the default.
 *
 * Accepts `7d` (what {@link formatUsageWindowParam} writes) and a bare `7`,
 * because a hand-edited URL is a legitimate entry point. Anything that is not
 * exactly one of the offered windows is the default rather than an error —
 * a typo in a bookmark should not break the page, and a window the control
 * cannot represent would leave the control claiming one thing and the page
 * showing another.
 */
export function parseUsageWindowParam(
  value: string | null | undefined,
): UsageWindowDays {
  if (!value) {
    return DEFAULT_USAGE_WINDOW_DAYS;
  }
  const match = /^(\d{1,3})d?$/.exec(value.trim());
  if (!match) {
    return DEFAULT_USAGE_WINDOW_DAYS;
  }
  const days = Number(match[1]);
  return (
    USAGE_WINDOW_OPTIONS.find(option => option === days) ??
    DEFAULT_USAGE_WINDOW_DAYS
  );
}

/**
 * The parameter value for a window, or `undefined` for the default — the
 * default stays out of the URL so plain links keep working unchanged.
 */
export function formatUsageWindowParam(
  days: UsageWindowDays,
): string | undefined {
  return days === DEFAULT_USAGE_WINDOW_DAYS ? undefined : `${days}d`;
}

/**
 * Where a source's data starts inside the selected window, when it starts
 * after the window does — the case where the figures cover fewer days than
 * the control names.
 *
 * Every installation's metrics start on a different day (when its gateway or
 * muster began exporting them), so the views read it from the data rather than
 * from configuration, and only mention it when it cuts the window short.
 */
export type UsageDataStart = {
  /** The first UTC day with data, as `YYYY-MM-DD`. */
  day: string;
  /** How many of the window's days that leaves covered, today included. */
  coveredDays: number;
};

/**
 * The data start to mention for a window, or `undefined` when the data covers
 * the window's first day — or there is no data at all, which the views' empty
 * states already say.
 *
 * `windowDays` are the window's UTC days as `YYYY-MM-DD`, oldest first (the
 * keys the daily charts render); `firstDataDay` is the earliest of them that
 * holds any sample. Day keys compare as strings.
 */
export function usageDataStart(
  windowDays: readonly string[],
  firstDataDay: string | undefined,
): UsageDataStart | undefined {
  if (!firstDataDay || windowDays.length === 0) {
    return undefined;
  }
  if (firstDataDay <= windowDays[0]) {
    return undefined;
  }
  const coveredDays = windowDays.filter(day => day >= firstDataDay).length;
  return { day: firstDataDay, coveredDays };
}
