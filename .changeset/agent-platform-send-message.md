---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Let a session be carried on: a message box at the foot of the session detail page,
which until now could read a conversation but not add to it.

**Sessions cannot send messages, which is what shapes this.** kagent's session
endpoints hold history only; talking to an agent means A2A JSON-RPC `message/send` to
`POST /api/a2a/{namespace}/{name}` with `contextId` set to the session id — the only
thing tying a turn to a session. So this is a different endpoint family from
everything the proxy did before, and the new route
(`POST /kagent/sessions/:sessionId/messages`) is session-shaped rather than
agent-shaped because the session is what the user is looking at. The JSON-RPC envelope
is built in the backend client, so the frontend never learns A2A.

**The agent's namespace and name travel in the request, and are never decoded from
the session's `agent_id`.** That id is kagent's "python identifier" encoding, which
rewrites every `-` to `_`; decoding cannot tell an original underscore from a
rewritten hyphen, so an agent whose name legitimately contains one would resolve to an
agent that does not exist. They come from the matched `Agent` resource instead —
`SessionRow` now carries `agentNamespace` alongside the technical name — and a session
with no matching `Agent` has no addressable agent at all, which is one of the cases
where the composer is withheld rather than offered.

**`message/send` answers only once the agent has finished**, verified against kagent
0.9.9 on gazelle: the reply is the whole finished task, `result.kind === 'task'`, with
`status.state` and full `history`.

**That wait can neither be completed nor is needed.** Gazelle's
`agent-platform-connectivity-ui` HTTPRoute carries an Envoy `BackendTrafficPolicy` with
`requestTimeout: 60s`, so any turn of substance is cut off with a 502 well before it
ends — and **the turn survives the cut**, observed live where an agent answered a
message whose request had already died with a 502.

Since it survives, waiting buys nothing but a held-open socket, and
`agentPlatform.kagent.turnTimeoutMs` defaults to a deliberately short **30 seconds**.
That value is chosen to lose a race rather than to bound a turn: the browser's request
traverses a door of its own in front of Backstage, and if that fires first the frontend
gets a 502/504 nothing here can reinterpret, because this service never got to answer.
30 s always beats a 60 s door. (Gazelle's Backstage route sets `requestTimeout: 0s`,
disabling it — but the send path must not rely on that holding everywhere.)

So a lost connection is not a failed message, and the client does not guess: on a
502/504, its own timeout, **or a socket that simply died**, it re-reads
`GET /sessions/{id}/tasks` and checks whether the `messageId` it generated is in the
history. Present means dispatched-and-running, which answers **202**; absent — or
unreadable — keeps the original failure, because "cannot tell" must not be read as "it
worked".

That last case needs care: `request` maps any non-timeout fetch rejection to a 404,
since on a fleet where most installations run no kagent that is the normal outcome and
must stay off the 5xx path — but the same branch catches an Envoy drain or a TLS reset
mid-turn. Those are marked transport-borne so a send verifies them, while kagent's own
JSON 404 for a missing agent stays a decision. Decisions are never verified: not a 401,
a 403, a rejected request, nor a JSON-RPC error.

**A JSON-RPC failure arrives inside a 200, and would otherwise pass for a sent
message.** A2A is JSON-RPC, so invalid params, an unsupported operation, a task-store
failure or an agent whose server is not ready come back as
`{"jsonrpc":"2.0","error":{…}}` with a 200 — an `error` _object_, where kagent's REST
envelope uses the boolean `true`. Checking only the boolean let all of them through, and
the consequence was specific: the caller drops its optimistic copy, the invalidated read
returns no new task, and the message vanishes from the page with no error shown
anywhere. Both shapes are now read, outside the verification path so a rejection cannot
come back as a turn still in flight.

202 rather than a 5xx also keeps this off the path `MiddlewareFactory.error()` forwards
to Sentry, which would otherwise mean one issue per long turn, for the thing an agent
is supposed to do.

**A failed turn is still a 200.** The reason lands on `status.message` — an agent that
cannot reach its MCP server says so there — so the HTTP status says only whether the
turn was accepted, and what became of it is read from the task like any other
progress. Nothing in the client inspects the result.

**Output appears by polling, deliberately not by streaming.** The conversation already
polls at 10 s while the newest task is active, so a send needs no new transport: it
invalidates and the existing tier follows the turn. A relayed A2A SSE stream would
have needed a streaming pass-through in `KagentClient.request` (a one-shot `fetch` +
`.json()` today) plus flush-wrapping to defeat Backstage's global `compression()`
middleware, which buffers `res.write()` until `res.end()` — the trap
`ai-chat-backend`'s router already documents — plus reconnect handling. None of that
buys anything the poll does not already do for a turn measured in tens of seconds.

