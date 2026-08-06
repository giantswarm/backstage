import type { Query } from '@tanstack/react-query';
import type { A2aTaskWire } from './kagentTaskSchema';
import { normalizeTimestamp } from './kagentSessions';
import { describeSessionState } from './kagentSessionState';

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
 * How long a session's newest task may sit in an active state before we stop
 * treating it as live and fall back to the baseline.
 *
 * Same purpose as `TRANSITIONAL_MAX_AGE_MS` for agents — without a bound, an agent
 * that died mid-turn without writing a terminal state would pin the fast tier for
 * as long as anyone leaves the tab open. Calibrated differently, though: the
 * agents' 3 minutes tracks a controller reconcile loop, while this tracks an agent
 * *turn*, which routinely runs minutes when there are many tool calls. A 3-minute
 * bound would back off in the middle of exactly the run the page was opened to
 * watch.
 *
 * This bound is also what handles `input-required` / `auth-required`. Those are
 * active — the session may still produce output — but they wait on a human, and
 * this page offers no way to answer. They start on the fast tier, relax once
 * nobody has replied inside the window, and re-engage on their own when someone
 * does reply elsewhere and the newest task's timestamp advances.
 */
export const ACTIVE_MAX_AGE_MS = 5 * 60_000;

/**
 * Refetch interval for one session's tasks — the conversation.
 *
 * Two tiers decided from the data already in hand, like the agent views: fast
 * while the newest task is in an active A2A state and recent, baseline once it
 * reaches a terminal state or stops moving. react-query re-evaluates this after
 * every fetch resolves, so it needs no external state and is self-correcting.
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

  // The same backwards walk as `deriveSessionState` — kagent returns tasks oldest
  // first, so the session's state is the newest task's. Repeated here rather than
  // reusing that function because the decision needs the state *and* the timestamp
  // from the same task: a trailing task carrying no state must not lend its
  // timestamp to an earlier task's state.
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const status = tasks[index]?.status;
    const state = describeSessionState(status?.state);
    if (!state) {
      continue;
    }

    if (!state.isActive) {
      return BASELINE_REFETCH_INTERVAL_MS;
    }

    const changedAt = normalizeTimestamp(status?.timestamp);

    // No usable timestamp — absent, or Go zero time. Treat the task as
    // just-changed rather than as stuck, mirroring `isAgentConverging`.
    if (changedAt === undefined) {
      return ACTIVE_REFETCH_INTERVAL_MS;
    }

    return now - Date.parse(changedAt) < ACTIVE_MAX_AGE_MS
      ? ACTIVE_REFETCH_INTERVAL_MS
      : BASELINE_REFETCH_INTERVAL_MS;
  }

  // Tasks exist but none reported a state: a session created but never run.
  return BASELINE_REFETCH_INTERVAL_MS;
}
