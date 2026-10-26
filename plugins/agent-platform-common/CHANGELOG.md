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
  before an installation's migration are not available.

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
    create carries an idempotency key per submission. Session names are capped at
    200 characters, the controller's limit.

- 0c2f870: The Agent Platform section follows the kagent line onto the `api.kagent.dev/v1alpha3`
  **Agent** object and the controller's **Session** records.

  **kubernetes-react.** `Agent` wraps the `Agent` kind (`agents`, group
  `api.kagent.dev`): the template readers (`getDescription`, `getModelConfigName`,
  `getSystemMessage`, `getSkills`, `getMcpBindings`, the new `getSubAgentBindings`)
  answer for the inline `spec.template`, `getTemplateRef` names a template run by
  reference, `getHarnessName` is `spec.harnessRef.name`, and readiness derives from
  `status.conditions` (`ready` / `notReady` / `failed` / `pending`; `notAdmitted` is
  gone with the admission label). `getHarnesses`, `getDecidingHarness`, `getAgentRefs`,
  `getHarnessLabel`, `HARNESS_LABEL`, `deriveHarnessReadiness`, `decidingHarnessStatus`
  and the `AgentHarness*` / `HarnessReadiness` types are removed. `Harness` loses
  `getAdmittedHarnessLabel` and `getAgentTemplateSelector` (`allowedAgentTemplates` no
  longer exists) and gains `getLimits` and `getEgress`. `ModelConfig` and
  `RemoteMCPServer` move to the `api.kagent.dev` group. The `api.kagent.dev` shapes are
  declared locally (`kagentApi.ts`) until `@giantswarm/k8s-types` publishes them.

  **agent-platform-common.** The session wire module reads `SessionService` responses
  (`{sessions: […]}`, `{session}`, `RUNTIME_STATE_*`) instead of
  `AgentInstanceService`; a session carries `agent` instead of `agentTemplate`.

  **agent-platform-backend.** The kagent client speaks `SessionService`; a create names
  the Agent and no longer picks a Harness, and an Agent without a ready revision is a
  409 naming it. The generated stubs are pinned to `giantswarm/kagent-upstream`
  `f7bf3dafd6a8c21e084015a9310f4692778ebaeb`.

  **agent-platform.** An agent's extra egress origins (`Agent.spec.egress`, kagent-dev/kagent#3019) are typed on
  the create form and the edit page, carried as agent-manager's `egress`, and listed on
  the agent's Configuration card; `Agent.getEgress()` reads them in kubernetes-react. The
  runtime picker offers every Harness of the namespace by name,
  the agent pages read the Agent's own status and the Harness it names, and
  agent-manager's responses are read in their Agent shape (`status.agent`, `harness`,
  `agentDeleted`). Installation inventory detects kagent by the `api.kagent.dev` group;
  cached kagent reads are keyed and busted by that group. The create and save progress
  and the System prompt card speak of the agent instead of its template.

### Minor Changes

- 244719a: Session detail: a canceled turn says so. A turn stopped before it finished — by pressing Stop, or by the controller ending the run — rendered as the person's message, or a reply that breaks off mid-sentence, with nothing to say why; and since the header badge reads only the newest task, a cancel earlier in the session left no trace anywhere on the page. It now closes with an entry the way a failed turn does, worded as what it is rather than as an error: "This turn was canceled", with the controller's reason when it recorded one. Whatever the agent managed to write keeps its place above it. The live stream ends a canceled turn on the same entry, so pressing Stop closes the turn at once instead of leaving the half-written reply looking like it is still being typed.
- 863da43: The session timeline and session usage read kagent's `kagent.dev/a2a/*` metadata (part type, usage, timeline position) and a delegated agent's `usage` response field, and still read the older `adk_`/`kagent_` spellings and `kagent.dev/timeline-position` in stored task history. The message a completed task's status carries is read as the task's last history entry, which is the only place the claude Harness reports its usage, so tool calls, tool results and token usage show again for ADK and Claude Code agents on kagent 1.1. History entries without a timeline position keep their place behind the entry before them. On kagent 1.1 model reasoning is no longer marked as such and replies carry no author, so reasoning renders as the agent's answer and subagent replies are not attributed. `readKagentMetadata` and `readKagentSubagentUsage` take an optional type guard, a usage spelling that counts no tokens no longer hides an older one that does, and `readKagentMetadataRecord`, `isRecord` and `asRecord` are exported.
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

