# @giantswarm/backstage-plugin-agent-platform-backend

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

- 2c4e7eb: `POST /kagent/sessions/:sessionId/answer/stream` answers a confirmation over
  `A2AService/SendStreamingMessage` and relays the resumed turn's events as SSE —
  the streaming sibling of the unary answer route, with the same body, the same
  validation and the same relay as the messages route's streaming sibling. The
  unary route stays. What the new route fixes is the unary one's blind spot: held
  for the turn timeout and then answering `202 pending`, it left a turn that
  never landed with nothing for the page to show — and on the kagent API v2 line
  the caller's deadline was what ended the agent's turn.
- f3ab798: `GET /avatars/:installation/v1[/preview][/<size>]/<name>.png` serves an
  agent's avatar fetched from that installation's `avatars.<baseDomain>`, so the
  portal's `<img>` loads it same-origin. The browser used to load the avatar
  hosts directly, which made every deployment allowlist them in the
  Content-Security-Policy's `img-src` — a header sent with the unauthenticated
  page, naming each installation's base domain to anyone who asks.

  The installation must be a configured one with a base domain, the size one of
  the endpoint's own and the name a DNS label; the upstream URL is rebuilt from
  those parts alone and redirects are refused. `Content-Type`, `Cache-Control`
  (the preview route's `no-store` included) and `ETag` are forwarded, a
  conditional request revalidates through the proxy, and an upstream failure is
  a 502 with the reason rather than an error report per image.

  The path accepts the plugin's user cookie (`user-cookie` policy), because an
  `<img>` carries no bearer token; the frontend issues and refreshes that cookie.

- 6b1e119: `POST /model-manager/models/try`: one short chat completion against a served model's endpoint as model-manager reports it for the installation (read as the person on the same request — never a caller-supplied URL), sent twice — without a token and with the person's — and both outcomes answered, so the Serving page's **Try it** shows the gateway enforce the ModelConfig's passthrough and the model answer.
- 0395e2d: Add **Delete session…** to the session detail page's kebab menu. It calls kagent's
  `DELETE /api/sessions/:id` through the agent-platform proxy — the first write on the
  kagent REST side, so `agent-platform-backend` gains a `DELETE
/kagent/sessions/:sessionId` route and its client a method parameter. Everything
  else about the transport is the reads' machinery reused: same installation
  resolution, same forwarded per-installation Dex token, same status mapping.

  **There is no permission gate, because there is nothing to ask.** Unlike the agent
  delete's `SelfSubjectAccessReview`, a session is not a Kubernetes object: kagent
  derives the acting user from the forwarded token alone, so the item is simply offered
  on any session that loaded. The route makes that token **required** for the same
  reason — without one, a controller running in `unsecure` mode would delete the shared
  default user's session on behalf of nobody in particular.

  **The dialog states both halves of what "deleted" means**, because an earlier draft
  of the copy could only have been wrong in one direction or the other. kagent's delete
  is soft (`UPDATE session SET deleted_at = NOW()`, with every read filtering
  `deleted_at IS NULL`), so the conversation is gone as far as anything in Backstage
  can see and there is no undo anywhere in this UI — but the record is not erased from
  kagent's store. On a deployment the `/me` probe reports as **not user-scoped**, the
  dialog adds a line saying the session may have been started by somebody else. That
  warns rather than withholding the action: kagent authorizes the call either way, and
  the person reading is the one who knows whose session it is.

  **A delete that matched nothing still answers 200.** kagent's statement is an
  `:exec`, so zero affected rows is not an error — a session that never existed, was
  already deleted, or belongs to another user all succeed silently. Nothing tries to
  detect that: a resolved promise means "kagent accepted this", and the refreshed list
  is what shows the truth a moment later. It also means there is no 404 path and no
  "already gone" case on the write side.

  **One non-obvious piece of cache handling.** The sessions list key is invalidated
  normally, so the list the user lands back on is correct. That reaches the Sessions tab
  only — each tab's router mounts its own `QueryClientProvider`, so the agent page's
  recent-sessions card reads the same key from a different cache, and needs no help
  because a fresh client starts empty and these keys are never persisted. This
  session's own two reads are
  invalidated with `refetchType: 'none'`: the detail page is still mounted at that
  moment, so refetching would race the navigation with a request that now 404s and
  flash "Session not found" at someone who just deleted it deliberately. Marked stale
  without refetching, a later visit to the same URL revalidates and reaches the
  not-found state properly.

  The frontend client's write path also tolerates a body it does not need — a 2xx with
  an empty or non-JSON body is a success, since a future kagent answering 204 has still
  performed the delete — while still refusing an error reported in-band on a 200, the
  same rule the session readers already apply.

  **The kebab menu is given an explicit width, and that line is load-bearing.** bui
  leaves `.bui-MenuContent`'s width to its content above a `min-width: 150px` (its own
  `width` fallback is the string `"undefined"`, which the browser discards), and a
  `MenuItem` puts `gap: var(--bui-space-6)` — 24px — between label and trailing slot.
  "Delete session…" with its icon wants ~155px, just over the minimum, so the popover
  rendered at the natural width and then settled back to 150px. That second layout pass
  made react-aria's popover resize observer trip the browser's "ResizeObserver loop
  completed with undelivered notifications" — twice, on every open of the menu. Sentry
  filters that message by default and production has no error overlay, but the
  dev-server overlay covers the page with it, which makes the page miserable to work on.
  Sizing the menu up front means one layout pass and no warning. The agent kebab escapes
  this only because its items happen to measure just under 150px.

  Verified against the kagent source at both `v0.9.9` (what the fleet runs) and
  `v0.10.0-rc1`: the handler, the SQL and the 200-with-envelope response are identical
  in both. Deleting from a list row is deliberately not offered, since a destructive
  action on a row someone is scanning past is easy to hit by accident.

