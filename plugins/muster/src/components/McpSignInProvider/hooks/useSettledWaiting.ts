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
 * How long muster's report of a server still connecting holds the waiting
 * servers back. Past it a waiting set seen throughout is raised by the next
 * read, even while a server stays connecting (muster retrying a refused fresh
 * token reports that for up to minutes).
 */
export const SETTLE_WINDOW_MS = 60_000;

/**
 * How long reads keep following each other quickly while the status is
 * unsettled: the window, and two more re-reads, so the read that ends the
 * window, and one that confirms a set first seen then, still come quickly.
 * Past it the regular reads take over.
 */
export const SETTLE_REREAD_UNTIL_MS = SETTLE_WINDOW_MS + 2 * SETTLE_REREAD_MS;

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
  /** A waiting set seen, to be confirmed by a later read. */
  candidate?: { key: string; at: number };
  /** When the status stopped being settled, while it is not. */
  unsettledSince?: number;
};

export const UNSETTLED: SettleState = { settled: [] };

/**
 * The waiting servers after one more read. A server that stops waiting leaves
 * at once: fewer servers waiting raises nothing. A server that starts to wait
 * joins only once the status has settled: not while muster reports a server
 * still connecting, for at most {@link SETTLE_WINDOW_MS} (the session's start
 * is still running, and servers it has not reached yet read `auth_required`),
 * and only when a read at least {@link SETTLE_MIN_APART_MS} after the first
 * one to report the same waiting set still does.
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
  // The same set seen again keeps its first sighting, held back or not, so
  // the read that ends the window can confirm it.
  const candidate =
    previous.candidate?.key === key ? previous.candidate : { key, at: read.at };
  const holdsBack =
    read.connecting && read.at - unsettledSince < SETTLE_WINDOW_MS;
  if (!holdsBack && read.at - candidate.at >= SETTLE_MIN_APART_MS) {
    return { settled: waiting };
  }
  return { settled: narrowed, candidate, unsettledSince };
}

/**
 * The servers waiting for the person's sign-in, once muster's status has
 * settled ({@link settleWaiting}), for the inbox's MCP sign-in row: a fresh
 * portal load reads its servers while muster is still connecting them, and a
 * row raised from that would name servers that connect a moment later. While
 * the status is unsettled it is read again every {@link SETTLE_REREAD_MS},
 * for at most {@link SETTLE_REREAD_UNTIL_MS} by the clock, and not at all
 * while the reads fail or the portal session is gone: those wait for the
 * regular reads, which stop while the session is gone. Nor while muster
 * reports a server connecting: the read itself polls then
 * (`connectingPollInterval`).
 *
 * `isSettled` says the first settling is over, so `waiting` is what the load
 * found: the inbox takes its first read then, and a server waiting at load is
 * catch-up, with its toast. It stays true once it is.
 */
export function useSettledWaiting({
  waiting,
  connecting,
  readAt,
  answeredAt,
  sessionExpired,
  refetch,
}: {
  waiting: readonly string[];
  connecting: boolean;
  /** When muster last answered with a status; 0 before. */
  readAt: number;
  /** When the last read ended, with a status or a failure; 0 before. */
  answeredAt: number;
  sessionExpired: boolean;
  /** Reads the status again; stable across renders. */
  refetch: () => void;
}): { waiting: string[]; isSettled: boolean } {
  const [state, setState] = useState<SettleState>(UNSETTLED);
  // The answer the settling last took in.
  const [takenAt, setTakenAt] = useState(0);
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
    setTakenAt(readAt);
    // `key` and `connecting` belong to the answer `readAt` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAt]);

  const { unsettledSince } = state;
  const failing = answeredAt > readAt;

  // Settled once a read was taken in and left nothing to confirm, or there is
  // nothing more to read now: the reads fail, or the portal session is gone.
  // It stays settled: a server that starts to wait later is news, not a load.
  const [isSettled, setIsSettled] = useState(false);
  const settledNow =
    failing ||
    sessionExpired ||
    (takenAt > 0 && takenAt === readAt && unsettledSince === undefined);
  useEffect(() => {
    if (settledNow) {
      setIsSettled(true);
    }
  }, [settledNow]);
  // Nor is the inbox held back past the quick re-reads by a status that keeps
  // changing: the regular reads take over then, and so does the inbox.
  const hasRead = readAt > 0;
  useEffect(() => {
    if (!hasRead) {
      return undefined;
    }
    const timer = setTimeout(() => setIsSettled(true), SETTLE_REREAD_UNTIL_MS);
    return () => clearTimeout(timer);
  }, [hasRead]);
  useEffect(() => {
    // While muster reports a server connecting, the status read polls every
    // CONNECTING_POLL_INTERVAL_MS on its own: a second timer here would only
    // double the reads.
    if (
      unsettledSince === undefined ||
      connecting ||
      sessionExpired ||
      failing ||
      Date.now() - unsettledSince >= SETTLE_REREAD_UNTIL_MS
    ) {
      return undefined;
    }
    const timer = setTimeout(refetch, SETTLE_REREAD_MS);
    return () => clearTimeout(timer);
  }, [
    unsettledSince,
    connecting,
    sessionExpired,
    failing,
    answeredAt,
    refetch,
  ]);

  return { waiting: state.settled, isSettled };
}
