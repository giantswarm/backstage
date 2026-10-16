import { useEffect, useMemo } from 'react';
import type { useSessionNotificationRecord } from '@giantswarm/backstage-plugin-agent-platform';
import {
  useMcpSignIn,
  type McpSignInStatus,
} from '@giantswarm/backstage-plugin-muster';
import type { InboxRowSource } from '../types';
import {
  mcpSignInMark,
  mcpSignInSubject,
  serversOfMcpSignInMark,
  toMcpSignInRow,
} from '../utils/mcpSignInRow';

type NotificationRecord = ReturnType<typeof useSessionNotificationRecord>;

/**
 * Guarded like the inbox's agent-platform hooks, for tests that mock the
 * muster plugin partially: without it there is no MCP sign-in row.
 */
const useStatus: () => McpSignInStatus | undefined =
  useMcpSignIn ?? (() => undefined);

const NO_SUBJECTS: ReadonlySet<string> = new Set();
const noop = () => {};

/**
 * The inbox's MCP sign-in row: one for the person's home installation while
 * any of its MCP servers waits for their sign-in or grant, from muster's
 * sign-in status (`McpSignInProvider`, read every five minutes and when the
 * tab regains focus). A sign-in finished in the row's dialog or on a muster
 * page removes the row through the same read. Nothing is stored for it but
 * its seen mark. Mount inside `McpSignInProvider`.
 */
export function useMcpSignInRowSource(
  record: NotificationRecord,
): InboxRowSource & { openSignIn: () => void } {
  const status = useStatus();
  const { isKnown, mcpSignInSeenMarkOf, markSeen } = record;
  const installation = status?.installation;
  const waiting = status?.waiting;
  const openSignIn = status?.openSignIn ?? noop;

  const seen = installation
    ? serversOfMcpSignInMark(mcpSignInSeenMarkOf(installation), installation)
    : undefined;
  const seenKey = seen?.join(',');

  const row = useMemo(
    () =>
      installation && waiting
        ? toMcpSignInRow({
            installation,
            waiting,
            seen: seenKey?.split(',').filter(Boolean),
            openSignIn,
          })
        : undefined,
    [installation, waiting, seenKey, openSignIn],
  );
  const rows = useMemo(() => (row ? [row] : []), [row]);

  // A server signed in to since the row was seen leaves the seen mark: so it
  // is news again if it waits again later (an expired grant). Only on an
  // answer from muster; a status it could not give says nothing was signed in.
  const isAvailable = Boolean(status?.isAvailable);
  const waitingKey = waiting?.map(server => server.name).join(',');
  useEffect(() => {
    if (
      !installation ||
      !isAvailable ||
      !isKnown ||
      seenKey === undefined ||
      waitingKey === undefined
    ) {
      return;
    }
    const before = seenKey.split(',').filter(Boolean);
    const now = waitingKey.split(',').filter(Boolean);
    if (
      now.length < before.length &&
      now.every(name => before.includes(name))
    ) {
      markSeen({
        kind: 'mcpSignIn',
        installation,
        mark: mcpSignInMark(installation, now),
      }).catch(() => {});
    }
  }, [installation, isAvailable, isKnown, seenKey, waitingKey, markSeen]);

  // Watched only while muster answers: a row that shows after it could not
  // say is no news.
  const subjects = useMemo(
    () =>
      installation && isAvailable
        ? new Set([mcpSignInSubject(installation)])
        : NO_SUBJECTS,
    [installation, isAvailable],
  );

  return {
    rows,
    subjects,
    ready: !status || (status.isRead && isKnown),
    openSignIn,
  };
}
