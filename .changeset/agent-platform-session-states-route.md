---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Add `GET /kagent/session-states`, which reports the derived state of each of the
caller's sessions on one installation. Nothing renders it yet — the session
switcher rail is the consumer.

**The first route here that interprets kagent rather than forwarding it**, and
the exception is arithmetic. A kagent `Session` carries no state; the only way to
learn one is to read that session's whole conversation and look at its newest
task. Measured against a real 21-session account on gazelle, that is **2.8 MB**
(individual sessions 1.6 KB–481 KB) to produce about 700 bytes of answer — not
something to do in a browser, on a poll. It derives through the same parser and
the same state map the UI badges from, shared from `agent-platform-common`, so
the two cannot disagree.

**There is no bulk endpoint, and this was checked, not assumed.** On kagent 0.9.9
the A2A `tasks/list` returns `-32601 METHOD_NOT_FOUND`, while `tasks/get` on the
same endpoint reaches a decode error — so it is method dispatch, not transport.
`GET /sessions/:id/tasks` ignores `limit`, `order`, `sort` and `after` outright,
returning byte-identical payloads; and tasks come back oldest-first, so even a
working `limit` would read the wrong end.

The response separates four facts a rail renders differently: a reported state, a
`null` state (has tasks, none reported one — created and never run), an id in
`unreadable` (the read failed, so the state is genuinely unknown rather than
terminal), and a `skipped` count for sessions never evaluated. Terminal states
come back unfiltered; which ones are non-terminal is a question the frontend
already answers with the same map.

Bounds, all overridable under `agentPlatform.kagent.sessionStates` and
deliberately not query parameters, since the fan-out is a cost lever the browser
must not be able to widen: subagent sessions dropped, then a 7-day activity
window, then newest-first capped at 20. Reads run through a **sliding** pool of 4
rather than batches — payloads span two orders of magnitude, so a batch would run
at the pace of its largest member — with 5 s per read and an 8 s pass deadline
that sits under the frontend's 10 s poll. A complete pass measured ~500 ms.

The window is generous on purpose: a session in `input-required` is blocked on a
human and can sit for days, which is precisely what the rail exists to surface.
The cap is the real bound.

Every read is caught individually, so a session deleted between the list and the
read costs that row and not the rail. Failures are logged at `debug` as a count —
a partial read is the expected outcome this route is built around, and `warn`
would forward it to Sentry — and the route answers **200 even when every task
read fails**, since a 5xx would reach Sentry through `MiddlewareFactory`
regardless of our own log level.

Summaries are cached in process for 15 s, keyed by a hash of the caller's token:
the TTL must exceed the frontend's 10 s poll or it buys nothing, and the token is
exactly kagent's own scoping key, so a rotation or sign-out makes an entry
unaddressable rather than stale. Concurrent polls share one fan-out; a failed
pass is not cached. Not `cacheService` — that is a pluggable store, and pointing
it at Redis would put per-user chat-derived data somewhere that outlives both the
process and sign-out.

One optimisation is deliberately left out: if kagent bumps `session.updated_at`
on every task write, terminal sessions could skip their re-read entirely. That is
unverified, so it is not in the baseline.