- a59b04c: `UsageTally`, `SessionUsageTotals` and `UsageAgentEntry` carry an optional `costUsd`, summed from the `costUsd` in each turn's `kagent.dev/a2a/usage` metadata and absent when no turn reported one. `reduceSessionUsage` fills it and `normalizeSessionUsage` reads it. New `addTally` adds one `UsageTally` into another.
- 2c4e7eb: `readTurnProgress(tasks, now)` classifies a session's newest turn as `working`,
  or `stalled` since the task's last timestamp once it has not advanced for
  `ACTIVE_MAX_AGE_MS`; a terminal task, one waiting on a human, or a session that
  never ran is neither. `isAgentWorking` is now defined on top of it, so the two
  cannot disagree about when a turn stops counting as live.
- 17f51ca: The session cost popover's **Context used** is the newest turn's largest model call (prompt plus output), no longer the sum of every call in the turn, which on a long turn ran to several times the model's window and was then shown capped at 100%. A raw count never sits beside a share: above the configured window, or for a model the table does not name, it shows with a line saying why. A claude Harness turn, which reports only a total over its calls, reads "Not reported". The default `agentPlatform.models.contextWindows` table names each Claude family on its own, following Anthropic's documentation: 1M for the 5.x models, Opus 4.6 to 4.8 and Sonnet 4.6, 200k for Opus, Sonnet and Haiku 4.5, and no `claude-*` catch-all. `agent-platform-common` adds `readUsageReport` (a usage bag's totals and context reading, parsed once) and `claimEndedTurnMessage`.
- 3f7455f: The session timeline and session usage count the tokens a failed or canceled turn reports on its status message, where the claude Harness puts what a failed Claude Code turn spent. The message stays off history, so the failed-turn entry still shows the reason. Session usage also counts the usage on a pending prompt of a turn awaiting input, as the timeline does, and no longer credits a message from a turn outside the window to a later turn that repeats it. A failed turn's reason no longer renders a second time when a later turn's history repeats it. `readTurnStatus`, `historyWithPendingPrompt` and `claimEndedTurnUsage` are exported.
- 03a24b1: The session page shows the cost the agent's runtime reported beside the estimated cost. The claude Harness reports `costUsd` in each turn's `kagent.dev/a2a/usage`; `TokenUsage` carries it as `costUsd`, summed like the tokens and absent when no turn reported one. A session whose runtime reports no cost shows no reported figure.
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

- 27e64aa: Render files attached to a session's messages. A file part was dropped while the
  timeline was built, so an attachment showed nothing at all — not the image, not
  even a hint that something had been attached.

  An allowlisted raster image (PNG, JPEG, GIF, WebP) renders inline, scaled to fit,
  with its file name, the type its bytes carry and its size; pressing it opens the
  image at natural size in an in-page dialog. Anything else renders
  an inert chip: the name, the declared type, the size, and why there is no
  preview. An attachment is conversation rather than the agent's working, so the
  timeline's Hidden setting does not remove it, and a file the user attached sits
  on the user's side of the turn.

  **The bytes are untrusted input rendered in our own origin**, so the declared
  `mimeType` is never acted on. The checks run in order — no payload, a location
  rather than bytes, over the 8 MB cap by length alone, invalid base64 — and only
  then are the first 30 bytes decoded to derive the type from the magic bytes and
  read the dimensions, so a large image is never fully decoded just to classify
  it. An image declaring more than 50 megapixels is not previewed: the byte cap
  does not bound what the browser allocates to decode it. Unpadded, URL-safe and
  line-wrapped base64 are read as the same bytes. The `data:` URL carries the
  **sniffed** type, never the declared one.

  **An SVG is never previewed**, including one that declares itself `image/png`. It
  would not run script in an `<img src="data:…">` — browsers load it in a
  non-scripting mode — so this is defence in depth against a later switch to inline
  `<svg>`, `<object>` or open-in-a-new-tab, and it keeps SVG's XML-entity and
  filter denial-of-service surface out of the page. There is no download link for a
  file with no preview: handing untrusted bytes to disk moves the risk to wherever
  they are opened next. The bytes never pass through the markdown renderer.

  A file that arrives on the live stream re-reads the conversation at once, so it
  shows up mid-turn rather than with the next poll.

  A file kagent only linked to is described, not fetched — the portal would
  otherwise make a request on the reader's behalf to a host named by whoever sent
  the message.

  No CSP change is needed: `img-src` already carries `data:`. A deployment that
  overrides `img-src` must re-list it, since Backstage replaces config arrays
  rather than merging them.

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

- b5f7aa4: A session started in a workspace shows it: the session's header has a chip
  with the workspace's name, its last sync and how many repositories were
  fetched fresh at the start. The chip opens a drawer with a link to the
  workspace, the repositories fetched before the first turn, the workspace's
  repositories, this session's directory with its size and cleanup date, and
  the provider you act as in it. The Sessions list gains a Workspace column and
  the session rail names the workspace beside the agent. A workspace you can no
  longer see shows unnamed; a session without one looks as before. The backend
  relays a Session's workspace volume, fetched repositories and providers from
  kagent, whose API it now speaks at kagent-upstream v1.22.2.
- 2b79a0c: The Agent Platform lives in the agent shell only. Its pages (`page:agent-platform`
  with its sections, muster's Connectors and Workflows among them,
  `page:agent-platform/skills`, `page:agent-platform/profile` and muster's
  `/agent-platform/mcp-servers` redirect) carry the new `AGENT_SHELL_ON`
  extension predicate from `agent-platform-common`, so they are mounted only
  where the shell is available (`app.portals.agentPlatform`, or a person's
  `agent-platform-shell` opt-in).

  - **Agent Platform off** (`app.portals.agentPlatform` unset or `false`): the
    classic portal has nothing of the Agent Platform — no sidebar item, no
    `/agent-platform/**` route, no classic-chrome Agent Platform page — even
    where `app.extensions` lists `page:agent-platform`. Deployments that used
    the classic-chrome Agent Platform section lose it by design.
  - **Agent Platform on**: `/agent-platform/**` always renders in the shell; the
    classic sidebar carries only an **Agent Platform** link to `/agent-platform`
    (a new tab while the classic portal is served), and the shell's **Platform
    Portal** item links back.

  The classic-chrome rendering of `page:agent-platform` (its header and tab
  strip) is gone. Create cluster and Delete cluster on the classic Clusters
  pages are unchanged.

- 2b79a0c: Add the `skillCreation` meta-agent role (`agentPlatform.metaAgents.skillCreation`) for the skill creator agent, which writes complex, nested skills in conversation.

  - Add Skill and Edit Skill show a strip above the form where the role resolves to an agent that can take a session: "Use this form for simple skills", the skill creator agent for more complex, nested skills, and **Let <agent> help**. The strip is the one the create-agent flow's "Let Swarm Operator help" uses, now a shared `MetaAgentBanner`. Pressing it starts a session with the agent and opens it. The first message names the target repository and what was typed so far, or the skill being edited (repository, SKILL.md path, commit, branch). It asks the agent to ask about the skill's purpose before writing and to propose the skill as a pull request. Where the role is unconfigured or names no startable agent, nothing shows. The forms themselves stay SKILL.md-only.
  - `agent-platform-common`: `skillCreation` joins `META_AGENT_ROLES`.
  - `analytics-react`: `AgentPlatform.sessionStarted` gains the `skillCreationAssist` entry point.

- 2b79a0c: Skills grow a detail page, an "Add skill" flow, and the meta-agent role helper.

  **Skill detail page** (`/agent-platform/skills/<owner>/<repo>[/<skill dir>]`):
  every card on Customize → Skills now opens a page built from the discovery
  list's data alone (decision G7 — no version history, no SKILL.md body, since no
  API serves either): name and description from the frontmatter, source
  repository, path, branch and the pinned commit, the agents using the skill
  (each linking to its page — which is also where a pin is updated, so the list
  is the page's honest "update" affordance; there is no global update), and a
  "View source" link into the repository at the pinned commit. An **Evaluate**
  button appears only where the `skillEvaluation` meta-agent role resolves
  (decision G8); it opens a session with that agent, the review prompt prefilled.

  **Meta-agent roles** (decision G13): `agentPlatform.metaAgents`
  (`generalInformation`, `agentManagement`, `workflowManagement`,
  `platformOperations`, `skillEvaluation`) maps each role to an agent name in
  app-config, served through the signed-in config. `readMetaAgents`
  (agent-platform-common) reads the mapping; `useMetaAgent(role)`
  (agent-platform) resolves it against the agent index and returns the agent or
  undefined — features gate on it and hide while unresolved.

  **Add skill via pull request** (decision G16 B): the Skills tab's new "Add
  skill" dialog (name, description, instructions, target repository) calls
  gs-backend's new `POST /agent-skills/pull-request`, which validates the target
  against `agentPlatform.skills.repositories`, creates `add-skill/<name>`, puts
  `<name>/SKILL.md` and opens the pull request — **as the signed-in person**,
  with their own GitHub grant in muster (`githubAuthApiRef`; the token travels in
  a `gs-github-token` header, and a person without a grant is bounced through
  muster's connect once). Nothing deploys: a teammate approves the PR and the
  skill appears once it merges and discovery re-reads the repository. GitHub's
  refusals (no push access, the skill or branch already existing, rate limits)
  are forwarded with their upstream status and said in words.

  New portal event `AgentPlatform.skillProposed`; `AgentPlatform.sessionStarted`
  gains the `skillDetail` entry point.

- 9eab10f: Every session starts through agent-manager's `start_session`, called through
  muster as the signed-in person (`AgentManagerClient.startSession`), on every
  entry point: the sessions list, the agent page, the session page, the command
  palette, the meta-agent hand-offs and the create-agent assist. It is the one
  place where an agent and, optionally, a workspace grant meet, so no surface
  can skip a workspace's access check. The portal sends no grant yet: an absent
  grant is the plain session.

  The portal calls `start_session` without a message, so it only creates the
  session; the session page still sends the first message itself, streamed and
  with the human-in-the-loop extension requested, as every reply. The
  idempotency key per submission and the derived title are unchanged.

  The backend's `POST /kagent/sessions` route and `KagentClient.createSession`
  are removed, with the frontend's `KagentApi.createSession` and the common
  package's `parseCreatedSessionId`. Reads, sends, rename and delete stay on the
  kagent proxy. Requires an agent-manager whose `start_session` takes an
  optional message on the installation.

- 2b79a0c: The Usage screen is rebuilt per the Agent Platform prototype, with the views
  **Overview**, **Cost**, **Your sessions** and **Technical details**.

  **Overview** opens with KPI tiles — spend this window with the change against
  the previous window, tokens, your own session count, and the active agents —
  followed by compact per-agent and per-model spend breakdowns. **Cost** carries
  the cost-over-time chart and the full by-agent and by-model tables.
  **Technical details** absorbs the raw gateway figures (token counts, model
  calls, blended rate, cache share), the tokens-per-day chart, the gateway health
  strip, and the connector tool-call section the muster plugin contributes —
  `/agent-platform/usage/mcp` redirects there, and the view exists whether or not
  muster contributed anything.

  Two scope controls sit above the tab strip, both kept in the URL so they
  survive a tab switch and travel in a shared link: a **time window**
  (7/30/90 days, `?window=7d`) applying to the gateway views, and an
  **Environment (installation) selector shown only when the portal knows more
  than one installation**.

  Costs follow the installation's configured display currency where one is set
  (`gs.installations.<name>.currency`), USD otherwise. A converted amount is
  labeled **estimated**; the gateway's measured USD figures and the
  runtime-reported costs are never relabeled.

  The kagent session-usage fan-out now also sums the **runtime-reported cost**
  (`costUsd`, which the claude harness reports per turn), overall and per agent —
  so Your sessions shows "Reported cost" beside the token-derived "Est. cost",
  and an agent whose runtime reports none says "Not reported" rather than $0.

  The tiles stack and the tables scroll at phone width (375px).

- 9188650: The session-states read gives a failed session a short failure class
  (`failureReason`: `model-unavailable`, `tool-failed`, `runtime-lost` or
  `other`), classified on the backend from the turn's or the instance's failure
  text, which never leaves the backend. A session kagent marked as having lost
  its runtime is `runtime-lost` whatever its newest turn's state.

  `agent-platform-common` exports the row rule of agent session notifications:
  `deriveSessionNotificationRow` takes one session's state, its Notification
  level (`default`, `all`, `muted`) and whether it was started in the portal, and
  returns the Waiting, Failed or Turn finished row it has now, if any, with the
  row's identity (`id`).

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

- 2b79a0c: Deployment config now decides which portals exist: `app.portals.platformPortal`
  (default `true`) and `app.portals.agentPlatform` (default `false`), documented in
  `packages/app/config.d.ts` and `app-config.yaml`. Both are public config, since
  the app decides its pages and navigation at start, before sign-in.

  - **Both on**: the Agent Platform shell on `/`, `/agent-platform/**` and
    `/customize/**`, the classic portal everywhere else, cross-linked in new tabs
    ("Platform Portal" in the rail, "Agent Platform" in the classic sidebar) — for
    everyone, no flag needed.
  - **Only `agentPlatform`**: the shell is the navigation. `/` is the new-session
    screen for everyone and the rail has no "Platform Portal" item. Classic pages
    stay reachable by URL, in classic chrome, whose "Agent Platform" item leads
    back home in the same tab; nothing in the shell links to them.
  - **Only `platformPortal`** (the default): exactly the classic portal — no agent
    shell, no cross-link. The `agent-platform-shell` feature flag remains as a
    per-browser opt-in here only; it is not listed in the settings while the
    deployment has the Agent Platform on. Both off reads as the default.

  The app's FeatureFlagsApi reports `agent-platform-shell` from this config (with
  the person's flag as the opt-in), so the shell's extension predicates and every
  plugin reading the flag follow the deployment. `agent-platform-common` gains
  `readPortals`, `isAgentShellOptInOffered` and the `Portals` type; the app gains
  `usePortals()`. `agentPlatform` still needs `page:agent-platform` enabled in
  `app.extensions`.

- 83cc65c: A session whose messages keep timing out before the agent starts, with none of
  them reaching the session, now offers to continue in a new session from the
  second such send in a row. The notice reads "This session may not be able to
  continue" and keeps the message box and the retry, since kagent has not marked
  the runtime lost. A send that lands, or a new turn, ends the count; a loss
  kagent reports later takes the reported path. `agent-platform-common` adds
  `countSendTimeout`, `readSendTimeoutRuntimeLoss` and `RuntimeLoss.source`.
- ebd7572: Session messages can carry images. The session page's composer, the home and
  Sessions composer and the New session dialog attach images pasted from the
  clipboard or dropped on the box, as removable thumbnails; they go to the agent
  as A2A file parts with the message, and the transcript shows them as thumbnails
  that open at full size. PNG, JPEG, GIF and WebP only, each drawn and encoded
  again before it is sent, which strips its metadata (a photo's location among it)
  and scales it to at most 2,000 px; at most 2 MiB each, 4 images and 3 MiB per
  message, and 50 images and 16 MiB per session, checked in the composer and again
  in the backend. An agent on the Claude Code or Codex runtime, or whose model's
  provider kagent sends no images (Ollama, Bedrock, Mistral, SAP AI Core), says it
  cannot take images. The backend's message routes take 5 MB bodies, and a
  conversation too large for one task listing is read in smaller pages. `ui-react`
  adds `ComposerAttachmentList`, and `ComposerFrame` gains an `attachments` slot
  and a drop state (`isDropTarget`, `dropLabel`). `kubernetes-react` adds
  `harnessRuntimeOf` and `Agent.getInlineHarnessRuntime`. The chart raises
  ingress-nginx's `proxy-body-size` to `6m`.
- 2b79a0c: Export `AGENT_SHELL_FLAG` from the common package, so plugins that render inside the agent-platform shell read the flag without depending on the agent-platform plugin. The agent-platform plugin keeps re-exporting it. muster reads it through its own `useAgentShell` hook.
- 2b79a0c: Classic pages keep their pre-shell `InfoHint` and `FactList` behavior. The press-to-open popover, the larger hit area and the 600px stack point now apply only inside the agent-platform shell, which marks its pages with the new `ShellScopeProvider`. Markdown tables in `GSMarkdownContent` and the session timeline scroll instead of breaking words mid-word in their cells. The shell flag is read once per app load (`isAgentShellOn`), so the shell's pages and chrome always agree.
- 2b79a0c: A described session state carries `shellLabel` next to `label`: the agent-platform shell's word for it, one of Waiting for you, Working, Finished and Failed (an unrecognised state keeps its raw form). `label` is unchanged.
- 220e7c7: A session's live view now survives a cut stream. When the stream of a running
  turn ends before the turn does, as every stream does during a kagent
  controller rollout, the page resubscribes to the turn and continues the reply
  where it stopped, saying "The live view was interrupted. Reconnecting…"
  meanwhile. When that keeps failing for a few seconds, the page follows the turn
  through the conversation poll as before and says the live view could not be
  restored. The backend adds
  `POST /kagent/sessions/:sessionId/tasks/:taskId/subscribe`, which relays
  `A2AService/SubscribeToTask` as the signed-in person.
  `agent-platform-common` adds `STREAM_MAX_DURATION_MS`, the bound the relay and
  the page share.
- 3130bf4: Usage: when the selected time range reaches back further than an
  installation's records, Overview, Cost and Connectors say since when calls were
  recorded and how many of the range's days that covers. The Cost tab shows the
  change against the previous range only when the records reach back before it.
  The muster-backend `/usage` route returns `data_start`, and the common package
  exports `usageDataStart` and the Usage screen's day formatters
  (`formatDayTick`, `formatDayTooltip`, `formatDayWithYear`). The session usage
  reader's `maxAgeMs` now defaults to `windowDays` plus one day, so raising
  `windowDays` no longer drops sessions by age alone; `maxSessions` still caps how
  many are read, so raise it with a wider window.
- 6079d5b: The Usage screen's time window is a select labelled "Time range" with the
  options "Last 7 days", "Last 30 days" and "Last 90 days", in place of the three
  bold "7 days | 30 days | 90 days" buttons. Beside the Environment select it has
  the same label, box, edge, radius and height, and the two line up. On Your
  sessions, a window longer than kagent keeps is a disabled option that says why
  under its name ("kagent keeps 30 days of session usage"), which screen readers
  read with it; the note that said so beside the control on phones is gone.

  `ui-react` exports the control as `LastDaysSelect`.

  `agent-platform-common` removes the export `usageWindowLabel`, which nothing
  uses any more. Code that imports it must name the window itself.

- 0af6fea: Usage → Your sessions shows your actual model cost, as the gateway priced
  it, instead of an estimate: in the totals strip ("Cost", "All your model
  calls") and per agent. It covers every model call made as you, in your
  sessions or not, and the tooltips say so. Where it cannot be read (kagent
  names no one, the gateway records no user, none of your calls was priced, or
  Mimir is down), the page falls back to the estimate, labelled "Est. cost",
  with the reason. The description drops "Overview and Cost cover every user's
  model calls."

  The figure comes from a new route, `GET /api/agent-platform/usage/model-cost`,
  which takes the person from kagent (`GetCurrentUser`, with their own token)
  and builds the query itself, so no request can read anyone else's cost.
  `MimirService` and `mimirServiceRef` move from gs-backend to gs-node, the
  metric registry from gs to gs-common (`mimirMetrics.ts`, still re-exported
  by gs), and `counterIncrease` to agent-platform-common.

### Patch Changes

- 5bdbb49: Agents: the Agent actions menu on an agent's page offers Change Harness. Its dialog lists the runtimes of the agent's namespace and the checks of the one you pick, blocks the change when a check fails, and links to the edit page to fix it. Running sessions stay on the runtime they started on until you delete them; on the agent's Sessions tab they are marked Earlier revision.
- 7740b89: An attachment's base64 payload is normalised in one pass over its characters
  rather than with a regular expression, whose backtracking over a payload of
  ~11 MB could exhaust the engine's stack (`RangeError: Maximum call stack size
exceeded`) and make the chat fail to render a message instead of showing the
  attachment as too large.
- 2b79a0c: On the agent wizard's Tools step, undoing a change to a preset-based toolset collapses it back to the preset, keeping what was added beside it, even after a round trip through another step, and a preset whose coverage cannot be read no longer shows its connectors as None. Leaving a session mid-turn ends its stream once the message has reached the agent, and a stalled turn reads "Not responding" instead of "Working". Pins, favorites and dismissed hints toggled in quick succession all persist, and pinning and favoriting are reported as `AgentPlatform.sessionPinChanged` and `AgentPlatform.agentFavoriteChanged`. A hand-off to a meta agent caps the draft it carries and refuses a prompt over the 32,000-character message limit before creating a session; that limit is now one constant in agent-platform-common.
- 341e658: Agents per tenant. A person who may list agents only in some namespaces sees
  the agents of every tenant the kagent controller lets them list (`ListAgents`
  as the person, new backend route `GET /kagent/agent-namespaces`), read through
  the Kubernetes API as before. Each agent names its tenant (`platform`,
  `organization <name>`) and its creator (`agent-platform.giantswarm.io/created-by`);
  the Agents tab filters by tenant and "Created by: Me" (the person's email from
  kagent's `/me`, as agent-manager records the creator). A person whom no tenant
  binds, or who may create agents in no tenant and sees none, is told who grants
  access instead of an error or an invitation to create. The create flow offers only
  the tenants in which the person may create agents and picks the only one; Edit,
  Update skills and Delete show only where the person may update or delete the
  agent's HelmRelease, and a deep link to the edit page without that right shows
  the refusal; a refused session start names the agent's tenant.
- 2b79a0c: The Usage page's remaining tables stay plain at a few entries and bounded at
  hundreds:

  - The conversations by-agent table, Cost's by-model table and the MCP usage
    connectors table render their first 15 rows (by the active sort), with
    _Show all N_.
  - The top tools and top connectors tables say what their top-10 cap left out
    ("and 14 more, 230 calls between them.") instead of dropping it silently.
    The `session-usage` route now returns `otherTools` and `otherMcpServers`
    (`{ count, calls }`) beside the capped lists.

- 2b79a0c: `agentPlatform.metaAgents.*` values must now name the agent as `<namespace>/<name>`, or `<installation>/<namespace>/<name>` where it runs on several installations. A bare name, or a value that matches more than one agent, resolves to nothing, and the feature that role gates stays hidden. Before, a bare name matched the first agent with that name in any namespace the viewer could list, so anyone who could create an agent there could take over the role. Update existing configs, for example `skillCreation: skill-creator` to `skillCreation: kagent/skill-creator`.

  The first messages that meta-agent hand-offs send (Evaluate, Edit via agent, the skill creator) now frame workflow definitions, skill content and drafts as data the agent must not take instructions from. Names and paths from repositories are reduced to one line.

- 2b79a0c: Session states use one vocabulary everywhere: Waiting for you, Working, Finished and Failed. `describeSessionState` returns those words as `label`, and the separate `shellLabel` and `SHELL_STATE_LABELS` are gone (`SESSION_STATE_LABELS` replaces the latter). An agent's Sessions tab now uses the Sessions page's list, so a few sessions show without pagination, search or an Agent column.
- 2b79a0c: The Usage time range applies everywhere. The Overview's "Your sessions" tile counts the selected window, and Your sessions shows sessions and tool calls for 7 days too: the session-usage route now reports `toolCalls` and `lastActiveSessions` per day. The Connectors view asks muster for the selected window instead of a fixed 30 days. The per-day chart no longer draws a bar for tomorrow.
- bf1e9b2: The line under _Est. cost_, in a session's cost popover and on _Usage_, now names the input and output tokens the estimate priced, written the way the token figures beside it are (`48.0k input and 466 output tokens`), instead of one exact total that no figure on the page showed. When kagent counted tokens beyond input and output, such as thinking, the line says how many the estimate does not price. Token figures round half up to a tenth (48,050 reads `48.1k`), move to the next unit when they round into it (999,950 reads `1.0M`, not `1000.0k`), and reach billions (`2.3B`). Sizes do the same (1,048,575 bytes reads `1.0 MiB`, not `1024 KiB`).
- 69e07c8: A session's actions menu, on its page and on each row of the Sessions list,
  has a Notifications submenu: Default, All activity or Muted, the current one
  ticked. The level is kept per person in the user-settings backend, with the
  sessions the portal started and what the person has seen in the Notification
  inbox; `useSessionNotificationRecord`, `useSessionNotificationSettings` and
  `useNotificationSeenMarks` read and write that record. Entries for deleted
  sessions are pruned, only after a complete read of the installation's
  sessions (`KagentApi.listSessionsIfComplete`); the backend now flags a session
  listing cut at its page limit as `truncated`. Settings writes read the stored
  value first and refuse to write on a read that failed. Adds the
  `AgentPlatform.sessionNotificationLevelChanged` event.
- 2b79a0c: A session whose agent ended its turn is "Idle" instead of "Finished", and its composer invites a reply to the agent instead of resuming the session. The session header shows "Working" from the moment a message is sent, from the same state the conversation shows. The rail always lists sessions waiting for you above the recent ones and counts them beside "All sessions". The sessions list orders and groups sessions by last activity, as the rail does, in a "Last active" column.
- 2b79a0c: Add `formatCount`, `formatSeconds` and `formatBytes`, shared by the agent-platform and muster plugins.