- be7ef02: Add the `agent-platform-backend` plugin: a thin REST proxy over the kagent
  controller API, per installation. It is the transport the upcoming Agent
  Platform "Sessions" list needs — kagent sessions live in kagent's Postgres and
  are served over HTTP, so unlike agents and model configs they are not
  Kubernetes resources and the Kubernetes proxy cannot reach them.

  - `GET /kagent/sessions` (user token required), plus a `/kagent/me` identity
    probe (token optional) and `/kagent/installations`, which returns names only —
    the kagent URL is derived from `baseDomain`, which is backend-only because it
    deanonymizes customers.
  - Every kagent-side path stays under `/api`, the only prefix either door proxies
    to the controller. There is deliberately no version probe: kagent serves
    `/version` at its server root, which the derived door's nginx sends to the
    kagent UI (HTML) and which the agentgateway override's `/kagent` prefix never
    matches, so a probe would fail on every healthy installation.
  - The base URL is derived per installation as `https://kagent.<baseDomain>/api`
    (the oauth2-proxy-fronted host, whose nginx sidecar proxies `/api/` to
    `kagent-controller:8083`), overridable via
    `agentPlatform.kagent.installations.<name>.apiBaseUrl` — which also acts as an
    allowlist, since kagent is only deployed on some installations.
  - The user's per-installation Dex ID token arrives in a
    `backstage-kagent-authorization` header and is promoted to `Authorization:
Bearer` toward kagent, whose `trusted-proxy` auth mode derives the user from
    the `sub` claim. The inbound `Authorization` header already carries the
    Backstage identity, hence the separate header (same approach as
    `muster-backend`).
  - Responses are passed through **verbatim** — the `{error, data, message}`
    envelope is not unwrapped and unknown fields are not stripped — so kagent
    schema drift is absorbed by the frontend client rather than needing a backend
    release.
  - Transport failures map to typed errors: an oauth2-proxy redirect or a non-JSON
    200 (a sign-in page) becomes a 401 rather than being followed, a missing
    kagent becomes a 404, and DNS/TLS/timeout failures become a 503. Body reads are
    covered by the same mapping, since the abort signal stays armed after the
    headers arrive — a mid-stream abort, a connection reset, or truncated JSON is
    still a 503 rather than an unmapped 500.
  - A configured `apiBaseUrl` that is not an absolute http(s) URL is rejected at
    startup with one clear message, instead of failing opaquely on every request.

