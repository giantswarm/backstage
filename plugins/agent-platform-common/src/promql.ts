/**
 * PromQL building blocks shared by the frontend's usage queries
 * (`llmUsageQueries` in the agent-platform plugin) and the backend's per-user
 * model cost, which builds its query server-side so the person it covers is
 * never a client choice. One copy, so the first-sample correction below cannot
 * drift between the two.
 */

/** A PromQL string literal's content: backslashes and quotes escaped. */
export function promqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * How far before a window's start a series must have a sample to count as
 * already existing there — see {@link counterIncrease}. An hour is sixty
 * scrapes at the gateway PodMonitor's 60 s interval, so a scrape hiccup at the
 * boundary does not make an old series look newborn, while the scan it adds
 * stays an hour per series however long the window.
 */
export const SERIES_BIRTH_LOOKBACK = '1h';

/**
 * The label {@link counterIncrease} puts on its first-sample term so that `or`
 * keeps both terms of a series. Every caller aggregates (`sum by (…)`), which
 * drops it again before a reader sees a series.
 */
export const FIRST_SAMPLE_LABEL = 'first_sample';

const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/** A simple PromQL duration (`30d`, `600s`) in seconds. */
export function durationSeconds(duration: string): number {
  const match = /^(\d+)([smhdw])$/.exec(duration);
  if (!match) {
    throw new Error(`Not a simple PromQL duration: ${duration}`);
  }
  return Number(match[1]) * DURATION_UNIT_SECONDS[match[2]];
}

/** Seconds as a PromQL duration, in whole days where it divides. */
export function formatDuration(seconds: number): string {
  return seconds % 86400 === 0 ? `${seconds / 86400}d` : `${seconds}s`;
}

/**
 * A counter's growth over a window **including the first sample of a series
 * born inside it** — a drop-in for `increase(series[range] offset offset)`
 * that the caller aggregates with `sum by (…)`.
 *
 * Why: `increase()` only sees growth *between* samples, and a Prometheus
 * counter series is born already holding its first value — the gateway
 * creates a series on the first model call for a label set (agent, user,
 * model, token type, pod). So every series loses its first call: on a fresh
 * lab the raw counters held $0.086 while the page said $0.042, and an
 * installation's first turns read "$0 / no model calls". A series with a
 * single sample in the window contributes nothing to `increase()` at all.
 *
 * Semantics: a series with **no sample in the {@link SERIES_BIRTH_LOOKBACK}
 * before the window starts** is taken to have started from zero inside the
 * window, and its smallest in-window value (`min_over_time`, which for a
 * counter is its first value unless it also reset) is added to its
 * `increase()`. Every other series is plain `increase()`. This is the
 * client-side form of what Prometheus's `created-timestamp-zero-ingestion`
 * does at ingestion (a synthetic zero at the series' creation time); that
 * would be exact, but needs the exporter to expose created timestamps and the
 * server flag, neither of which a portal controls.
 *
 * Per series, as PromQL:
 *
 *     increase(S[R] offset O)
 *       or label_replace(
 *            min_over_time(S[R] offset O)
 *              unless last_over_time(S[1h] offset (R+O)),
 *            "first_sample", "true", "__name__", ".*")
 *
 * The `label_replace` gives the first-sample term a label set of its own, so
 * `or` keeps both terms of a series instead of the left one alone, and the
 * caller's `sum by` adds them — one evaluation of each term, where
 * `A + B or A or B` would need two.
 *
 * Residual error, all bounded and none a server change can fix client-side:
 * - **Over-count, small:** for a newborn series `increase()` itself already
 *   extrapolates towards the window start by up to half the average scrape
 *   interval (capped where the counter would reach zero), which overlaps the
 *   added first value. The overlap is at most half the series' *average*
 *   growth per scrape over its in-window life — negligible for a series that
 *   lives hours, a few percent for one that lives minutes.
 * - **Over-count, rare but large:** a series that existed before the window
 *   but has no sample for the whole lookback before its start (a scrape
 *   outage of over an hour exactly at the boundary) is taken as newborn, and
 *   its whole pre-window value is added.
 * - **Under-count:** a newborn series that also reset inside the window adds
 *   its post-reset minimum, not its first value. A series reborn under the
 *   same labels (a gateway container restart, same pod) less than the
 *   lookback after its previous life ended still loses its first sample, as
 *   before.
 * - **Attribution:** the first value lands in the window (or daily bar) its
 *   first *scrape* falls in, at most one scrape interval after the call.
 */
export function counterIncrease(
  series: string,
  range: string,
  offset?: string,
): string {
  const shift = offset ? ` offset ${offset}` : '';
  const windowStart = formatDuration(
    durationSeconds(range) + (offset ? durationSeconds(offset) : 0),
  );
  const newborn = `min_over_time(${series}[${range}]${shift}) unless last_over_time(${series}[${SERIES_BIRTH_LOOKBACK}] offset ${windowStart})`;
  return `(increase(${series}[${range}]${shift}) or label_replace(${newborn}, "${FIRST_SAMPLE_LABEL}", "true", "__name__", ".*"))`;
}