**The message shows immediately, and disappears by recognition rather than by
timing.** The composer generates the `messageId` before sending, so the optimistically
rendered copy can be matched to kagent's stored one and dropped the moment a poll
returns it — which can happen long before the turn ends, and would otherwise show the
message twice for the rest of it. `TimelineItem` gains a `messageId` for this: its
existing `id` is positional and stable only for React. It is also cleared on failure,
where nothing was recorded.

**The conversation ends with a "Working…" spinner while the agent is mid-turn**, where
the reply will appear. It takes two signals, because neither spans a turn: the
conversation's own verdict arrives up to 10 s late, and the in-flight send covers
precisely that gap while being unable to carry the rest, since the gateway cuts the
request off first.

`isActive` is not the same question, and three things narrow it into a new
`isAgentWorking` (in `lib/kagentSessionState.ts`, which the composer also closes on):
the newest task must be active; its state must not be one of
`AWAITING_INPUT_STATES`, since `input-required` is active but blocked on a human and a
spinner there promises progress that cannot come; and the state must have moved within
`ACTIVE_MAX_AGE_MS`, because an agent that dies mid-turn never writes a terminal state
and a stalled turn would otherwise look like a slow one indefinitely. The badge still
reads "Working" in that last case — `state` is what kagent says, this is what we are
willing to claim about it — and the composer is freed, since a turn that will never end
must not hold it shut.

It is judged as of the last successful read (`dataUpdatedAt`) rather than `Date.now()`,
which is what makes it expire at all: with a render-time clock the answer would only
change when something re-rendered, and a stalled turn is exactly when the data stops
changing.

`ACTIVE_MAX_AGE_MS` and the backwards walk resolving the age basis move to
`kagentSessionState` as `readNewestTaskState`, so the indicator and the poll tier
cannot drift apart — and the duplicated walk the polling code previously apologised for
is gone. They disagree on one point deliberately: a state with no usable timestamp
anywhere counts as working but polls on the baseline, since an unbounded fast poll
costs every reader bandwidth while an indicator that cannot expire misleads only the
person looking at it.

The composer is **withheld, with a reason, rather than offered and left to fail**:

- on a read-only shared session, which rejects every non-GET under `/api/sessions`
  with a 403;
- when the session's agent cannot be found, so there is nowhere to send;
- while a task is `input-required` or `auth-required`. This one is the opposite of
  "busy" and worth stating: the agent asked something, and a plain message does **not**
  answer it — kagent opens a _new_ task and leaves the question pending forever. So
  offering the box there would quietly strand the conversation. Answering a question is
  a structured reply and remains unbuilt; the page now says so and points at kagent's
  own UI.

And it is closed while the agent is mid-turn, since kagent has no notion of a queued
follow-up — a second message during a turn competes with the first rather than waiting
behind it.

Smaller decisions:

- Enter inserts a newline, **Cmd/Ctrl+Enter sends**. Prompts are often multi-line, so
  Enter-to-send would truncate more messages than it saved.
- The field clears on submit, not on success. The message is in the transcript from
  that moment, and a turn is far too long to hold someone's text in a disabled box. **On
  failure the text is handed back into the box**: the optimistic copy is dropped at the
  same time — nothing was recorded, so the transcript must not keep showing it — which
  would otherwise leave a pasted manifest nowhere at all. Handed back by attempt id, so
  resubmitting identical text and failing again restores it again, and a re-render never
  overwrites an edit in progress.
- `SessionState` gains `key`, the normalised state, and the two places that ask "is the
  agent waiting on a human?" compare against it. `describeSessionState` matches
  case-insensitively but keeps `raw` verbatim, so comparing against `raw` would miss an
  `Input-Required` — and then both promise progress and offer the composer on the one
  session a plain message strands.
- Messages are capped at 32,000 UTF-16 code units — ours, not kagent's, which
  validates nothing. Generous because pasting logs or a manifest into a prompt is
  normal; the backend enforces it too, and its JSON body limit is raised to 256 kB so
  that cap is the bound a caller actually meets: 32,000 code units of CJK is ~96 kB,
  which clears the 100 kB default by too little to rely on, and a 413 from the body
  parser explains nothing.
- A 400 from the new route is **not** mapped to `NotFoundError`, the same opt-out the
  rename takes: that mapping means "no kagent on this installation" and is silent,
  which a refused message must not borrow.
- `AWAITING_INPUT_STATES` moves to `kagentSessionState`, now that the timeline and the
  composer both need it.
- Sandbox agents are out of scope: they need `/api/a2a-sandboxes/…`, require
  `contextId`, and 409 on a second session. Confirmed that gazelle runs none.
