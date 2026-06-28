const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/**
 * Human relative time against the current clock -- "9 days ago", "in 23
 * minutes". Mirrors the mockups' `formatRelative`, but against `Date.now()`
 * (the lab UI shows live CRs, not a fixed snapshot). Returns `undefined` for
 * missing/invalid input so callers can omit the line entirely.
 */
export function formatRelativeTime(iso?: string): string | undefined {
  if (!iso) {
    return undefined;
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return undefined;
  }
  const diffSeconds = (Date.now() - then) / 1000;
  const past = diffSeconds >= 0;
  const abs = Math.abs(diffSeconds);

  let value: number;
  let unit: string;
  if (abs < HOUR) {
    value = Math.max(1, Math.round(abs / MINUTE));
    unit = 'minute';
  } else if (abs < DAY) {
    value = Math.round(abs / HOUR);
    unit = 'hour';
  } else {
    value = Math.round(abs / DAY);
    unit = 'day';
  }
  const label = `${value} ${unit}${value === 1 ? '' : 's'}`;
  return past ? `${label} ago` : `in ${label}`;
}

/** ISO timestamp -> locale string, or `undefined` for missing/invalid input. */
export function formatTimestamp(iso?: string): string | undefined {
  if (!iso) {
    return undefined;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