- ab3560e: Models pages call model-manager through muster as the signed-in person. Every read and write behind the Serving view, the GPU capacity panel and the Serve dialog — `list_backends`, `list_models`, `list_presets`, `check_fit`, `load_model`, `unload_model`, `list_nodes`, the pull jobs, wiring and deletion — is one `x_model-manager_<tool>` call over the installation's muster; whether an installation has a model-manager is the presence of the `model-manager` MCPServer in its muster, so no portal configuration says where model-manager is. A GPU node pool's **Serve your first model** therefore reaches the kserve backend the pool registered — its presets, the fit verdict against the pool's sizes, the `load_model` as the person — wherever muster lists model-manager, and the browser-composed InferenceService of the CR view is withheld there, even while model-manager reports no backend yet. A model-manager with no backend registered is listed as a serving layer with nothing registered, not as unreachable. model-manager's refusals keep their meaning (`not_found`, `unsupported`, `conflict`, `does_not_fit`, `backend_error`).

  The backend's `/model-manager/...` REST pass-through and its `agentPlatform.modelManager` configuration (`installations`, `timeoutMs`, `loadTimeoutMs`) are removed; the block is ignored where a config still carries it. The one model-related call the backend still makes is **Try it** on a served model, now `POST /served-models/try` with the endpoint model-manager reported, held to the installation's own base domain.

- 7273a37: Start a new kagent session. The Sessions tab now carries a composer above the list —
  collapsed to a single line, expanding on focus — with a prompt, an agent picker and
  "Start"; the agent detail page offers the same composer in a dialog with that agent
  preselected. Cmd/Ctrl+Enter starts, Enter inserts a newline.

  **Create, navigate, then send, in that order.** Backing this is a new
  `POST /kagent/sessions` route over kagent's `POST /api/sessions`. Only the create
  happens before navigating: `message/send` blocks for the whole turn, so awaiting it
  first would leave the user on the list for up to half a minute, and firing it
  un-awaited would lose the optimistic echo along with the component holding it. The
  prompt travels with the navigation instead and is sent by the session detail page, so
  the message, the "Working…" indicator and the failure path are all the ones that
  already existed for a reply. The router state is consumed once and cleared — it
  survives a reload and a Back navigation, and re-reading it would start a second paid
  turn with the same prompt.

  **Titles are derived from the prompt**, because kagent does not auto-title: a create
  with no `name` comes back with no `name` at all. Whitespace collapses, the title is cut
  to 60 characters at a word boundary, and it stays renameable.

  **Only ready agents can be chosen.** Non-ready ones are listed but disabled, with their
  readiness message as the reason — offering them would create a session whose first turn
  then fails with nothing on screen explaining why, and hiding them would make a broken
  agent indistinguishable from one that never existed. Picking an agent picks its
  installation, since that is part of an agent's identity, and the picker groups by
  installation once the fleet has more than one.

  The default agent is the **last one used**, remembered per browser and re-resolved
  against the live fleet, so a deleted or no-longer-ready agent falls back to asking for a
  choice. Nothing is preselected on first use: unlike the prototype we have no canonical
  "general purpose" agent, and guessing costs money against something that can act on a
  cluster.

  The prototype's visibility/team selector is dropped — kagent has no sharing model for it
  to map onto.

  Also: **answer an agent's question**. When an agent stops and asks — kagent's
  `input-required` — the session detail page now replaces the reply composer with an
  answer panel: radio buttons for a single choice, checkboxes for a multi-select, and a
  free-text box on every question — a choice list is not exhaustive, and typed words do
  reach the agent because they go inside `ask_user_answers` rather than the message's text
  part. A tool the agent wants permission to run gets Approve/Decline instead. The reply
  composer stays on screen, disabled and saying why: a plain message cannot answer a
  confirmation, but a box that disappears reads as the feature being missing rather than
  blocked. kagent's own UI makes both of these calls.

  The important part is that the answer **names the task it resumes**
  (`params.message.taskId`). Without that, kagent opens a new task: the agent reads the
  words, but its suspended tool call never receives a response, so the task stays
  `input-required` for ever and the model history holds a `tool_use` with no
  `tool_result`. Verified on an internal installation — a session with three questions
  answered from Slack holds seven tasks, three of them stranded; the same question
  answered here resumed a single task in place and the agent continued where it stopped.
  (klaus-gateway sends the id as `params.taskId`, which no A2A version defines and the v0
  conversion drops. That is a one-line fix on their side.)

  Three further details of the format, each verified against kagent's source and against
  live traffic: `decision_type` is mandatory even for a question, because both executors
  read it before they look at the answers; `ask_user_answers` is positional with one
  array per question, and kagent treats a short array as "unanswered" rather than an
  error — so the panel will not submit until every question has something; and an answer
  carries the choice's own text, not its index.

