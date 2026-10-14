import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { needsAttention } from '../RecentSessions/helpers';

/**
 * The sessions that started waiting on the person since the last look.
 *
 * `previous` is what the last look saw — `true` for a session that was already
 * waiting, `false` for one that was not; absent for one never seen. A session
 * counts as newly waiting when it waits now and either was seen not waiting,
 * or was never seen but its state moved at or after `since` (the watcher's
 * start). The second case is what keeps the first poll — and an installation
 * whose summary arrives late — from announcing every session that was already
 * waiting before anybody was watching, while still catching one that flipped
 * between two polls the first of which did not evaluate it.
 */
export function findNewlyWaiting(
  states: Map<string, SessionStateEntry>,
  previous: Map<string, boolean>,
  since: number,
): string[] {
  const ids: string[] = [];
  for (const [id, entry] of states) {
    if (!needsAttention(entry)) {
      continue;
    }
    const before = previous.get(id);
    if (before === true) {
      continue;
    }
    if (
      before === false ||
      (entry.changedAt !== undefined && entry.changedAt >= since)
    ) {
      ids.push(id);
    }
  }
  return ids;
}
