import { useCallback, useMemo } from 'react';
import type { useSessionNotificationRecord } from '@giantswarm/backstage-plugin-agent-platform';
import type {
  DerivedInboxRow,
  InboxRowSource,
  ReadableInboxRowSource,
} from '../types';
import { isAt } from './useInboxInterruptions';

type NotificationRecord = ReturnType<typeof useSessionNotificationRecord>;

/**
 * A derived row is on screen on the page it opens, or one below it (a tab of
 * a session's page). The MCP sign-in row opens no page: never.
 */
function isDerivedRowOnScreen(row: DerivedInboxRow, pathname: string) {
  return isAt(pathname, row.href);
}

/**
 * The rows the shell derives from its own reads — the session rows and the
 * MCP sign-in row — as one source read through the person's Seen record, so
 * "Mark all read" stays one write to the seen marks: the record stores them
 * as one value, last write wins, and two writes at once could undo each
 * other.
 *
 * The sessions decide when it has read: the MCP sign-in row joins when muster
 * answers, quietly unread if that is after the tab's first read.
 */
export function useSeenRecordSource(
  record: NotificationRecord,
  sessions: InboxRowSource<DerivedInboxRow>,
  mcp: InboxRowSource<DerivedInboxRow>,
): ReadableInboxRowSource<DerivedInboxRow> {
  const { markSeen, markManySeen } = record;
  const rows = useMemo(
    () => [...sessions.rows, ...mcp.rows],
    [sessions.rows, mcp.rows],
  );
  const subjects = useMemo(
    () => new Set([...sessions.subjects, ...mcp.subjects]),
    [sessions.subjects, mcp.subjects],
  );

  const markRead = useCallback(
    (row: DerivedInboxRow, opened: boolean) =>
      markSeen(
        row.seenMark,
        opened ? { action: 'opened', kind: row.kind } : undefined,
      ),
    [markSeen],
  );

  const markAllRead = useCallback(async () => {
    const targets = rows.filter(row => row.unread).map(row => row.seenMark);
    if (targets.length === 0) {
      return false;
    }
    await markManySeen(targets);
    return true;
  }, [rows, markManySeen]);

  return {
    rows,
    subjects,
    ready: sessions.ready,
    markRead,
    markAllRead,
    isOnScreen: isDerivedRowOnScreen,
  };
}
