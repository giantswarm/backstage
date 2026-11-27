const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, as short as a table column wants it: `5m ago`, `4h ago`,
 * `21d ago`, `3mo ago`, `2y ago`.
 */
export function shortAge(iso: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  if (ms < HOUR) {
    return `${Math.max(1, Math.floor(ms / MINUTE))}m ago`;
  }
  if (ms < DAY) {
    return `${Math.floor(ms / HOUR)}h ago`;
  }
  if (ms < 60 * DAY) {
    return `${Math.floor(ms / DAY)}d ago`;
  }
  if (ms < 730 * DAY) {
    return `${Math.floor(ms / (30 * DAY))}mo ago`;
  }
  return `${Math.floor(ms / (365 * DAY))}y ago`;
}

/** Whether a row matches Hive's header search: words in its title, repository, author or labels. */
export function matchesSearch(
  row: { title: string; repo: string; author: string; labels: string[] },
  query: string,
): boolean {
  const haystack = [row.title, row.repo, row.author, ...row.labels]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(word => haystack.includes(word));
}
