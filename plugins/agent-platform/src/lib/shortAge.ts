const UNITS: ReadonlyArray<[string, number]> = [
  ['y', 365 * 24 * 3600],
  ['w', 7 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['min', 60],
];

/**
 * How long ago `iso` was, in one short unit for a table cell: "2 h", "1 d",
 * "5 w", "1 y", "now" under a minute; empty for a missing or invalid time.
 */
export function shortAge(iso: string | undefined, now = new Date()): string {
  const time = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(time)) {
    return '';
  }
  const seconds = Math.max(0, (now.getTime() - time) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return `${Math.floor(seconds / size)} ${unit}`;
    }
  }
  return 'now';
}