- 5804cd2: Let a session be carried on: a message box at the foot of the session detail page,
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
  0.9.9 on an internal installation: the reply is the whole finished task, `result.kind
=== 'task'`, with `status.state` and full `history`.

  **That wait can neither be completed nor is needed.** That installation's
  `agent-platform-connectivity-ui` HTTPRoute carries an Envoy `BackendTrafficPolicy` with
  `requestTimeout: 60s`, so any turn of substance is cut off with a 502 well before it
  ends — and **the turn survives the cut**, observed live where an agent answered a
  message whose request had already died with a 502.

  Since it survives, waiting buys nothing but a held-open socket, and
  `agentPlatform.kagent.turnTimeoutMs` defaults to a deliberately short **30 seconds**.
  That value is chosen to lose a race rather than to bound a turn: the browser's request
  traverses a door of its own in front of Backstage, and if that fires first the frontend
  gets a 502/504 nothing here can reinterpret, because this service never got to answer.
  30 s always beats a 60 s door. (That installation's Backstage route sets
  `requestTimeout: 0s`, disabling it — but the send path must not rely on that holding
  everywhere.)

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
    `contextId`, and 409 on a second session. Confirmed that the internal installation
    this was verified on runs none.

- c1b3690: Proxy kagent's session detail and session tasks, the transport the upcoming
  Agent Platform session detail page needs.

  - `GET /kagent/sessions/:id` — the session object.
  - `GET /kagent/sessions/:id/tasks` — the session's A2A tasks, which carry the
    conversation (`history`), its state (`status.state`) and per-message token
    usage.

  Both require `?installation=` and a forwarded user token, and both pass kagent's
  JSON through verbatim, as the existing routes do.

  Three details worth knowing:

  - **`GET /kagent/sessions/:id` asks kagent for `limit=1`.** The caller wants the
    session object and nothing else, but kagent bundles the session's stored events
    into that response and they dominate it — on a real 4-turn session, 591 KB of
    events against 261 bytes of session metadata. Nothing reads them (see below), so
    this trims the response by ~99%. It has to be `1`, not `0`: kagent's DB layer
    gates the LIMIT clause on `opts.Limit > 0`, so `limit=0` means _unlimited_ and
    would quietly restore the full payload. Both v0.9.9 and v0.10 honour the param —
    v0.9.9 parses it inline in `HandleGetSession`, v0.10 in
    `eventQueryOptionsFromRequest` — and a version that ignored it would simply
    return everything, which is the previous behaviour.
  - **The conversation comes from `…/tasks`, not from `…/sessions/:id`'s `events`.** That
    is what kagent's own UI renders from, and only task history is structured as A2A
    messages carrying the session's state and token usage. The `events` array is not a
    second view of the same thing: kagent's Go type calls each event's `data` a
    `JSON-serialized protocol.Message`, but a real payload from an internal installation
    decodes to an **ADK event** (`author`, `content`, `invocation_id`, `partial`,
    `timestamp`, …) with no `messageId` at all — so it cannot be correlated with task
    history, and it is ignored entirely. Hence `limit=1` above.
  - **No `A2A-Version` header is sent.** kagent's `NegotiateA2AWireVersion` treats a
    missing header as the legacy v0 wire on both v0.9.9 and v0.10, which is the
    shape kagent's UI consumes and therefore the best-tested one. Opting into the
    v1 wire is a deliberate future migration.

  Session ids stay opaque — real responses mix 64-character hex strings and UUIDs,
  so nothing validates or normalizes one. In particular they are not trimmed:
  Express hands over the decoded segment, so trimming would re-encode a _different_
  id and 404 in a way indistinguishable from a missing session.

  A session belonging to another user answers **404**, exactly as a deleted one
  does, because kagent scopes the lookup by the token's user id. Both are expected
  outcomes for a stale deep link, so neither returns a 5xx — which
  `MiddlewareFactory.error()` would log at `error` and forward to Sentry.

  404 messages are now per-endpoint, because three different things arrive as one:

  - Nothing listening at the host (`fetch` rejects) — "kagent is not available
    here", the fleet-wide wording the frontend's silent classification relies on.
  - kagent answering "no such resource" (404 with a JSON body, since its error
    middleware always answers JSON) — "that session does not exist". Previously
    this read "The kagent API is not available for installation X", i.e. a
    bookmarked link to a deleted session reported an outage on a healthy
    installation.
  - The endpoint not existing (404 with a non-JSON body, because kagent registers
    no custom `NotFoundHandler` and net/http answers `text/plain`) — "this kagent
    predates that endpoint". Without this, an installation on an older kagent would
    report "session not found" for every session forever, and with no version probe
    there would be nothing else to go on.

  kagent's own 404 message is not forwarded: its middleware appends the underlying
  error, so a session 404 reads `Session not found: no rows in result set`.

