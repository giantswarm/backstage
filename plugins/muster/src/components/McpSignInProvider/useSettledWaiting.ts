import { useEffect, useState } from 'react';

/**
 * How soon a read that leaves the waiting servers unsettled is followed by
 * another: muster's session start connects its servers within about 20 s
 * (`initSSOTimeout` plus its grace), so a few seconds apart sees it finish.
 */
export const SETTLE_REREAD_MS = 5_000;

/**
 * How far apart two reads must be to confirm a waiting set: a re-read on focus
 * a moment after the first read says nothing new about a transient state.
 */
export const SETTLE_MIN_APART_MS = 3_000;

/**
 * How long reads keep following each other quickly while the status will not
 * settle, and while muster's report of a server still connecting holds the
 * waiting servers back. Past it the regular reads take over, and two of them
 * with the same waiting set raise it even while a server stays connecting
 * (muster retrying a refused fresh token reports that for up to minutes).
 */
export const SETTLE_WINDOW_MS = 60_000;

/** One read of muster's sign-in status, as the settling sees it. */
export type SettleRead = {
  /** The servers that wait for the person's sign-in, by name, sorted. */
  waiting: readonly string[];
  /** muster is still connecting a server for this session (`sso_pending`). */
  connecting: boolean;
  /** When the read was answered (ms since the epoch). */
  at: number;
};

export type SettleState = {
  /** The waiting servers that have settled: what the person is told about. */
  settled: string[];
  /** A waiting set seen once, to be confirmed by a later read. */
  candidate?: { key: string; at: number };
  /** When the status stopped being settled, while it is not. */
  unsettledSince?: number;
};

export const UNSETTLED: SettleState = { settled: [] };

/**
 * The waiting servers after one more read. A server that stops waiting leaves
 * at once: fewer servers waiting raises nothing. A server that starts to wait
 * joins only once the status has settled: not while muster reports a server
 * still connecting (the session's start is still running, and servers it has
 * not reached yet read `auth_required`), and only when a second read at least
 * {@link SETTLE_MIN_APART_MS} later reports the same waiting set.
 */
export function settleWaiting(
  previous: SettleState,
  read: SettleRead,
): SettleState {
  const waiting = [...read.waiting];
  const key = waiting.join('\n');
  const narrowed = waiting.filter(name => previous.settled.includes(name));
  if (narrowed.length === waiting.length) {
    return { settled: waiting };
  }
  const unsettledSince = previous.unsettledSince ?? read.at;
  const holdsBack =
    read.connecting && read.at - unsettledSince < SETTLE_WINDOW_MS;
  if (holdsBack) {
    return { settled: narrowed, unsettledSince };
  }
  const { candidate } = previous;
  if (candidate?.key === key && read.at - candidate.at >= SETTLE_MIN_APART_MS) {
    return { settled: waiting };
  }
  return {
    settled: narrowed,
    candidate: candidate?.key === key ? candidate : { key, at: read.at },
    unsettledSince,
  };
}

/**
 * The servers waiting for the person's sign-in, once muster's status has
 * settled ({@link settleWaiting}), for the inbox's MCP sign-in row: a fresh
 * portal load reads its servers while muster is still connecting them, and a
 * row raised from that would name servers that connect a moment later. While
 * the status is unsettled it is read again every {@link SETTLE_REREAD_MS},
 * for at most {@link SETTLE_WINDOW_MS}.
 */
export function useSettledWaiting({
  waiting,
  connecting,
  readAt,
  refetch,
}: {
  waiting: readonly string[];
  connecting: boolean;
  /** When muster last answered with a status; 0 before. */
  readAt: number;
  refetch: () => void;
}): string[] {
  const [state, setState] = useState<SettleState>(UNSETTLED);
  const key = waiting.join('\n');

  // Once per answer: the same answer read twice confirms nothing.
  useEffect(() => {
    if (readAt === 0) {
      return;
    }
    setState(previous =>
      settleWaiting(previous, {
        waiting: key ? key.split('\n') : [],
        connecting,
        at: readAt,
      }),
    );
    // `key` and `connecting` belong to the answer `readAt` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAt]);

  const { unsettledSince } = state;
  const rereads =
    unsettledSince !== undefined && readAt - unsettledSince < SETTLE_WINDOW_MS;
  useEffect(() => {
    if (!rereads) {
      return undefined;
    }
    const timer = setTimeout(refetch, SETTLE_REREAD_MS);
    return () => clearTimeout(timer);
  }, [rereads, readAt, refetch]);

  return state.settled;
}
