# @giantswarm/backstage-plugin-agent-platform-common

## 1.0.0

### Major Changes

- 343d4b2: The Agent Platform backend speaks **kagent API v2 over native gRPC**. Sessions
  are the person's `AgentInstance`s, chat is A2A v1 `SendStreamingMessage` routed
  by the instance header with the human-in-the-loop extension requested on every
  turn, history comes from `ListTasks`/`GetTask`, the identity probe from
  `SystemService.GetCurrentUser`, and the session-state and usage summaries are
  derived from `ListAgentInstances` and `ListTasks`. The browser keeps its
  JSON/SSE contract.

  **Breaking.** This release requires a kagent API v2 controller behind
  agentgateway's gRPC-capable controller route (agent-platform 4.0's connectivity
  chart). `agentPlatform.kagent.installations.<name>.apiBaseUrl` is now the
  **gRPC origin** of that route (`https://<host>[:port]`, no path); the derived
  default is `https://agentgateway.<baseDomain>`, the connectivity chart's
  controller route hostname. The kagent 0.10 REST door
  (`/api/sessions`, JSON-RPC A2A) is no longer spoken, and conversations from
  before an installation's migration are not available — the Sessions tab says so.

  - **Backend.** A Connect client generated from the line's protos
    (`plugins/agent-platform-backend/src/kagent/gen`, pinned by commit) over
    connect-node's HTTP/2 gRPC transport. Every call carries
    `authorization: Bearer <the person's per-installation Dex ID token>` and
    **no identity header**: agentgateway validates the token and derives the
    caller. Creating a session is `CreateAgentInstance` on the template's Ready
    Harness with the browser's `requestId`, so a retried create yields one
    instance; renaming is `UpdateAgentInstanceName`; the 0.9.x upsert fallback is
    gone. The new route `POST /kagent/sessions/:sessionId/tasks/:taskId/cancel`
    cancels a turn server-side (`CancelTask`). The reachability probe behind
    `GET /kagent/installations` is one unauthenticated `GetVersion` per origin.
  - **Common.** The A2A v1 and AgentInstance wire shapes join the 0.10 ones, with
    fixtures recorded on the pinned line (`kagent-4a91c273`), and are normalised
    into the one internal shape every reader already parses — including the HITL
    extension's typed request and reply. `KagentSession` gains `agentTemplate`,
    `state`, `contextId` and `failure`.
  - **Frontend.** A **Stop** control in the composer while a turn streams; the
    create carries an idempotency key per submission; the Sessions tab and an
    agent's Recent sessions tell the person that earlier conversations are gone.
    Session names are capped at 200 characters, the controller's limit.

### Minor Changes

- 244719a: Session detail: a canceled turn says so. A turn stopped before it finished — by pressing Stop, or by the controller ending the run — rendered as the person's message, or a reply that breaks off mid-sentence, with nothing to say why; and since the header badge reads only the newest task, a cancel earlier in the session left no trace anywhere on the page. It now closes with an entry the way a failed turn does, worded as what it is rather than as an error: "This turn was canceled", with the controller's reason when it recorded one. Whatever the agent managed to write keeps its place above it. The live stream ends a canceled turn on the same entry, so pressing Stop closes the turn at once instead of leaving the half-written reply looking like it is still being typed.
- d6bec76: Extract the kagent wire layer into a new `agent-platform-common` package. No
  behaviour change — every module moves verbatim, with its tests and fixtures.

  Moved out of `agent-platform/src/lib`: `kagentSchema`, `kagentTaskSchema`,
  `kagentSessions`, `kagentSessionDetail` and `kagentSessionState`, plus
  `isListableSession`, which had been sitting in the sessions table's helpers.

  **Why now.** The backend is about to derive a session's state server-side, which
  needs the task schema, the session parsers and the state map. A second copy in
  the backend is exactly the drift the version-tolerance strategy exists to
  prevent: kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is on
  v0.10.x, and the fleet can run a mix, so tolerance lives in permissive parsing
  rather than version detection — and that only holds while there is one parser
  and one `KNOWN_STATES`. The first symptom of two would be a session grouped one
  way in a list and badged another way on its own page.

  `kagentSessionPolling` stays in the frontend: it is typed against react-query.
  It keeps re-exporting `ACTIVE_MAX_AGE_MS`, so its callers are untouched.

  **Fixtures are shared, not duplicated**, through a dedicated `/testFixtures`
  entry point. A test asserting against its own copy of a captured v0.9.9 response
  is one that can keep passing while the real fixture drifts. Two constraints
  shaped that entry point rather than a deep import: `no-forbidden-package-imports`
  rejects reaching into another package's `src`, and the type rollup cannot resolve
  a `.json` module, so each fixture carries an explicit type instead of the one
  inferred from its JSON. The six well-formed task envelopes are typed as a mutable
  `TaskEnvelopeFixture`, since tests clone and edit them to reach states no
  captured response covers; the malformed and envelope-tolerance ones are
  `unknown`, which is what a parser sees anyway.