- 2aaf08d: Let a session be renamed from its detail page. Two ways in: a `Rename session…` item
  in the kebab, and the page title itself — a real button stripped of its chrome rather
  than a click handler on the heading, so it is keyboard-reachable and announced as
  operable. Both open the same dialog, which is why its open state sits on the page and
  not inside the actions menu the way the delete's does.

  Worth having because kagent derives session titles from the first message and
  truncates them to 20 characters, so a session that mattered ends up filed under half a
  sentence.

  **kagent's rename endpoint does not rename on the version the fleet runs**, and this
  is what shapes the implementation. `PUT /api/sessions/{session_id}` is registered on
  v0.9.x, but its handler requires both `name` and `agent_ref`, looks the session up by
  `*sessionRequest.Name` — treating the new name as the id — and assigns only
  `session.AgentID`. `session.Name` is never written. It was fixed in v0.10.0-rc1; GS
  pins 0.9.9, so on every installation we run today the correct endpoint is inert.

  The write therefore falls back to `POST /api/sessions` with the existing `id`, whose
  `StoreSession` is an upsert on `(id, user_id)` that does write `name` — identical SQL
  in v0.9.9 and v0.10.0-rc1. Echoing the session's own `agent_id` back as `agent_ref`
  round-trips exactly, since kagent's `ConvertToPythonIdentifier` only rewrites `-` and
  `/`, neither of which survives in an already-encoded id.

  **Only a 400 enters that fallback, and it means "this kagent predates the fix" —
  nothing more.** The PUT's status says nothing about whether the session exists:
  v0.9.x rejects the missing `agent_ref` _before_ it looks anything up, so a live
  session and a deleted one both answer 400, and the 404 that would separate them is
  reachable only on v0.10+. Everything else (401, 403, 404, 5xx) is surfaced as the
  failure it is.

  **A read-back, not the status, is what enforces "never create".** Before writing, the
  fallback fetches the session and gives up if it is gone — otherwise the upsert, which
  inserts when nothing conflicts, would resurrect a session someone had just deleted
  under its old id. That read also makes the echoed `agent_id`/`source` authoritative:
  they are overwritten by the write, so they come from kagent rather than from the
  browser, where a stale or unparsed value would blank a column nobody asked to touch.

  Every remaining way the fallback can fail, it fails before writing, and each is a
  **4xx** rather than a server error: the session is gone (404), it has no agent (409),
  kagent cannot resolve that agent (409), or a sandbox-workload agent already holds a
  session (409). None is actionable, and on a fleet where every installation takes this
  branch a 5xx would mean a standing Sentry issue per case.

  All of the fallback is marked `TODO(kagent-0.9)` and comes out when no installation
  runs kagent v0.9.x, leaving the plain PUT.

  Smaller decisions:

  - The title carries a "Rename session" tooltip: the hover underline says "this does
    something" but not what, and everything else on the page is inert text.
  - The invalidations **refetch**, unlike the delete's `refetchType: 'none'` — nothing
    navigates away, so the page has to show the new name. Both are awaited inside the
    mutation, so the dialog closes onto data that has caught up rather than onto the old
    title.
  - The name is trimmed, required, and capped at 255 characters. That bound is ours, not
    kagent's (`session.name` is unbounded `TEXT`), and the backend route enforces it as
    well as the dialog — a `maxLength` on an input is a courtesy, not a guard.
  - Confirming does not close the dialog: a rename can fail, and closing on submit would
    throw away the only surface left to report it. Nor can it be dismissed while the
    request is in flight — including via the close button bui's `DialogHeader` always
    renders, which `isDismissable` does not reach. Closing there would leave the mutation
    running with nowhere to report a failure.
  - The dialog seeds its field on the open transition only, never on a `title` change:
    the session read polls, so re-seeding would wipe an edit in progress when the
    session is renamed in another tab.
  - `updated_at` does move, so a renamed session rises to the top of the list — correct
    for an edit.

  `agent-platform-backend` gains a `PUT /kagent/sessions/:sessionId` route (user token
  required, same reasoning as the delete: without one an `unsecure` controller would
  rename the shared default user's session), and its kagent client learns to send
  request bodies. The route takes only the name — the workaround's inputs come from
  kagent, not from the caller.

  On the frontend, `throwIfNotOk`'s 400 → `NotFoundError` mapping is now opt-out. That
  mapping exists because a 400 from this proxy meant "no kagent endpoint for this
  installation", which the reads treat as silent; the rename route also answers 400 for
  a name it refuses, which must not borrow the one name the plugin reads as "kagent is
  absent".

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

- f47e1e7: Stream the agent's reply. Sending a message into a kagent session now goes over A2A
  `message/stream` (relayed byte-for-byte by a new
  `POST /kagent/sessions/:sessionId/messages/stream` route, flush-wrapped past
  Backstage's global `compression()`), so the reply appears in the session detail page
  as the agent produces it — text as it is written, tool calls as they happen — instead
  of all at once when the turn ends.

  **The stream is a preview; the poll stays the source of truth.** Streamed events are
  folded into the same `TimelineItem` shapes the polled history produces and rendered
  as a live overlay on the timeline. An item the poll has already delivered is dropped
  by `messageId` recognition — the rule the optimistic user message already follows —
  and the whole overlay is discarded once the send's awaited invalidation has put the
  canonical history on screen. Both executor dialects are handled: text chunks on
  non-final status-updates (Python) and `partial`-stamped artifact updates with a
  `lastChunk` sentinel (Go).

  **Losing the stream is not losing the message.** The verify-not-report contract of
  the `message/send` path carries over exactly: any event proves the turn was
  dispatched, so a stream cut mid-turn (a gateway's 60 s door, a network drop) resolves
  like the existing 202 and the 10 s poll follows the turn to its end. A transport
  failure before any event triggers one read of the session history to check whether
  the sent `messageId` landed — present means dispatched, absent keeps the failure and
  hands the text back to the composer. A decision (a rejected message, an unknown
  agent, an in-band A2A error) is reported as made, never verified away. On routes
  whose request timeout is disabled (agent-platform-standalone sets `0s`) the stream
  lives as long as the turn; where a door cuts it, the page degrades to exactly its
  pre-streaming behaviour.

  Answering an agent's question still goes over `message/send`: a confirmation seen on
  the stream is deliberately not previewed, because only the polled task carries the
  state the answer panel can actually resume.

- 85e7d8c: The muster and agent-platform backends report, per installation, whether its
  muster or kagent endpoint is reachable from this portal, learned from an
  unauthenticated probe (no credentials, no user data; any HTTP answer proves
  the route, DNS/connection/TLS failure or a 3 s timeout means unreachable),
  cached five minutes. `GET /api/muster/installations` and
  `GET /api/agent-platform/kagent/installations` gain `reachable: true | false |
'unknown'` and `reason`. The Sessions tab no longer queries an installation
  reported unreachable -- so its 10 s timeout and the 500 per page view stop --
  and lists it as "not reachable from this portal"; the MCP Servers tab does
  not run its session probe against an unreachable muster and says so instead
  of offering a connect that cannot help.
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

### Patch Changes

- 66a96ae: Derive the kagent controller's gRPC origin as `https://agentgateway.<baseDomain>`
  instead of `https://kagent.<baseDomain>`.

  The connectivity chart serves the controller's gRPC services (its `GRPCRoute`)
  on `agent-platform.kagent.controllerHostname`, which is
  `kagent.controllerRoute.hostname` or `agentgateway.<domain>` by default — the
  same origin the chart writes as `apiBaseUrl` when it renders the Backstage
  app-config itself. `kagent.<baseDomain>` is the kagent UI's `HTTPRoute` behind
  oauth2-proxy and carries no gRPC: a call there ended with "server closed the
  stream without sending trailers", so a fleet instance without an explicit
  `agentPlatform.kagent.installations.<name>.apiBaseUrl` could not reach any
  installation's controller. The per-installation `apiBaseUrl` override is
  unchanged.

  Also: `GET /kagent/session-states` answers in candidate order (the newest
  session first) rather than in the order the concurrent task reads happened to
  finish, so two evaluations of the same account answer alike.

- 1c9a904: A kagent API 401 or 403 now carries the reason the edge or kagent gave, e.g. "Not authenticated against the kagent API for installation 'gazelle': authentication failure: token uses the unknown key …", so an expired token, a token from a recreated Dex and a missing token no longer read the same. A denial without a reason keeps today's message; the full reason is logged at debug.
- cad8b48: Reachability probes (muster's `/installations`, agent-platform's `/kagent/installations`): a probe that ran out of its 3 s budget while the backend's event loop was busy for most of that window -- a pod initialising every plugin at once under a CPU quota -- no longer records the installation as "not reachable from this portal", an answer the backend then served for five minutes and the browser kept for an hour. Such a timeout says nothing about the endpoint (the same endpoint answers the same process in well under a second once it is idle): it is now reported _inconclusive_, nothing is cached, and the next read probes again -- which both frontends do every few seconds while an installation is `'unknown'`. The warm-up moved from plugin initialisation to the backend's startup hook, a negative answer is re-probed after 30 s instead of 5 min, and the gRPC probe closes its HTTP/2 session instead of leaving one idle for 15 minutes per probe.
- Updated dependencies [343d4b2]
- Updated dependencies [244719a]
- Updated dependencies [d6bec76]
- Updated dependencies [2c4e7eb]
- Updated dependencies [bf367f1]
- Updated dependencies [d6bec76]
- Updated dependencies [71317f9]
- Updated dependencies [85e7d8c]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [5c82125]
- Updated dependencies [5851bba]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
  - @giantswarm/backstage-plugin-agent-platform-common@1.0.0
  - @giantswarm/backstage-plugin-gs-node@0.4.0
