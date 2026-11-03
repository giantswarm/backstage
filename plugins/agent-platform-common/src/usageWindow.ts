/**
 * The Usage screen's time-window control: the windows it offers and the URL
 * parameter they travel in, so every view of the screen reads the same scope
 * and a link carries it — the muster plugin's Connectors view included, which
 * is why this lives in the common package.
 *
 * Three fixed choices of days rather than a free-form picker, offered by a
 * select ("Last 7 days", …), and beside them the calendar months
 * ({@link usageMonthOptions}): this month so far and the two before it, the
 * chargeback view of giantswarm/backstage#2672. The queries themselves take
 * any whole number of days (`llmUsageQueriesFor`), so widening the days list
 * is a one-line change here.
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

/** A calendar month in UTC, as `YYYY-MM`: what the URL carries for it. */
export type UsageMonth = string;

/**
 * The window the Usage screen reads: a number of days back from today, or
 * one calendar month. The gateway views take either; the views that read a
 * days window only (Your sessions, Connectors) take the days, or the default
 * for a month ({@link usageWindowDaysOnly}).
 */
export type UsageWindow =
  { kind: 'days'; days: number } | { kind: 'month'; month: UsageMonth };

/**
 * How many months the select offers, this month included. The installations
 * keep about three months of metrics, so two full past months are the useful
 * range; a month before the records shows an empty page.
 */
export const USAGE_MONTHS_OFFERED = 3;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_SECONDS = 86_400;

/** The `YYYY-MM` of a Unix time in milliseconds, in UTC. */
export function usageMonthOf(timeMs: number): UsageMonth {
  const date = new Date(timeMs);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

function monthParts(month: UsageMonth): { year: number; month: number } {
  const match = MONTH_KEY.exec(month);
  if (!match) {
    throw new Error(`Not a calendar month: ${month}`);
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The month before `month`. */
export function previousUsageMonth(month: UsageMonth): UsageMonth {
  const { year, month: m } = monthParts(month);
  return usageMonthOf(Date.UTC(year, m - 2, 1));
}

/** The months the select offers, this month first, then back in time. */
export function usageMonthOptions(now: number = Date.now()): UsageMonth[] {
  const months: UsageMonth[] = [];
  let month = usageMonthOf(now);
  for (let i = 0; i < USAGE_MONTHS_OFFERED; i += 1) {
    months.push(month);
    month = previousUsageMonth(month);
  }
  return months;
}

/** Where a calendar month starts and ends, in Unix seconds, and its length. */
export type UsageMonthBounds = {
  /** The month's first midnight, UTC. */
  start: number;
  /** The next month's first midnight, UTC: the end, exclusive. */
  end: number;
  /** Whole days in the month. */
  days: number;
  /** Whether `now` falls inside the month, so it is still being written. */
  current: boolean;
};

export function usageMonthBounds(
  month: UsageMonth,
  now: number = Date.now(),
): UsageMonthBounds {
  const { year, month: m } = monthParts(month);
  const start = Date.UTC(year, m - 1, 1) / 1000;
  const end = Date.UTC(year, m, 1) / 1000;
  const nowSeconds = now / 1000;
  return {
    start,
    end,
    days: Math.round((end - start) / DAY_SECONDS),
    current: nowSeconds >= start && nowSeconds < end,
  };
}

/**
 * The window a URL parameter names: `7d` (or a bare `7`) for days, as
 * {@link parseUsageWindowParam} reads it, or `2026-10` for a month the
 * select offers. Anything else is the default days window, for the reasons
 * that function gives; so is a month the select does not offer, which the
 * records would not cover anyway.
 */
export function parseUsageWindow(
  value: string | null | undefined,
  now: number = Date.now(),
): UsageWindow {
  const trimmed = value?.trim() ?? '';
  if (MONTH_KEY.test(trimmed) && usageMonthOptions(now).includes(trimmed)) {
    return { kind: 'month', month: trimmed };
  }
  return { kind: 'days', days: parseUsageWindowParam(value) };
}

/** The parameter value for a window, or `undefined` for the default. */
export function formatUsageWindow(window: UsageWindow): string | undefined {
  return window.kind === 'month'
    ? window.month
    : formatUsageWindowParam(window.days as UsageWindowDays);
}

/**
 * The days window a days-only view reads: the window's own days, or the
 * default for a month, which such a view cannot show.
 */
export function usageWindowDaysOnly(window: UsageWindow): UsageWindowDays {
  return window.kind === 'days'
    ? (window.days as UsageWindowDays)
    : DEFAULT_USAGE_WINDOW_DAYS;
}

/** `October 2026`, or `November 2026 so far` for the month still being written. */
export function usageMonthLabel(
  month: UsageMonth,
  now: number = Date.now(),
): string {
  const { year, month: m } = monthParts(month);
  const name = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
  return usageMonthBounds(month, now).current ? `${name} so far` : name;
}

/**
 * A number of days back from today as a label: `last 7 days`, or `last day`
 * for one — for a stat's subtitle (`yours, last 30 days`).
 *
 * With {@link lastDaysNoun}, where every days window in the copy turns into
 * words, so a PromQL duration (`7d`) never reaches it and a window of one day
 * (kagent's `sessionUsage.windowDays` is configurable) never reads `1 days`.
 */
export function lastDaysLabel(days: number): string {
  return days === 1 ? 'last day' : `last ${days} days`;
}

/** A number of days back from today as a noun: `the last 7 days`, `the last day`. */
export function lastDaysNoun(days: number): string {
  return `the ${lastDaysLabel(days)}`;
}

/** The window as a noun: `the last 30 days`, `October 2026`, `November 2026 so far`. */
export function usageWindowNoun(
  window: UsageWindow,
  now: number = Date.now(),
): string {
  return window.kind === 'month'
    ? usageMonthLabel(window.month, now)
    : lastDaysNoun(window.days);
}

/** The window in a sentence: `over the last 30 days`, `in October 2026`. */
export function usageWindowPhrase(
  window: UsageWindow,
  now: number = Date.now(),
): string {
  return window.kind === 'month'
    ? `in ${usageMonthLabel(window.month, now)}`
    : `over ${lastDaysNoun(window.days)}`;
}
