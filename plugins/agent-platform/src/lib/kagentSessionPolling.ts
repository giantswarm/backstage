import type { Query } from '@tanstack/react-query';
import type { A2aTaskWire } from './kagentTaskSchema';
import { ACTIVE_MAX_AGE_MS, readNewestTaskState } from './kagentSessionState';

/**
 * Baseline poll for a session's conversation, and the flat interval for the
 * session metadata read beside it.
 *
 * Deliberately equal to the query client's `staleTime` (see
 * `QueryClientProvider`), for the reason spelled out in
 * `AgentsDataProvider/helpers.ts`: interval refetches are not gated by staleness,
 * so a shorter baseline would refetch data the client still considers fresh.
 *
 * This tier is what notices a session continued, renamed or deleted elsewhere.
 */
export const BASELINE_REFETCH_INTERVAL_MS = 60_000;

/**
 * Poll for a session whose newest task is still active — someone watching an
 * agent work.
 *
 * Half the agents' 5s tier, and the difference is deliberate. Both tiers exist to
 * watch something converge, but the agents' moves a small Kubernetes object while
 * this one moves the whole conversation: a real four-turn session's tasks measured
 * ~500 KB, and every response is re-parsed row by row through
 * `a2aTaskWireSchema` and then deep-compared by react-query's structural sharing,
 * all on the main thread. At 10s that stays modest, and a conversation turn is
 * tens of seconds anyway, so nothing reads as less live for it.
 *
 * Note this only ticks while the tab is visible (`refetchIntervalInBackground`
 * defaults to `false`), and that an offline browser pauses these queries outright
 * rather than failing them (react-query's default `networkMode: 'online'`).
 *
 * kagent offers no cheaper way to ask "has this changed?" — its API serves no HEAD
 * (every route is registered for GET only on a gorilla/mux router, which matches
 * methods exactly) and sets no `ETag` or `Last-Modified`, so a full re-read is the
 * only probe there is.
 */
export const ACTIVE_REFETCH_INTERVAL_MS = 10_000;

/**
 * Re-exported because the bound belongs with the state semantics it measures — see
 * `kagentSessionState` — while every reader of the polling tiers expects to find it
 * here beside them.
 */
export { ACTIVE_MAX_AGE_MS };

/**
 * Refetch interval for one session's tasks — the conversation.
 *
 * Two tiers decided from the data already in hand, like the agent views: fast
 * while the newest task is in an active A2A state and recent, baseline once it
 * reaches a terminal state or stops moving. react-query re-evaluates this after
 * every fetch resolves, so it needs no external state and is self-correcting.
 *
 * **`input-required` / `auth-required` are bounded rather than excluded.** They are
 * active — the session may still produce output — but they wait on a human. They
 * start on the fast tier, relax once nobody has replied inside the window, and
 * re-engage on their own when someone replies elsewhere and the newest task's
 * timestamp advances. The "Working…" indicator excludes them outright instead, which
 * is a different question: how often to look, versus what to claim.
 *
 * Never returns `false`. A terminal session is not immutable the way a finished
 * workflow execution is — kagent lets it be continued, renamed or deleted from
 * another client — so stopping altogether would freeze the page for exactly the
 * case this polling exists to fix.
 */
export function getSessionTasksRefetchInterval(
  query: Query<A2aTaskWire[]>,
): number {
  const tasks = query.state.data;
  if (!tasks?.length) {
    return BASELINE_REFETCH_INTERVAL_MS;
  }

  const now = Date.now();

  // `readNewestTaskState` does the backwards walk and resolves the age basis — the
  // same determination the "Working…" indicator makes, so the two cannot disagree
  // about whether a session is still moving.
  const newest = readNewestTaskState(tasks);
  if (newest) {
    if (!newest.state.isActive) {
      return BASELINE_REFETCH_INTERVAL_MS;
    }

    // Nothing in the whole conversation carries a usable time, so there is no way
    // to bound the fast tier at all. Poll on the baseline: a task genuinely new
    // this second is seen within a minute, where the alternative is re-reading the
    // conversation every 10 s for as long as the tab stays open.
    //
    // Note this is the opposite call from the indicator, which treats an
    // unmeasurable state as working: an unbounded fast poll costs every reader
    // bandwidth forever, while an indicator that cannot expire only misleads the
    // one person looking at it.
    if (newest.changedAt === undefined) {
      return BASELINE_REFETCH_INTERVAL_MS;
    }

    return now - newest.changedAt < ACTIVE_MAX_AGE_MS
      ? ACTIVE_REFETCH_INTERVAL_MS
      : BASELINE_REFETCH_INTERVAL_MS;
  }

  // Tasks exist but none reported a state: a session created but never run.
  return BASELINE_REFETCH_INTERVAL_MS;
}
