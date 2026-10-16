import { useEffect, useMemo, useState } from 'react';
import type { useSessionNotificationRecord } from '@giantswarm/backstage-plugin-agent-platform';
import {
  useMcpSignIn,
  type McpSignInStatus,
} from '@giantswarm/backstage-plugin-muster';
import type { DerivedInboxRow, InboxRowSource } from '../types';
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

/** How long a failed narrowing of the seen mark waits to be tried again. */
export const NARROW_RETRY_MS = 60_000;

/**
 * The inbox's MCP sign-in row: one for the person's home installation while
 * any of its MCP servers waits for their sign-in or grant, from muster's
 * sign-in status (`McpSignInProvider`, read every five minutes and when the
 * tab regains focus). A sign-in finished in the row's dialog or on a muster
 * page removes the row through the same read. Nothing is stored for it but
 * its seen mark. Mount inside `McpSignInProvider`.
 *
 * `ready` is the status's first answer. The inbox does not wait for it: a
 * row that arrives after the inbox's first read is quietly unread, since its
 * subject was not watched yet.
 */
export function useMcpSignInRowSource(
  record: NotificationRecord,
): InboxRowSource<DerivedInboxRow> {
  const status = useStatus();
  const { isKnown, mcpSignInSeenMarkOf, replaceSeenMark } = record;
  const installation = status?.installation;
  const waiting = status?.waiting;
  const isAvailable = Boolean(status?.isAvailable);
  const openSignIn = status?.openSignIn ?? noop;

  const storedMark = installation
    ? mcpSignInSeenMarkOf(installation)
    : undefined;
  const seen = useMemo(
    () =>
      installation
        ? serversOfMcpSignInMark(storedMark, installation)
        : undefined,
    [installation, storedMark],
  );

  const row = useMemo(
    () =>
      installation && waiting
        ? toMcpSignInRow({ installation, waiting, seen, openSignIn })
        : undefined,
    [installation, waiting, seen, openSignIn],
  );
  const rows = useMemo(() => (row ? [row] : []), [row]);

  // A server signed in to since the row was seen leaves the seen mark, so it
  // is news again if it waits again later (an expired grant). Only a server
  // muster now reports connected: one that merely left the list (muster
  // restarting, the server starting) keeps its place. Written only while the
  // stored mark is still the one read here, so a newer mark from another tab
  // or device is kept; a failed write is tried again.
  const connected = status?.connected;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (
      !installation ||
      !isAvailable ||
      !isKnown ||
      !seen ||
      storedMark === undefined ||
      !connected
    ) {
      return undefined;
    }
    const narrowed = seen.filter(name => !connected.includes(name));
    if (narrowed.length === seen.length) {
      return undefined;
    }
    let timer: number | undefined;
    let cancelled = false;
    replaceSeenMark(
      {
        kind: 'mcpSignIn',
        installation,
        mark: mcpSignInMark(installation, narrowed),
      },
      storedMark,
    ).catch(() => {
      if (!cancelled) {
        timer = window.setTimeout(
          () => setRetry(count => count + 1),
          NARROW_RETRY_MS,
        );
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    installation,
    isAvailable,
    isKnown,
    seen,
    storedMark,
    connected,
    replaceSeenMark,
    retry,
  ]);

  // Watched only while muster answers: a row that shows after it could not
  // say is no news.
  const subjects = useMemo(
    () =>
      installation && isAvailable
        ? new Set([mcpSignInSubject(installation)])
        : NO_SUBJECTS,
    [installation, isAvailable],
  );

  return { rows, subjects, ready: !status || status.isRead };
}