- 2c4e7eb: `readTurnProgress(tasks, now)` classifies a session's newest turn as `working`,
  or `stalled` since the task's last timestamp once it has not advanced for
  `ACTIVE_MAX_AGE_MS`; a terminal task, one waiting on a human, or a session that
  never ran is neither. `isAgentWorking` is now defined on top of it, so the two
  cannot disagree about when a turn stops counting as live.
- bf367f1: A session whose runtime kagent cannot bring back explains itself and offers a
  way on, instead of `actor "ai-…" request timed out` and the same retry forever.

  A session that ends a turn by asking the person something is paused to a
  snapshot on the worker's node; when that node goes away (a spot interruption,
  a node roll) the next message fails after kagent's 60 s with the runtime's
  words, and so does every retry. The page now reads that failure — off the
  newest turn, off the send's own error, and off the `RUNTIME_LOST` failure
  kagent will record on the instance — and says in its own words that the
  runtime could not be brought back, that the conversation stays readable and
  nothing is missing from the transcript, and offers **Start a new session with
  &lt;agent&gt;** beside Send, carrying the box's text or the message that never
  got its answer. The failed-turn entry says whose failure it is and keeps the
  runtime's text as the evidence. Once kagent reports the loss, the header, the
  Sessions list and the switcher rail mark the session, the new session takes
  Send's place (and Enter), and the answer panel yields to it. A delete that
  fails on such a session says why (kagent suspends the runtime before removing
  the instance, and that runtime cannot be reached) and what fixes it.

  The common package gains `readRuntimeLoss` and its readers, so every surface
  agrees on what it is looking at.

- d6bec76: Add `GET /kagent/session-states`, which reports the derived state of each of the
  caller's sessions on one installation. Nothing renders it yet — the session
  switcher rail is the consumer.

  **The first route here that interprets kagent rather than forwarding it**, and the
  exception is arithmetic. A kagent `Session` carries no state; the only way to learn one
  is to read that session's whole conversation and look at its newest task. Measured
  against a real 21-session account on an internal installation, that is **2.8 MB**
  (individual sessions 1.6 KB–481 KB) to produce about 700 bytes of answer — not something
  to do in a browser, on a poll. It derives through the same parser and the same state map
  the UI badges from, shared from `agent-platform-common`, so the two cannot disagree.

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

- 5c82125: Add a "Usage" tab to the Agent Platform section (`/agent-platform/usage`),
  showing your own agent usage over the last 30 days alongside the installation's
  MCP tool calls.

  - The personal section reports sessions, turns, input and output tokens and tool
    calls, two per-day token charts, breakdowns per agent and per model, and your
    top tools and MCP servers. The per-model breakdown is derived from each
    agent's ModelConfig, so it reflects the model an agent runs on _now_ — kagent
    records none per session — and the table says so. Every number is **your own**: kagent scopes its session list to
    the caller, and on an installation running kagent in `unsecure` mode — where
    the list is everyone's — the page's copy switches rather than claiming
    ownership it cannot support.
  - A new `GET /api/agent-platform/kagent/session-usage` derives it. kagent stores
    no usage summary of any kind, so the route reads each session's conversation
    and totals it server-side, bounded by `agentPlatform.kagent.sessionUsage.*`
    (window, session cap, concurrency, timeouts, budget, cache TTL). It answers a
    partial summary with `skipped`/`unreadable` set rather than failing, and the
    page says so.
  - The MCP usage view **moves** off muster's own tab strip into this page as a
    clearly-scoped second section, contributed as an extension so neither plugin
    depends on the other. `/agent-platform/muster/usage` redirects, and muster's
    Dashboard card retargets. Its 24h/7d/30d switcher is gone: one window for the
    whole page, so the two sections stay comparable.
  - `Stat` and the tone palette move to `ui-react` (three copies existed), and
    `StackedBarChart` gains optional `formatYAxisTick`, `yAxisWidth` and
    `formatValue` so it can carry seven-digit token values. The session detail
    page's stat labels therefore render uppercase, and its longest label shortens
    to "Input tokens (billed)".
  - No cost, tokens/second or context-window figures: kagent records none at any
    version, including v0.10.
