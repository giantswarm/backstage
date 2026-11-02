# @giantswarm/backstage-plugin-muster

## 0.4.0

### Minor Changes

- 34f5fc9: The edit page and the Delete dialog of an agent applied from Git check up
  front whether agent-manager can open a pull request for it. An agent defined
  outside agent-manager's directory gets an explanation instead of the form (or
  only Close in the dialog) that says why in plain words and links the
  repository to change it in, with what agent-manager checked under Technical
  details; a missing GitHub authorization that a sign-in to agent-manager
  gives gets that sign-in before the person starts. Any other answer leaves the
  form and confirm as they were. The review step, Update skills and Change
  Harness explain the same refusal the same way, worded per action, and keep
  the release and the file agent-manager looked for under Technical details.

  The muster plugin exports `useServerNeedsSignIn`, whether muster reports a
  server as waiting for the person's sign-in.

- 551e5d5: One installation scope for the Agent Platform section. A selector in the page header lists "All installations" (the default) and every installation whose inventory has kagent, muster or KServe, home first, each with its state (signed out, not reachable from this portal, no kagent/muster here); it scopes Agents, Sessions, Models and MCP Servers alike, is kept in `?installation=` and in localStorage under the key the muster picker always used, and is not rendered on a portal that knows one installation. Under "All installations" the three fleet-wide lists query the home installation first and render its rows before any other installation is asked; the others stream in as groups below, each headed by installation name, pipeline and a status line (loading, N items, none here, could not be read, not reachable from this portal). The MCP Servers tab shows the home installation under "All installations" and follows a pinned installation otherwise; its picker pins the shared scope instead of owning one, and no default is written back any more. Detail pages (agent, session, model) carry an installation chip in the header; the New-session composer names the installation in every picker row and in the selected value when the offered agents span more than one installation. The gs plugin exports `useInstallationScope`, `useInstallationScopeUrlSync`, `InstallationScopeSelect`, `applyInstallationScope` and the store (`setInstallationScope`, `INSTALLATION_SCOPE_STORAGE_KEY`, `INSTALLATION_SCOPE_SEARCH_PARAM`, `ALL_INSTALLATIONS`). The agent-platform tabs share one live react-query client. The Model configs list and the Add-model form take their installations from the inventory's kagent installations, home first, instead of every reachable installation.
- e06dec9: Every link into the Agent Platform shell resolves through a route ref, an
  external route ref the app binds, or a helper built on one, instead of a
  hand-written `/agent-platform/…` or `/customize/…` path. No address changes.

  agent-platform adds a `newSession` external route (the shell's home, bound by
  the app like `customize`) and a `musterServer` external route (a connector's
  page), and exports the route refs it kept private:
  `agentEdit`, `modelEdit`, `serveModel`, `importModel`, `pullModel`,
  `addModelBackend` and `addGpuNodePool`, and the Usage views `usageOverview`,
  `usageCost`, `usageConversations` and `usageConnectors`. muster exports
  `newMcpServerVerify` and `withInstallationQuery`, which builds the query of a
  connector, tool or workflow link: `?installation=` first, then any further
  parameters.

- 55e9be1: The workspace provider sign-in is one `ProviderConnectPrompt`, used inline by
  the workspace editor and by the composer's workspace start: it starts the
  grant of each provider instance's own App in muster (`core_auth_login
app=<instance>`), or the server the workspace-manager is pinned to, in a new
  tab, reads `list_providers` again when the person comes back, and tells its
  host once the instance reads connected, with the host's draft or prompt kept.
  Several provider instances, of any kind, connect independently; the composer
  starts the session once every one it asked for is connected. muster's
  `/auth/login` and `/auth/logout` take `{ app }` in place of `{ server }`, and
  `useServerSignIn` signs in to a provider App with `{ app: true }`.
- 2b79a0c: `page:agent-platform` is enabled by default. Its `if: AGENT_SHELL_ON` already
  mounts it only where the agent shell is on, so `app.portals.agentPlatform`
  alone switches the Agent Platform on; `page:agent-platform: false` in
  `app.extensions` still turns it off. Classic-only deployments are unchanged.

  The classic-chrome variants the shell-only Agent Platform left unreachable are
  removed:

  - **agent-platform:** the classic Agents and Model configs lists, the
    classic agent page's header, Tools/Skills tabs and cards, the session
    switcher rail, the classic sessions table and its chips, the
    `installation-scope` header action (`InstallationScopeHeaderControl`) and
    `ShellAwareContent`. The internal `useAgentShell` hook is gone;
    `AGENT_SHELL_FLAG` is still exported.
  - **muster:** the classic MCP servers list, server page, workflow list and
    detail pages, the four-step registration wizard and the classic tool page
    body. **Removed export:** `useAgentShell`, which was always true wherever
    muster renders; read `isAgentShellOn` from
    `@giantswarm/backstage-plugin-agent-platform-common` instead.

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

- fedd5d8: Make Mimir the source of the Agent Platform's usage figures, add estimated
  cost, and split the Usage tab into sub-tabs.

  The Usage tab previously showed only numbers derived from kagent's REST API.
  That could never cover anyone but the signed-in user — kagent's session list is
  `WHERE user_id = <caller>` with no cross-user endpoint — and knew nothing about
  cost, because kagent records none. agentgateway's LLM metrics are gateway-side,
  so they cover every user by construction and carry priced spend.

  The tab now has four views:

  - **Overview** — cost, tokens, model calls, agents and models active, blended
    $/1M tokens and the cache-read share; cost per day stacked by model, tokens
    per day stacked by token type, and the gateway's request duration, error rate
    and 429 count. Every user's traffic.
  - **Cost** — the same metrics broken down by agent and by model, with share of
    spend, $/1M and average tokens per call, plus a table of models the gateway
    cannot price.
  - **Your sessions** — the previous kagent-derived section, now with an
    estimated cost. Only ever the caller's own, which the tab makes structural.
  - **MCP tools** — the section the muster plugin contributes, unchanged. Hidden
    when muster is not registered.

  Two kinds of cost figure, named apart. Per agent and per model it is
  **"Cost"** — measured, priced per call by the gateway from its model catalogue
  as the call happens. Per session it is **"Est. cost"** — the metrics carry no
  session label, so it cannot be read at all: it is kagent's token counts priced
  at an observed $/token over the last 7 days.

  That rate resolves in tiers, and the session detail stat carries a tooltip
  naming which one it used: the **session's own model** where the gateway has
  priced it, then nothing at all when the model is known but unpriced, and only
  when no model is resolvable does it fall back to the agent's or the
  installation's blend. A known model never borrows another model's price — a
  real `claude-opus-5` session read $0.194 against a catalogue price of $0.40
  because it was charged the installation's Sonnet-derived blend, so that case
  now shows `—` with the reason instead of a number that is half right. A model missing from `llmRouting.modelCatalog` contributes no
  cost rather than an error, so anywhere no rate can be derived reads `—` rather
  than `$0.00`, and the "models with no usable price" table says how much is
  uncounted.

  Per-_user_ breakdowns remain impossible: the gateway metrics carry no user
  label.

  Also in this change:

  - `MimirService` gains `queryRange`, exposed as `GET /mimir/query_range` and
    `useMimirRangeQuery` — the Mimir path was instant-query only, so no
    time-series chart could be built on it.
  - The daily charts render one bar per day of the window, zeros included, so a
    young metric cannot draw a single bar across the whole chart; today's bar
    comes from its own instant query over elapsed-time-since-midnight, which is
    real spend so far rather than a part-day extrapolated to a whole one.
  - The five agentgateway metrics are registered in the central metrics registry,
    and `useMimirQuery`/`useMimirRangeQuery`/`useMimirAvailable` are exported from
    the gs plugin so other plugins can query Mimir.
  - `ui-react` gains a validated categorical chart palette (`assignSeriesColors`),
    a `DataBar` component (a number with a proportional bar beneath it, for a
    table column whose rows are worth comparing), and `StackedBarChart` gains
    `showLegend`, `allowDecimalTicks` and `maxBarWidth`.
  - Every numeric column on all four Usage tables carries a data bar, scaled to
    that column's own maximum and coloured per **measure** — so money is the same
    hue everywhere, and the separate hues signal that bars compare rows down a
    column rather than across columns. Error counts take the reserved status red
    rather than a categorical slot.
  - The MCP tools tab's two tables now stack instead of sharing a row: at half
    width the tool-name column wrapped to three lines and the numeric columns
    were too narrow for a bar to be worth reading. Their numeric columns are also
    left-aligned now, matching every other Usage table — bars grow from the
    left.

- 9c0ba49: Report meaningful portal actions through Backstage's analytics API: a new
  `analytics-react` library with the typed event list and `useTrackedMutation`.
  Creating an agent (`AgentPlatform.agentCreated`), starting a session
  (`AgentPlatform.sessionStarted`) and registering an MCP server
  (`Muster.mcpServerAdded`) are tracked; every other write opts out explicitly.
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
- b63373b: A person connects their own ChatGPT subscription in the portal. The sign-in
  dialog lists a row per provider App muster keeps, beside the MCP servers: not
  connected, waiting for the code, connected or failed. _Connect_ shows OpenAI's
  one-time code with a copy button and its link, opens OpenAI's device page in a
  new tab, and turns _Connected_ without a reload; _Disconnect_ drops the grant.
  The agent chat of an agent whose model is the person's own ChatGPT login sends
  no turn until the person has connected it, shows the connect prompt instead,
  and sends a new session's first message once they have. The model is named
  "ChatGPT (your subscription)".
  Profile and settings lists the person's connections, where they connect or
  disconnect one without a feature asking.
- 205d9b4: Connectors (muster MCP servers) are named by the `ui.giantswarm.io/display-name`
  annotation on their MCPServer where it is set, as agents and models are: in
  the Connectors list, a connector's page title, breadcrumbs and document
  title, the tool page's breadcrumb, the connector wizard's edit frame, the
  command palette, the agent wizard's Tools step and review, the agent page's
  tools, Usage → Connectors, the session timeline, the workflow pages and the
  sign-in notice and dialogs. A family takes the display name its members agree
  on, and connectors that would read the same go by their technical names, so no
  two read alike (`connectorDisplayNames`, exported with
  `mcpServerDisplayNames` and `connectorNameSource`). Searches match the display name and the technical name; URLs,
  `server:` selectors and tool names keep the technical name, which the
  connector's Technical details still show. `MCPServer` gains
  `getDisplayNameAnnotation()` and `getDisplayName()`.
- 2b79a0c: Edit a connector in the agent-platform shell through the connector wizard,
  pre-filled, the way agents and skills are edited.

  The shell's connector page drops its Settings tab: Edit opens the wizard on
  the connector (`new?edit=<name>`), whose "Save changes" updates it through the
  same muster update and telemetry the tab used, with the same per-field
  validation as adding one. Close, Cancel and Done of an edit return to the
  connector's page. The tab's old address redirects to that edit, a family's
  instances moved to their own Instances tab, and "Edit in Git…" (for a
  connector applied from Git) and "Edit as JSON…" (for one the wizard cannot
  represent) moved into the page's menu.

  Edit and the menu now sit in the same place for every connector, whatever its
  sign-in state: where Edit cannot be used — the connector is managed by GitOps,
  it is a family, the muster session is not connected, or the wizard cannot
  represent it — it stays, disabled, with a tooltip saying why. Signing in to a
  connector is offered in the Tools tab, where its absence hides the tools. The
  classic MCP server pages are unchanged.

- 884bd42: A connector's page has a Details tab in place of its facts column: sign-in,
  health, calls this month and when it was added, then a Technical details
  fold-out, as on the agent and model pages, with the GitOps source and the
  release that applies the MCPServer, the configuration with its address, the
  auth chain and muster's health detail. The fold-out opens on arrival while the
  connector has failed. A turned-off connector's hint names the menu's "Turn
  on" instead of an "Activate" the page does not offer. `TechnicalDetailsFoldOut`
  and `Mono` move from the agent-platform plugin to `ui-react`.
- 6fe84bd: A connector tool's page (`…/connectors/<installation>/<connector>/tools/<tool>`)
  is split into tabs, in the workflow page's order:

  - **Overview** (the bare address): what the tool is for, the connector that
    offers it, the name muster exposes it as, what its connector declares in the
    MCP annotations, and its input schema, folded.
  - **Run it** (`…/run`): the argument form, Run with its note and the result.
    The run and what is typed live with the page, so a look at Overview keeps
    both; while a run is in flight, leaving the page asks first.
  - **Usage** (`…/usage`): every caller's calls to this one tool over the last
    30 days: tool calls, error ratio, p95 latency, calls per day by outcome and,
    for a family, each instance's figures, with a link to the connector's Usage
    tab. muster's own tools have none.

  The "Usage in the last 30 days" section leaves the page's body for the Usage
  tab. Any other address under the tool's redirects to Overview, keeping its
  query, and the connector's Usage tab links each tool to the tool's Usage tab.

  The muster backend's `/usage` takes `?tool=` (once) to narrow every figure to
  one tool, alone or beside `?server=`. Any name muster may expose is taken,
  escaped into the selector; an empty, overlong or control-character name gets a 400.

- a2443de: Every tool of a connector opens on a page of its own under the connector
  (`/agent-platform/connectors/<connector>/tools/<tool>`): what it does, its
  description under "What it’s for", input schema, the form that runs it and the result, in one
  column. The connector's Tools tab lists its tools as links to these pages
  instead of running them in place. Going back from a tool, by the breadcrumb or
  the browser's Back, keeps the tab's search and filter; Back also keeps how far
  the list was paged.

  A tool's markers read as the Tools list words them everywhere, "Reads" or
  "Changes things", never "read-only" or "destructive"; the agent wizard's tool
  catalogue drops its extra "destructive" marker beside the "Changes things"
  badge.

- 6b84a5f: A connector's Tools tab opens with its search seeded from the page's `?q=`, so a
  connector the Customize › Connectors search matched by its tools opens on the
  matching tools. A search there that finds nothing says what it could not look
  at: the tools while they load, are cut off or need a muster session, and the
  connectors whose tools wait on a sign-in, could not be read or were not listed.
- 2f5598e: Add connector keeps the name typed into its Name field as the connector's
  display name (the `ui.giantswarm.io/display-name` annotation), so "Stack
  Overflow" is shown as typed while it is still registered as `stack-overflow`.
  A name that is the technical name already (`jira`) sets none. Editing a
  connector shows its display name in the Name field and lets it be changed; the
  technical name stays fixed. Installations whose muster is older than v5.43.0,
  which takes no display name, register and edit as before.
- 2b79a0c: The shell's Customize tabs (Agents, Skills, Connectors, Models, Workflows)
  always show their search, however short the list, and gain filters under it in
  the sessions list's chip idiom. Each filter shows only when it would change the
  list — skills from one repository get no Source chips — and each chip counts
  what picking it would leave, over the search and the other picks.

  - **Agents**: Model, and Favorites once something is starred. The environment
    stays the page's Environment select (shown with more than one installation).
  - **Skills**: Source repository, and Usage (used by an agent or not) once the
    agents are read.
  - **Connectors**: Sign-in (how a person signs in) and Connection (connected,
    partly connected, sign-in needed, not connected, deactivated).
  - **Models**: Provider.
  - **Workflows**: Last run (failed, running, succeeded, not run yet). One read
    of the installation's newest 500 runs answers it for every workflow; a
    workflow outside that window reads "No recent run" rather than "Not run yet".

  A list emptied by a filter says so and offers _Clear filters_; a new filter
  starts the windowed list again from its first page.

  ui-react adds `CatalogFilterBar`, `CatalogNoMatch` and `useCatalogFilters`
  (faceted single-choice filters: chips up to six values, a select beyond).
  Inside agent-platform, the skill catalog's Source and Usage filters are their
  own `SkillsFilterBar` and `useSkillFilters`, for the agent wizard's skill step
  to reuse.

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

- 846f143: A person who has not signed in to cluster-manager sees "Sign in to
  cluster-manager to see GPU node pools" with its Sign in on the GPU capacity
  and model cache views (and on Add GPU node pool's cluster list) instead of an
  authentication error, and the view fills in once the sign-in lands. Every
  `401` from muster-backend now says why in `error.reason`
  (`server_sign_in_required` with the server, `token_missing`, `token_expired`,
  `token_rejected`) and is logged with it. The muster client refreshes the
  forwarded token ahead of its expiry, sends a call once more after a refresh
  for a refused token, and no query retries a muster `401` with backoff. New
  exports: `ConnectorSignInAlert`, `splitConnectorSignIns`,
  `musterSignInRequiredOf`, `musterUnauthorizedInfoOf`, `isMusterAuthFailure`,
  `shouldRetryMusterQuery`, `MusterUnauthorizedError` and the
  `MusterUnauthorizedReason` type (muster); `MusterUnauthorizedError` and
  `toMusterUnauthorizedError` (gs-node); `MUSTER_UNAUTHORIZED_REASONS`,
  `MUSTER_TOKEN_REASONS`, `isMusterUnauthorizedReason`,
  `MUSTER_TOKEN_EXPIRED_TEXT` and `MusterUnauthorizedReason` (gs-common, the
  contract both sides share).
- 9e57736: Move the muster section under the Agent Platform page. Instead of a standalone
  page, muster now contributes a `SubPageBlueprint` ("MCP Servers") attached to
  `page:agent-platform`, mounted at `/agent-platform/muster`. Its four views
  (Dashboard, Servers, Workflows, Tool explorer) render as a second-level BUI tab
  row inside the section.

  Tab URLs change accordingly:

  - `/muster/*` → `/agent-platform/muster/*` (bare `/agent-platform/muster`
    redirects to `/agent-platform/muster/dashboard`).
  - The "MCP servers" view is renamed to "Servers":
    `/agent-platform/muster/mcp-servers` → `/agent-platform/muster/servers`.

- 2b14d41: MCP servers page: muster's `Awaiting Session` state (a server used with each person's own identity through token forwarding or exchange, with no session connected) renders as a healthy state, on the server rows, the family cluster pills, the dashboard's servers-healthy stat and the detail view alike. The state badge and the cluster pills carry muster's `Ready` condition message as their tooltip, and the Health block shows it as a row, so the page says how a per-session server is reached, when its token exchange last worked, or which part of a broken exchange fails (`TokenExchangeCredentials`, `TokenExchangeEndpoint`, `TokenExchangeConnector`) without leaving it. The empty-tools note for such a server names the per-session mechanism instead of pointing at a Sign in that does not exist, a `Failed` server's note carries muster's own sentence, and the new-server verify step treats `Awaiting Session` as verified.
- 55db519: Tool calls that report progress: `MusterApi.callToolWithProgress` hands each `notifications/progress` to `onProgress` as it arrives and rejects with `MusterAnswerCutError` when the answer ends before its result. muster-backend serves it on `POST /call/progress` as newline-delimited JSON (`progress` lines, then one `result` or `error` line); a caller that goes away cancels the call. gs-node's `MusterMcpClient.callToolWithProgress` runs the call on the official MCP SDK (`@modelcontextprotocol/sdk` 1.32.1), restarting its wait on every notification, up to 65 minutes.
- d200952: Surface how muster identifies itself to a server's authorization server
  during downstream sign-in (muster#1083).

  - `muster-backend`: `parseAuthLoginResult` passes through
    `structuredContent.clientIdMethod` (`cimd` | `dcr` | `cimd-fallback`) from
    `core_auth_login` challenges; older musters that don't report it are
    unaffected.
  - `muster`: the per-server Sign in affordance warns up front when the
    authorization server advertises neither CIMD support nor dynamic client
    registration (`cimd-fallback` — the sign-in may be rejected as an
    unregistered client, the Miro-style failure), and quietly notes when muster
    registered itself via RFC 7591 Dynamic Client Registration (`dcr`).

- 2b79a0c: Customize › Connectors splits into three sub-tabs, sorted by the
  `agent-platform.giantswarm.io/tool-group` label, families and single servers
  alike: **Your connectors** (the default, at `/customize/connectors`) lists
  what has no label, the customer's own families included; **Infrastructure**
  (`/customize/connectors/infrastructure`; the earlier `families` path
  redirects there) what is labelled `infrastructure`; and **Internal**
  (`/customize/connectors/internal`) what is labelled `agent-platform`, and
  muster itself. muster's page shows its endpoint with a copy button above its
  tabs; its row's state follows the backend's reachability probe, its session
  and whether it listed its tools. A search that finds nothing on a sub-tab, or
  lands on an empty one, names the sub-tabs where it matches. Every Connectors
  crumb of a connector and of its tools leads to the connector's sub-tab. New
  exports: `CONNECTOR_GROUPS`, `connectorGroupInfo`, `connectorGroupOfPath`,
  `LEGACY_CONNECTOR_GROUP_PATHS` and the `ConnectorGroup` types;
  `useMusterCustomizeCounts` adds `connectorGroups`, and its `connectors` count
  includes muster where muster runs.
- 7518832: A connector's page gains a **Usage** tab (`…/usage`): every caller's tool
  calls to the connector over the last 30 days, from muster's dispatch metrics.
  It shows tool calls, error ratio (amber above 5%), p95 latency and how many of
  the connector's tools were called, calls per day by outcome, every tool it
  offers with its calls, errors and p95 (tools never called included), and for a
  family each instance's figures. It links to Usage → Connectors. muster's own
  page has none, since muster's own tools are not counted under a connector.

  A tool's page shows the tool's calls, errors and p95 latency over the same 30
  days, and the Details tab's "Calls this month" becomes "Calls, last 30 days":
  all three read one request, so their numbers agree.

  The muster backend's `/usage` takes `?server=` (repeatable) to narrow every
  figure to those MCPServers, and then lists every tool they were called with
  instead of the busiest 15. Narrowed to several (a family's instances), each
  connector row carries its `p95_seconds`. Where the records start
  (`data_start`) stays the installation's. `window=month`, which only the
  Details fact used, is gone, and a request that still sends `window` is refused
  with a 400 instead of being answered for 24 hours.

  The muster plugin's external route `usageConnectors` is bound by the app to
  agent-platform's Usage → Connectors.

- 94a61cb: Revamp the muster "Create workflow" / edit-ad-hoc-workflow modal and share its editor.

  - The `YamlEditorFormField` wrapper now lives in (and is exported from) `@giantswarm/backstage-plugin-ui-react`, next to the `YamlEditor` it wraps, so it can be reused outside the `gs` plugin.
  - The muster workflow modal now edits the definition as **YAML** (seeded via `yaml.dump`, parsed via `yaml.load`) using the shared `YamlEditorFormField` CodeMirror editor instead of a plain JSON textarea.
  - Closing the modal is now an X in the title bar (the footer "Close" button is removed), the Save button uses the standard primary color, and validation output renders in a fixed-height region so the modal no longer resizes when a message appears.

- 28aada8: Realign the muster dashboard fleet health and stop treating `Auth Required` as a degraded state.

  - `mcpServerStateSeverity` now maps the CRD `Auth Required` state to healthy instead of a warning: it means the server needs a user session, which the browsing user already has, so rendering it amber was a false degraded signal. The real per-user auth gap still surfaces via the tool explorer's `servers_requiring_auth` affordance. The dashboard stat is relabelled "Servers healthy" and no longer counts `Auth Required` against the fleet.
  - The dashboard "Fleet health" section is realigned from an MC × family grid to a server-grouped summary mirroring the MCP-servers manager: each standard family and integration server gets a row carrying a health pill per management cluster it is federated across. The per-MC pill pattern (`presenceByMc` + `InstallationHealthPill`) and the standard/integration partition (`partitionServers`) are extracted to shared modules so the manager and the dashboard group the fleet identically.

- ee800aa: Rework the muster dashboard's metrics and the standard-server rows on the MCP servers page.

  **Dashboard.** The "Fleet health" matrix is gone — it repeated the MCP servers page row for row. In its place, three views that neither the servers page nor the MCP usage page already show:

  - **Capability surface** — what agents can reach through this muster: the tools, resources and prompts each server group contributes to the aggregated catalogue, plus muster's own core tools. A family's tools are counted once (muster deduplicates them across its instances); resources and prompts are per instance and add up. Needs an authenticated session, like the Tools stat.
  - **Fleet coverage** — how far each standard family reaches across the management clusters the installation federates: `10/24 clusters`, a bar split into healthy / degraded / not deployed, and the names of the clusters the family is missing from. This is what tells a family still being rolled out (capi on 10 of 24 clusters) apart from one that is failing.
  - **Provenance & authentication** — how many servers and workflows are GitOps-managed vs registered live, how many servers are deactivated, how many workflows carry validation warnings, and how the servers' users authenticate (platform SSO, token exchange, own account, AWS SigV4, anonymous).

  The Browse grid now links all five views; MCP usage and Tool explorer were missing.

  **MCP servers page, standard servers.** A family federated across two dozen clusters used to wrap its cluster pills onto three lines, while a family on fewer clusters simply had a shorter row — the two were indistinguishable at a glance. The collapsed row now keeps to one line: degraded clusters first (most severe first), healthy ones until the row is full, the rest folded into "+N more", and the trailing figure reads `24 clusters` or, for a partially deployed family, `10/24 clusters`. Expanding a family lists every cluster (degraded first) in a new "Management clusters" block, names the clusters it is not deployed on, and moves the per-cluster diagnostics up next to it.

- 5851bba: The MCP Servers picker lists the installations whose inventory has muster.
  The muster backend derives one installation per `gs.installations` entry with
  a `baseDomain`, at `https://muster.<baseDomain>/mcp`, so an installation that
  adopts muster appears without any portal configuration; `muster.installations`
  entries now override that derived list (`url`, `headers`, `prometheusServer`,
  `authProvider` per name) or add installations the fleet configuration does not
  know. `GET /api/muster/installations` reports each installation's `source`
  (`derived` or `configured`) next to its reachability; derived installations
  always require the person's token, which the frontend mints the same way as
  for configured ones (main-login token for the home installation, the
  installation's brokered token otherwise). The picker intersects the backend's
  installations with the inventory's `muster.giantswarm.io` group, home first,
  keeps a deep-linked installation while its probe is pending, marks
  installations that are not reachable from this portal, and the live-MCP
  screens (tool explorer, MCP usage, runtime state) say so instead of offering a
  connect that cannot help. A portal without `gs.installations` keeps the legacy
  single-installation setup.
- 6f4d55e: Edit a manually-added MCP server through the "Register an MCP server" wizard,
  pre-filled with the server, instead of the raw-JSON dialog.

  The Edit button on a manually-added server opens the wizard at
  `servers/new?edit=<name>`, so an edit survives a reload and can be linked to.
  It is filled in with the server's URL, transport, authentication and request
  metadata; the technical name is locked (the display name, which only derives
  it, is hidden) and saving runs `core_mcpserver_update` on the same server.
  Fields the wizard has no control for (`headers`, `env`, `toolPrefix`,
  `timeout`, `autoStart`, ...) are carried over from the server, a cleared auth
  answer or metadata list is sent explicitly so muster does not keep the old one,
  and `suspended` is left untouched. Switching back to the server's own auth
  answer brings its values back. The wizard says "Edit MCP server: <name>" /
  "Review and save" while editing, and the verify step holds its verdict
  ("Applying changes…") until muster has reconciled the saved spec.

  The edit stays on the installation the server lives on: switching the header's
  installation mid-edit ends the edit and returns to the server list. An
  unfinished new registration is set aside while editing and comes back
  afterwards.

  Servers the wizard cannot represent — `stdio` servers, and servers using token
  exchange, local token minting or other auth settings it has no field for —
  keep an "Edit as JSON" button that opens the JSON editor, with a tooltip that
  says why. GitOps-managed servers are unchanged ("Edit/Remove"). Disabled
  row actions are now focusable and name the reason they are unavailable, for
  keyboard and screen-reader users.

- 2b79a0c: Export `toolEffect`, which reads a tool's annotations as `'reads'` (annotated read-only) or `'changes'` (everything else), and `EffectBadge`, a small "Reads" or "Changes things" badge for it. Export `useAgentShell`, whether the portal renders inside the agent-platform shell.
- 69eaff0: `filterTools` learns the toolset arguments and exports the pieces the agent creation Tools step builds on.

  - `filterTools({ toolset, includePresets })` sends one `toolset=` entry per selector and `include_presets`; `FilterToolsResponse` gains `toolset` (echo), `toolset_unmatched` and `presets`; `ToolSummary` / `ToolDetail` gain `server`, `kind` and the forwarded `annotations` (read-only, destructive, idempotent, open-world hints). All optional — absent from an aggregator that predates toolsets.
  - Exported for other plugins: `ServerSignIn`, `useServerSignIn` (and their types) plus the `filter_tools` / `list_tools` types.

- 159c276: MCP servers: the servers page is one flat table — **Server · Status · Tools · Auth · Source**, sorted by name and sortable by any column — instead of three tool-group sections of expandable rows. A server family is one row, marked with a **Family** pill and a status such as "24 of 26 instances healthy"; a singular server is one row; muster's own tools are one row marked **Core**. The name is a plain link to the server page; every other cell is plain text. Source says whether a server is a Fleet server, a User-registered server or muster itself; Tools counts the row's tools, or says "Sign-in needed" for a server whose tools wait on the person's sign-in. The search (`?q=`) keeps the servers whose name matches or that offer a matching tool (short name or description, the rule the Tools tab filters with); a row matched by its tools says "N of M match" and opens its Tools tab with the same filter. Without a muster session the table still lists the servers from the CRDs, searches names only and says what the session adds. The endpoint and the server/tool totals sit on one line above the table. The accordions, their per-cluster pills and action rows are removed, and so is the "updated … ago" indicator: the list re-reads every 30 s, as the Agent Platform's other tables do.
- 75cb9fa: MCP servers page: the "Managed through GitOps" label on a server links to its source in Git, like the cluster and deployment pages do. The two buttons "Edit via GitOps" and "Remove via GitOps" become one **Edit/Remove** button. Its dialog links to the source and lists the steps to take there. For a server applied by a Kustomization: find the MCPServer file, edit its `spec` or delete it and its `kustomization.yaml` entry, then open a pull request. For a server rendered by a HelmRelease: change the release's values instead. The steps say "merge request" for a GitLab source and "pull request" otherwise. When the source can't be resolved, the dialog names the managing HelmRelease or Kustomization by its real kind. The current manifest is shown in the read-only YAML editor.
- 1642eed: The MCP Servers tab no longer carries an installation picker of its own: the
  Agent Platform page header's installation selector is the one control that
  scopes every tab, MCP Servers included. Where the selector's choice and the
  muster shown differ -- under "All installations" (the section shows one muster
  at a time, the home installation's) or when the pinned installation runs no
  muster the portal knows -- the muster views say so in one line instead. The
  header selector marks an installation whose muster is not reachable from this
  portal on the MCP Servers tab, as it already did for kagent on the other tabs;
  `useMusterInstallations` (the backend's installation list with reachability,
  usable outside the muster section) is exported for that.
- 4cdc2c0: muster contributes two of the Agent Platform's level-1 tabs instead of one: **MCP Servers** at `/agent-platform/mcp-servers` (the servers table, a page per server and per tool, the registration wizard at `…/new`) and **Workflows** at `/agent-platform/workflows`. The second-level tab row (Servers · Workflows · Tool explorer) is gone, and with it the Tool explorer — a tool is inspected and run on its page beneath its server. Old `/agent-platform/muster/…` URLs are not redirected. A workflow's **Run** opens its `workflow_<name>` tool on muster's server page. The plugin's route ids `root` and `toolExplorer` are removed, and `mcpServers`/`workflows` are now the tabs' roots; the `agentPlatformUsage` external route is gone with the legacy usage redirect.
- 6205cca: Add a first-class muster management section. The muster plugin now exposes a tabbed page (Dashboard, MCP servers, Workflows, Tool explorer) over a two-client model: a read-only, multi-installation Kubernetes/CRD client (reusing the clusters-page `useResources` mechanism for `MCPServer` and `Workflow` CRs across every installation that runs a muster aggregator) and the muster MCP proxy for live execution.

  - **Dashboard**: per-installation identity/health cards plus a fleet health matrix (`management-cluster` × `family`) built from MCPServer CRD status.
  - **MCP servers**: CRD-driven list grouped by management cluster/family with an auth/token-chain detail view (`spec.auth`), runtime merge from `core_mcpserver_list`, and per-server tool listings.
  - **Workflows**: CRD-driven list with step counts and validity, a step-card detail view with cross-workflow references, execution statistics, and a run + execution-history view via the MCP proxy.
  - **Tool explorer**: unified browse/search over core, aggregated (`x_<server>_*`), and workflow tools via `filter_tools`, a JSON-schema-driven execution form (`describe_tool` + `call_tool`), and a result viewer.

  The backend `MusterMcpClient` is generalised from the four hardcoded workflow tools to all muster meta-tools (`list_tools`, `filter_tools`, `describe_tool`, `list_core_tools`, `call_tool`) and made multi-installation (config-driven map keyed by installation, selected per request via `?installation=`). A config-driven read-only-by-default safety allowlist gates mutating `call_tool` invocations. The unused ReactFlow workflow-graph stack and its dependencies (`@xyflow/react`, `classnames`) are removed.

- f410853: Every page names the MCP servers waiting for your sign-in or grant, with a dialog to sign in to them. `McpAuthDialog` and `useMcpServersAwaitingSignIn` are exported for features that need specific servers.
- 28aada8: Refine the muster MCP-servers layout so families read as collapsible servers and muster itself reads as one of them.

  - Standard server families now start collapsed (no longer auto-expanding the first row), so the page opens as a scannable list of server families.
  - muster core is rendered as a server-style disclosure ("muster — core / control plane"), collapsed by default and consistent with the standard/integration server rows, reflecting that muster itself is an MCP server.

- 5f09b20: Add an "MCP usage" tab to the muster section (`/agent-platform/muster/usage`),
  showing tool-call volume, outcomes, latency, and top tools/servers for the
  selected installation.

  - The muster-backend gains a `GET /usage` route that derives the statistics
    from muster's downstream dispatch metrics
    (`muster_downstream_tool_calls_total` /
    `muster_downstream_tool_call_duration_seconds`, shipped with muster ≥ the
    release carrying giantswarm/muster#1116). The PromQL queries run through
    the prometheus MCP server federated behind the same muster installation —
    no separate Prometheus access path or proxy config is needed.
  - The prometheus server is discovered by the `<installation>-mcp-prometheus`
    naming convention (falling back to the only prometheus-ish server); the new
    optional `muster.installations[].prometheusServer` config overrides it.
  - Installations without a queryable prometheus server render a friendly
    empty state instead of an error, as do installations whose muster does not
    export the downstream metrics yet.

- 1305e9e: Align the muster section with the New Frontend System app shell and switch to modern BUI tabs.

  - The page no longer wraps its content in the classic `<Page>`/`<Header>`. Under the NFS app shell (which already renders the plugin header and owns the document scroll), the classic `<Page>` (`height:100vh; overflow-y:auto`) added a redundant inner scrollbar and a duplicate header. Content now renders directly, leaving a single scrollbar and one header.
  - Tab navigation moved from the classic `RoutedTabs` strip to `SubPageBlueprint` tabs (Dashboard, MCP servers, Workflows, Tool explorer), which render in the BUI plugin header — matching the flux section. Each tab is wrapped in shared providers so the active installation and muster session stay consistent across tabs. The Workflows tab hosts the per-workflow detail route, keeping the tab selected.

  Tab URLs change: the dashboard is now `/muster/dashboard` (bare `/muster` redirects to it) and the other tabs are `/muster/{mcp-servers,workflows,tools}`.

- c604256: MCP Servers tab: a muster on any installation other than the home one is now
  reached with **that installation's brokered token** — the token the cluster token
  broker mints for it, issued by the installation's own Dex — instead of the
  person's main-login token, which only the home installation's muster trusts.
  Switching the tab to another installation shows its tool count, Tool explorer
  and core families straight away; before, every non-home installation answered
  401 and showed a "Connect to muster" button that fetched the same rejected token
  again.

  - The home installation is the `gs.installations` entry whose
    `oidcTokenProvider` is `gs.authProvider` (the release itself on a standalone
    install). It keeps the main-login token path; so does an installation the
    kubernetes API does not know, and every installation on a portal without
    `gs.authProvider`. `isHomeInstallation()` is exported for callers that need
    the same answer.
  - `getInstallationOidcToken` moves to `@giantswarm/backstage-plugin-kubernetes-react`
    so the muster, kagent and model-manager clients mint identically; the
    agent-platform import path re-exports it unchanged.
  - `useMusterSession()` now says **why** there is no session: `failure.kind` is
    `session-expired` (the portal session is gone — the single main re-login fixes
    it), `mint-failed` (the broker or exchange failed; the cause is quoted) or
    `muster-rejected` (a token was sent and muster answered with an error; its
    message is quoted). A `pending` flag covers the first probe. The gates on the
    MCP Servers page, the dashboard and the register flow follow the class — "Sign
    in again" for an expired session, "Retry" otherwise, nothing while checking —
    and no longer claim a generic "not authenticated". A failed mint is not
    retried by react-query, so a declined re-login is one popup, not three.
  - `muster.installations[].authProvider` still marks an installation as
    requiring a token (`requiresAuth`), but for non-home installations it no
    longer decides which token is sent; the config docs say so.

- 70eeb29: Replace the muster mutation guard with a provenance-only safety model. The verb-heuristic `allowMutations` gate (frontend `classifyTool` + backend `/call` 403) is removed: the trust boundary is the downstream MCP server's deployment (e.g. mcp-kubernetes is deployed read-only), not the portal, so the tool explorer now executes whatever tools muster exposes.

  - Removed the `mutationGuard` module, the backend mutating-verb list and `/call` gate, and the `muster.installations[].allowMutations` config option (existing keys are ignored, no breakage).
  - The only UI restriction is now GitOps provenance: GitOps-managed resources are read-only and produce a PR/manifest; manually-added (ad-hoc) resources allow live CRUD. The ad-hoc badge is relabelled "Manually added".
  - Generalised `lib/gitops.ts` (`readProvenance`, `isGitOpsManaged`, `toManifestYaml`, `toMcpServerDefinition`) to work for any muster `KubeObject` (MCPServer and Workflow), so the workflow CRUD path can reuse it.

- 2b79a0c: Read-only Workflows area for the agent-platform shell (iteration 1, W5/D11).

  **Customize → Workflows list** now shows what the data actually backs: name and
  description, category (the `klaus-lab.giantswarm.io/category` label), step
  count, an honest **"Only reads / Can change things"** badge (the `readOnlyHint`
  muster derives transitively on each `workflow_<name>` tool, read off the
  per-session tool catalogue — never the CR), run count with the latest run, and
  the source (GitOps vs manually added). Search covers names, descriptions and
  categories.

  **New shell `WorkflowPage`** replaces the classic workflow detail inside the
  agent-platform shell (the classic page is unchanged outside it), with
  progressive disclosure:

  - Plain level: description header with the honest effect badge and validation
    warning; inputs (type, required, default, description); the steps as a
    readable sequence — per-step description, the plain connector + tool name,
    "Only if …" for conditions (a gate, never a branch), forEach/parallel groups
    as indented blocks, and an "If it fails" lane for `onFailure`; recent runs
    (when, outcome, duration, and "Failed at step N" in the lazily fetched
    per-step trace) with the ~3-week retention noted; the stats strip
    (`/workflows/:name/stats`); and "agents use it as `workflow_<name>`" with the
    workflows that call it.
  - "Show technical details" toggle: exact aggregated tool names, templated
    arguments, condition specs, step ids, store/output flags, full execution JSON
    per run, and the raw definition YAML (`GET /workflows/:name`, which now takes
    the installation).

  **Read-only per decision D11**: the shell pages offer no create, edit, delete
  or run affordances — changes happen through Git or agents via muster. Versions,
  scheduling, per-run cost and who-ran-it are confirmed absent in muster (G11)
  and are deliberately not drawn.

- d68f887: MCP Servers section: the **Dashboard** view is removed and **Servers** is the
  section's first view. The Servers view now opens with the muster endpoint (with
  a copy button) and a totals line, also when the installation lists no servers:
  servers, how many are healthy and, with a muster session, tools (`…` while the
  count loads). Deactivated servers are counted apart rather than as unhealthy,
  and a hint explains the count: amber once more than 10% of the rest are not
  healthy. The old `/agent-platform/muster/dashboard` path redirects to the
  Servers view, keeping `?installation=`. The backend's `/installations` reply no
  longer carries the unused `source` field.
- 92f025f: Show the resources and prompts an MCP server contributes, alongside its tools.

  The server detail panel previously listed only tools, so the `pro` server's
  `roadmap://schema` and `customer://schema` — whose descriptions tell an agent
  which field names and filter values are valid before it makes a call — were
  invisible in the portal.

  Resources cannot be scoped the way tools are. A tool name carries an
  `x_<server>_` prefix that `filter_tools` matches on, but a resource URI
  carrying a scheme is exposed by the aggregator unprefixed, so the URI says
  nothing about which server produced it and two servers can expose the same one.
  The new panels scope by source server instead, via muster's `filter_resources`
  and `filter_prompts` (muster#1096, muster v5.6.0).

  The Resources and Prompts sections render only when the server actually
  contributes some, read from the new `resourcesCount` / `promptsCount` on
  `core_mcpserver_list` — most servers expose neither, and a permanently empty
  section reads as broken rather than as informative. When a section is shown but
  comes back empty, it says the server may be down or require authentication
  rather than asserting that none exist: a session that has not signed in to an
  OAuth-gated server sees an empty catalogue for it.

- 0bed874: MCP servers: every server gets a page of its own at `/agent-platform/muster/servers/<server>?installation=<inst>`, and every tool a page beneath it at `…/<server>/tools/<full tool name>`. The server page has the tabs Tools · Resources · Prompts, **Instances** for a server family, then Overview (`…/overview`), with counts in parentheses where muster reports them; Tools is the page's index, so a server link lands on its tools. Overview carries what the servers page's accordion showed (configuration, authentication, health, live runtime, GitOps provenance); a family's Overview names its instance argument. Tools lists the server's tools by short name with their read-only/destructive markers, filters by `?q=`, lists a family's tools once (including those muster exposes per instance) and shows the sign-in gate when the session is not signed in to the server. Instances lists each family instance with status, last connected and last error, adds a Management cluster column and a coverage line when the instances carry the management-cluster label, and opens an instance's details and sign-in in the side drawer. The server's actions sit in the page header: Edit (or Edit as JSON) and a menu with Deactivate/Activate, Reconnect, Delete and Sign out for a user-registered server, Edit/Remove for a fleet server, Sign in first while one is needed, nothing for a family or for muster. The tool page shows the tool's short and full name, markers, description and input schema, and runs it with the Tool explorer's typed form. muster's core tools have a server page too (`…/servers/muster`). The servers page's rows link to their server page and its tool tags to the tool pages; a server that does not exist on the selected installation says so, with a link back.
- ff8b3f1: A server page's tabs read Tools, Instances (for a server family), Resources, Prompts and Details. Resources and Prompts show only when the server exposes any, and the Overview tab is renamed Details (`…/details`; an `…/overview` link still opens it). The Tools tab is a table with the columns Tool, Annotations (read-only / destructive, only when a tool has one) and Description, sortable by each and paged (25 a page, as the Sessions table). In the Instances table, an instance's name is a plain link and its status plain text, as in the servers table.

  A workflow opened from the Workflows table opens scrolled to the top, not at the list's scroll position.

  On a tool page, the read-only / destructive markers sit at the end of the "Exposed by muster as" line instead of on a line of their own.

- 2995471: Decide whether an installation's muster carries a server by the name muster exposes it under (`family.name ?? toolPrefix ?? name`), not by the MCPServer's own name. A server declared with a `toolPrefix` is addressed by that prefix — `mcp-marge` exposes `x_marge_<tool>` — so matching the name alone reported it as absent on every installation that runs it. `McpServerRuntime` now carries `toolPrefix` and `family`, and the muster plugin exports that type.
- 2b79a0c: `ServerSignIn`, `ServerAuthActions` and `useServerSignIn` take a `noun`
  (`'server' | 'connector'`, exported as `SignInNoun`) for their own copy: the
  SSO diagnosis, the client-registration notes and the sign-out note. It
  defaults to `'server'`, the wording classic-portal surfaces such as Bot PRs'
  marge sign-in keep; the Connectors tab, the connector wizard, workflows and
  the Agent Platform's agent pages pass `'connector'`. `DEACTIVATED_SIGN_IN_GATE`
  becomes `deactivatedSignInGate(noun)`.
- 8d67e83: Group MCP servers by tool group — **Agent Platform**, **Infrastructure**, **Registered servers** — instead of by topology.

  The MCP servers page used to split servers into "Standard servers" (a `spec.family` federated across management clusters), "Integration servers" (everything singular) and a "muster core" section. That put the platform's own agent-manager and model-manager between GitHub, PagerDuty and a hand-registered server. The platform now tiers its MCP servers through a label the shipping chart stamps on the CR, `agent-platform.giantswarm.io/tool-group: agent-platform | infrastructure`; a CR without the label is a _Registered server_. The portal reads that label and infers nothing from names, provenance or topology.

  - **MCP servers page**: three sections in that order, each with a one-line explanation. Federation stays a row shape inside a section: servers sharing a `spec.family` still collapse into one family row with per-cluster pills and coverage, singular servers keep their disclosure. muster core is the last row of Agent Platform; the ad-hoc registration action sits under Registered servers. An installation whose charts do not carry the label yet lists everything under Registered servers — one long list, never an empty or broken page — and the empty groups say so. A family mid-rollout (only some clusters labelled) stays one row, placed by its labelled members.
  - **Dashboard**: the Capability surface groups its rows by tool group, muster core closing Agent Platform; Fleet coverage keeps measuring per family, whichever group a family is listed under.
  - **Public API** (for the agent creation Tools step and the agent detail page, which group the tool catalogue the same way): `MCPServer.getToolGroup()` (`'agent-platform' | 'infrastructure' | undefined`), `MCPServer.getToolGroupKey()` (adds `'registered'`), `TOOL_GROUP_LABEL`, `TOOL_GROUPS` (key, display title, one-line description per group), `TOOL_GROUP_ORDER`, `parseToolGroup`, and the types `ToolGroup`, `ToolGroupKey`, `ToolGroupInfo`. `partitionServers` now returns the groups in display order, each as rows (`{ kind: 'family' }` / `{ kind: 'server' }`); `familyGroups` flattens the family rows for coverage.

- 2b79a0c: Inside the agent-platform shell (flag `agent-platform-shell`), a server's page is a connector page: breadcrumbs under Customize, the connector's state, Edit and a menu to reconnect, sign out, turn off or remove it; Tools with a search, a Reads / Changes things filter and an inline Try it whose button reads Run; Settings to change the address and sign-in of a server added through the portal, saying Saved and refreshing the connectors once the change is written (read-only, with where to change it, for one managed in Git), with a family's instances below; Resources and Prompts when there are some; and its sign-in, health, calls this month (the UTC calendar month), address and added date beside them. The plugin's `customize` external route names the app's Customize page, which the page's breadcrumbs lead to, and `getMcpUsage` takes `window: 'month'`. The MCP servers sub-page takes a `usedBy` input whose element becomes the page's Used by tab and reads its connector with the new `useConnectorPageTarget`. Outside the shell the server page is unchanged.
- 2b79a0c: Inside the agent-platform shell, registering a connector is the prototype's
  full-screen three-step wizard — **Connect / Sign-in / Test** — on the same
  addresses the classic four-step wizard keeps outside the shell.

  **Connect** takes the server address and probes it live through
  `core_mcpserver_detect` (the inline "Server found" state names the server, the
  detected transport and whether it asks for a sign-in), plus the connector's
  name and an optional description; the transport comes from the probe rather
  than a control. The prototype's "Who can use it?" audience choice is not
  asked: muster registers a connector for the whole installation and has no
  visibility setting to map it to. **Sign-in** offers the four decided modes —
  each person's own account (per-user OAuth), Company login (token forwarding,
  with required audiences and the restart caveat as help text), no sign-in, and
  AWS request signing (SigV4, offered only on the Streamable HTTP transport,
  with the shared-identity warning) — and its "Add connector" validates and
  creates the server through muster directly. **Test** follows the new connector
  live until it connects, offers the one-time sign-in where one is needed, and
  lists its tools with read/"Changes things" badges and the counts ("N tools — X
  that read and Y that change things"), previewing six with a "Show all" link.

  Per-user OAuth gains the GitHub-grade advanced settings muster already
  supports, behind an "Advanced" disclosure: pinned authorization and token
  endpoints (set together, as the CRD requires), a Kubernetes Secret reference
  for an out-of-band registered OAuth client (`clientCredentialsSecretRef` —
  name, namespace and key names; never the credential itself), and the grant
  scope (per login session, or per person across sessions). The composed
  definition, validation and the edit round trip model these fields, so a
  connector registered with them can be edited without losing them; token
  exchange, `forwardIdentity` and plaintext header credentials stay deliberately
  unoffered. The vendored MCPServer CRD fixture is refreshed to the version that
  carries these fields and their CEL rules.

- 2b79a0c: Inside the agent-platform shell, a new connector starts on "Company login", listed first and marked recommended, with plain descriptions for each sign-in choice; the classic registration pages still start from no sign-in. The classic connectors and workflows list pages are no longer reachable inside the shell: `/agent-platform/connectors` and `/agent-platform/workflows` send to the Customize screen's Connectors and Workflows tabs, keeping the query string.
- 71d7a44: New `ToolTable` component: the house list of tools, as a table of name, markers
  and description without a header row.

  Five near-identical tool lists had grown across the two plugins — the Tool
  Explorer's browse rows, an agent's resolved toolset, muster's `ToolList`, the
  toolset picker's rows, and the servers page's chips — in four spellings of the
  tool name across three sizes, and five treatments of the summary. Only two of
  them showed the read-only / destructive markers their servers annotate, and the
  Tool Explorer, the one surface that actually _runs_ a tool, was not among them.

  `ToolTable` is one component behind all of them. What differs between surfaces
  is a row's `mode` — shown, linked, selectable (the whole row opens the tool) or
  checkable — not its typography. It is presentational: it renders exactly the
  items it is given, and grouping, searching and paging stay with the caller.
  Columns are a CSS grid on the list with `subgrid` on each row, so they line up
  without a header, and the marker column only exists when some row in the list
  can fill it.

  The `isReadOnly` / `isDestructive` annotation predicates moved to the muster
  plugin, where `ToolTable` needs them too; `agent-platform`'s `lib/toolset`
  re-exports them unchanged, so its callers are unaffected.

  Every one of those lists now renders through it: the servers page's core tool
  families (`ToolList`, deleted), the resolved toolset behind the agent detail
  page, the Tools step, the review page and the edit page, the Tools step's
  catalogue, and the Tool Explorer's browse, search and quick-access lists. The
  Tool Explorer and the core families show read-only and destructive markers for
  the first time — the surface that actually runs a tool was not telling anyone
  which tools destroy things.

  The servers page's inline chips stay as they are: a dense jump-off surface, not
  a read-and-compare list, and a different affordance rather than a different
  styling of the same one.

- f47797c: The MCP server registration wizard now detects the server's transport automatically. Once the URL on the details step looks complete, muster probes it via the new `core_mcpserver_detect` tool (muster ≥ 5.3.0, giantswarm/muster#1087) and the detected transport — streamable-http or SSE — is pre-selected with a "Detected" badge on the matching card. Manually picking a transport still wins until the URL changes again, and detection degrades silently to manual selection when the probe is inconclusive, the user has no muster session yet, or the installation runs an older muster without the tool.
- 28aada8: Unify workflow execution with the tool explorer. Running a workflow is just executing its `workflow_<name>` aggregated tool, so the bespoke run dialog is removed in favour of a single execution surface.

  - The workflow detail "Run" button and the workflow list "Run workflow…" action now navigate to the tool explorer with the `workflow_<name>` tool preselected (`?installation=<inst>&tool=workflow_<name>`) and its argument form ready.
  - The tool explorer honours `?tool=` (preselects the tool) and `?server=` (seeds the browse search) deep links.
  - Removed the `RunWorkflowDialog` component, the `?run=1` auto-open, the `runWorkflow` client method, and the backend `POST /workflows/:name/run` route.

- 59f12a0: A connector, a tool and a workflow name their installation in the path:
  `/customize/connectors/<installation>/<server>[/<tab>]`,
  `…/<installation>/<server>/tools/<tool>` and
  `/customize/workflows/<installation>/<name>[/<tab>]`, instead of
  `?installation=`. A connector is edited at
  `/customize/connectors/<installation>/<server>/edit[/auth|/verify]` rather
  than through `new?edit=<name>`. Each page reads its resource on that
  installation whatever the section's scope, and says so when it cannot read it
  there instead of falling back to a same-named workflow elsewhere. An unknown
  address under the Connectors or Workflows tab lands on its list.

  The Connectors and Workflows tabs attach to the app's Customize page
  (`page:app/agent-shell-customize`) instead of `page:agent-platform`; the
  `page:muster/mcp-servers-redirect` page is gone, its old addresses redirecting
  through the app. New exported routes: `editMcpServer`, `editMcpServerAuth`,
  `editMcpServerVerify`; new export `withQuery`.

- 23d3558: Usage → Connectors links each connector in its table to that connector's
  Usage tab on the installation shown (`…/<installation>/<connector>/usage`),
  over the same window: the link carries `?window=` (7 or 90 days; 30 is the
  default and names none), the tab covers it, and its links keep it: **Open in
  Usage** back, each tool's Usage tab (which covers it too) and that tab's way
  back to the connector. Details stays on 30 days, which its label names. An
  instance of a family links to the family's Usage tab, which lists each
  instance's calls, since instances have no page of their own. A row no
  connector page shows, such as a server since removed, stays plain text. The
  table shows once the installation's connectors are read, so its names are
  links from the start.
- 28aada8: Add ad-hoc workflow CRUD parity to the muster Workflow manager, mirroring the MCP-server manager. Provenance is the only restriction: GitOps-managed workflows are read-only, manually-added (ad-hoc) workflows get full live CRUD.

  - New `WorkflowMutationActions`: GitOps-managed workflows show "Edit/Remove via GitOps" (a manifest-to-commit dialog using the generalized `toManifestYaml`); ad-hoc workflows get live Create/Edit/Delete via `core_workflow_create`/`_update`/`_delete` behind a confirm dialog and a JSON definition editor validated with `core_workflow_validate`.
  - "Create workflow" affordance on the workflows list, plus a provenance badge ("GitOps" vs "Manually added") on each list row and the detail header; the mutation actions are wired into the detail header.
  - Generalized `lib/gitops.ts` with `toWorkflowDefinition` (flattens a Workflow CR spec into the `core_workflow_*` argument shape), alongside the existing MCPServer helper.

- b8afa37: Muster workflow detail page cleanups and a shared chart component.

  - Add a theme-aware `StackedBarChart` component (built on recharts) to
    `@giantswarm/backstage-plugin-ui-react`. Colors, axis text, grid, and tooltip
    all read from the active MUI theme so it looks native in light and dark mode;
    recharts stays an implementation detail behind a small `series`-based API.
  - The workflow detail "Runs per day" chart now uses the shared `StackedBarChart`
    instead of a hand-rolled CSS bar. It spans at least 30 days, fills days with no
    runs with empty entries, and always ends on today so the right edge reads as
    "now".
  - Remove the breadcrumb from the workflow detail header.
  - Render the workflow description's Markdown paragraphs with the standard MUI
    `body1` typography (line height, spacing) so they match other paragraphs.
  - Remove the "Remove via GitOps" button from the GitOps-managed workflow
    actions, and rename "Edit via GitOps" to a plain "Show manifest" outline
    button (same manifest dialog).
  - Remove the redundant collapsible "Definition (YAML)" section from the workflow
    detail page.
  - Align the GitOps "Show manifest" dialog with the "Create workflow" modal: an X
    icon in the title bar (no footer Close button), a primary "Copy manifest"
    button, and the manifest rendered read-only in the shared YAML editor with
    syntax highlighting.
  - `YamlEditorFormField` (ui-react) now accepts a `readOnly` prop, forwarded to
    the underlying `YamlEditor`.
  - The workflow detail "Executions" panels now size to their content and cap at
    the viewport (scrolling internally) instead of always reserving a tall fixed
    height when empty.

- 2b79a0c: The shell's workflow page: the flow diagram can go full screen over the content area, the nav rail staying beside it ("Full screen"; Escape or "Exit full screen" brings it back), and a step's details open inside its box in the diagram instead of under it — one step at a time, the layout moving what follows down to make room. The workflow's description moves from the header into the content, so the header's actions sit beside the title as on the other detail pages. The page shows an action another plugin attaches to `sub-page:muster/workflows` (input `editAction`, reading the workflow with the new `useWorkflowPageTarget`), and the Customize Workflows panel takes a `createAssist` for the way to create one.
- 2b79a0c: Workflow page: "How it runs" is now a flow canvas drawn only from the
  workflow's definition — the steps in order on one spine, forEach and parallel
  steps as groups, a condition as an "Only if …" gate on the edge into the step
  it may skip (never a yes/no branch), and the cleanup steps as their own dashed
  lane; no trigger, schedule or version, since muster has none. The canvas sits
  in a capped, scrollable viewport so a long workflow does not bury the page.
  With a muster session, the latest run colours each step (succeeded, failed,
  skipped, not run, with a loop's iteration count and durations where muster
  recorded them) and each step says whether its tool only reads or changes
  things. Clicking a step opens its details: the plain description first, then
  that step's own "Show technical information" fold-out (exact tool, templated
  arguments, condition spec). The duplicate step list and the page-wide
  technical toggle are gone — each run's execution record and the raw
  definition have their own fold-outs. Recent runs lists the latest five; the
  succeeded/failed totals (muster's own per-status counts) moved into the
  details panel.
- 799d6c3: The workflow page draws the muster Workflow CRD's newer step fields. A loop
  inside a loop is drawn inside it on the flow and indented in the phone step
  list, its steps numbered on (1.2.1). Each loop says how many items run at once
  ("up to 8 at once", "one at a time", or "in order" when the definition sets no
  parallelism). A paginated tool step carries a "Paginated, up to 100 pages"
  marker and a step that reshapes its result with jq a "jq transform" marker; the
  step's details name the page bound (`maxPages`) and show the jq program as
  written. The page header and the Workflows list count the tool steps at every
  depth and name the loops ("8 tool steps in 2 nested loops"), and a plain list
  of steps still reads "3 steps". Fields the page does not know are left out
  rather than breaking it.
- 2b79a0c: A workflow's page is reorganised around what it does, and its flow never cuts a step title.

  - **Sections:** the page now reads "What it needs", "How it runs", "Statistics", then one "Advanced" disclosure holding "Where agents use it" and "Technical details" (the CR's namespace and labels, the referenced tools and the raw definition, without a second fold-out).
  - **Runs:** the "Recent runs" list and the "Runs" line beside the page are gone. Statistics shows the last run instead (outcome, when, to the minute, how long, and a failed run's error), and its completed/failed breakdown counts every recorded run (muster's own totals) instead of the stats sample. A single run's step-by-step result stays on the flow, which the last run colours.
  - **Flow canvas titles:** a step title wraps onto a second line in a taller box instead of being cut with an ellipsis. Nodes widen (up to a cap, all to one width) until every title fits in two lines. Only a title longer than that is clamped, and it shows in full on hover. The last-run badge moved to the node's second line, next to the tool, so it no longer narrows the title. The same applies to the names of loop and parallel groups.
  - **Wide flows:** a flow wider than its box (a wide parallel group, the cleanup lane) opens scrolled to its main column instead of its left edge, and a parallel group's name is centred over that column, so it is in view.

- d95e52d: A workflow's page has the tabs Overview (the index) and Run (`…/run`). Run is the tool page's argument form and result view for the workflow's `workflow_<name>` tool, so a workflow is run on its own page instead of on muster's tool page in the MCP Servers tab. Above the form, Run names the servers the workflow's steps call that wait for the user's sign-in, each with its Sign in. The execution history and step results the page used to show at its foot are removed. The page gets breadcrumbs back to the Workflows list, and a workflow the installation doesn't have shows an empty state that links back to the list.

  A manually added workflow's Edit and Delete move to the page header, and the provenance badges next to the workflow's name are gone. In the Workflows table, Available and Source read as plain text with an icon (the GitOps cog for GitOps) instead of pills. Workflow durations are shown in whole milliseconds.

- bbb9406: MCP servers that wait for the person's sign-in move from muster's corner card
  into the Agent Platform shell's Notification inbox: one row for the person's
  home installation, "2 MCP servers need your sign-in", naming the servers, with
  a Sign in that opens muster's sign-in dialog in place. The row counts in the
  bell's badge, the tab title, "Mark all read", the toasts and the desktop
  notifications. A server that starts to wait makes it unread again; a sign-in,
  in the dialog or on a muster page, takes it away. Marking the row read takes
  the place of the card's "Not now".

  `muster` no longer mounts its corner card (`McpAuthNotice`) on every page, and
  exports `McpSignInProvider` and `useMcpSignIn`: the home installation's MCP
  servers waiting for the person's sign-in and those connected, read every five
  minutes and when the tab regains focus under muster's query client, and
  `openSignIn` for its sign-in dialog, which loads on first use and opens only
  for the home installation. `useMcpServersAwaitingSignIn` also tells whether
  muster answered (`isAvailable`).

  `agent-platform`'s notification record adds `replaceSeenMark`, which writes a
  seen mark only while the stored one is still the mark it replaces, and its
  `SeenMarkReason` and `analytics-react`'s `AgentPlatform.notificationOpened`
  take the `mcpSignIn` kind: the MCP sign-in row's Sign in.

- 2b79a0c: MCP servers are called **Connectors** everywhere people see them: the Agent
  Platform tab, page titles, breadcrumbs, table headers, empty states, dialogs
  and wizard copy. The tab moved from `/agent-platform/mcp-servers` to
  `/agent-platform/connectors`; the old address redirects with its path and
  query intact (enable `page:muster/mcp-servers-redirect` alongside
  `page:agent-platform`). Code identifiers, the `MCPServer` CRD and the
  `Muster.mcpServerAdded` telemetry event keep their names, and "MCP server"
  remains where it names the remote server itself.
- 2b79a0c: Export `AGENT_SHELL_FLAG` from the common package, so plugins that render inside the agent-platform shell read the flag without depending on the agent-platform plugin. The agent-platform plugin keeps re-exporting it. muster reads it through its own `useAgentShell` hook.
- ba553f1: Read the muster, ai-chat, agent-platform and flux frontend config from the
  signed-in config (`GET /api/gs/config`) instead of the public `index.html`.

  `muster.serverName` and `muster.installations[].name/authProvider` (the
  fleet's codenames), `aiChat.welcome.*`, `aiChat.mcp[].name/authProvider`,
  `aiChat.contextWindow`, `agentPlatform.skills.repositories` and
  `flux.gitRepositoryPatterns` keep the default (backend) visibility and reach
  the browser after sign-in through `@giantswarm/backstage-plugin-gs-react`.
  The plans, platform-capabilities, repositories and roadmap backends drop the
  `@visibility frontend` markers no frontend read, so the public config no
  longer names their muster installation, repositories, board or teams. No
  `@visibility frontend` is left in these plugins.

- b44a375: Tabs with a count no longer change width when the count arrives, so the tabs
  to their right stop moving under the pointer. `RouteTabs` (and `ShellPage`'s
  `tabs`) take `count: 'loading'`, drawn as a skeleton as wide as a two-digit
  count, and a loaded count always reserves two digits' width. Customize's tabs
  and Connectors sub-tabs, a connector's Tools tab and a skill's Used by tab pass
  it while their data loads, their loading frames included. `RouteTabCount` is
  exported; the Customize count types (`CustomizeCounts`,
  `MusterCustomizeCounts`) now say `'loading'` instead of leaving a loading count
  out. `MusterInstance` gains `isLoadingWorkflows`, so Customize's Workflows tab
  waits for the workflows' own read instead of showing 0 until it lands.
- f94930d: Report more of what people do in the Agent Platform as usage data, with no
  names or other identifiers in any of these events:

  - A tool run from its page that returned a result is reported as
    `Muster.toolRan`, next to `Muster.workflowRan` for a workflow's. A
    connector tool run there reports the connector's event below instead.
  - Deleting an agent is reported as `AgentPlatform.agentDeleted` (`mode`:
    `apply` or `commit`).
  - Creating, editing and deleting a model is reported as
    `AgentPlatform.modelCreated`, `AgentPlatform.modelUpdated` and
    `AgentPlatform.modelDeleted`.
  - Editing a connector, in the wizard opened from its Edit or as JSON on its
    page, is reported as `Muster.mcpServerUpdated`; Activate, Deactivate and
    Reconnect as `Muster.mcpServerConnectionChanged` (`change`: `activated`,
    `deactivated`, `reconnected`), and Delete as `Muster.mcpServerDeleted`.

  - In a session, sending a message (a first message included), answering the
    agent's question, stopping a turn, renaming and deleting the session are
    reported as `AgentPlatform.messageSent`, `AgentPlatform.questionAnswered`,
    `AgentPlatform.turnStopped`, `AgentPlatform.sessionRenamed` and
    `AgentPlatform.sessionDeleted`, with nothing of the text, the answer or how
    it was given.

  `DefinitionEditorDialog` takes `saveTracking`, the event its save reports or
  the reason it reports none, in place of `saveUntrackedReason`.

- 2b79a0c: Add the pieces of the agent-platform shell's Customize screen: `CustomizeMusterProvider` and `useMusterCustomizeCounts`, `CustomizeConnectorsPanel` (the active muster's servers as flat rows with how one signs in, their tool count, state and a sign-in where muster asks for one) and `CustomizeWorkflowsPanel` (each workflow's step count and runs, with the muster sign-in when there is no session to read the runs with).
- d9673e8: A workflow's page offers "Edit in Git…" in its ⋮ menu when Flux reconciles
  it, as a GitOps-managed connector's page does. The same dialog names the
  HelmRelease or Kustomization that manages the workflow, links to its source
  where one is found, and lists the steps to change or remove it through a pull
  request. A workflow that Flux does not reconcile, such as one from a chart
  installed by hand, has no "Edit in Git…".
- b032f65: A workflow's page is one column of three tabs, each its own address. Overview
  says what the workflow is for under a "What it's for" heading, when it was
  created, what it needs and how it runs. Usage holds its run statistics. Details
  lists where it comes from, its tool name, the connectors it uses and the
  workflows that call it, then a Technical details fold-out listing the CR's
  namespace, labels and referenced tools a row each. The ⋮ menu's "View manifest" shows the
  Workflow CR as YAML with a copy button, for every workflow, beside "Edit in
  Git…" for one Flux reconciles. The facts column and the "Advanced" disclosure
  are gone, and so is muster-backend's unused `GET /workflows/:name` route.

  `ui-react` gains `PageSection`, the heading-and-content section of a detail
  page tab that the agent, skill and workflow pages now share, and a `compact`
  option on `SectionHeader`.

  Inside the agent-platform shell, `FactList` now sets its labels and values in
  the shell's body size (14px) by default; classic pages and stacked lists keep
  12px, and a new `size` prop overrides the default. `Mono` and the new
  `useFactTextVariant` hook follow the size of the list a value sits in, so the
  connector page's Details tab no longer lifts its text size itself.

- 0388b0e: A workflow's page has a Run it tab (`/agent-platform/workflows/<name>/run`),
  after Overview, that runs the workflow as a tool's page runs a tool: the input
  form from the workflow's input schema, the Run button with its note ("Runs as
  you.", "Nothing is changed."), and the result. Connectors its steps call that
  wait for the person's sign-in are named above the form. Without a muster
  session, on an installation without per-user muster sessions, or where muster
  lists no `workflow_<name>` tool for the person, the tab says why instead of
  showing a form. A run refreshes that workflow's run records. While a run is in
  flight, leaving the tab (another tab, a link, a reload) asks first and says
  that muster finishes the run anyway. The page's "Only reads" badge is now read
  off the tool catalogue the page already loads.

  The tool page and the Run it tab share `ToolRunPanel` and `useToolRun`, which
  reports the new `Muster.workflowRan` event for any run of a workflow's tool.
  `ShellPage` and `RouteTabs` take `onTabNavigate` / `onNavigate`, to hold a tab
  switch until the page agrees.

### Patch Changes

- 2b79a0c: The agent area says "Environment" where it said "Installation": the Profile
  page's Environments section, the Environment column of the agents, sessions
  and models tables and of the GPU and model-cache tables, the Environment field
  of the add-model, model-hosting and GPU dialogs, the empty and error states of
  Sessions, Agents, Models, Usage, connectors and tools, the connector Connect
  step, the create- and edit-agent wizard (the Environment field and its notes,
  the model, Tools-step preset and copy-from-agent messages, the review
  summary), the agent page's sessions and not-found messages, the home and
  new-session composer. Config keys, URL parameters and code names are
  unchanged, and the classic portal keeps its wording.
- 6c096fb: Add the agent detail page. Clicking an agent in the list now opens
  `/agent-platform/agents/<installation>/<namespace>/<name>` — all three segments,
  because an `Agent` name is only unique within a namespace on one installation.

  **Read-only.** Editing an agent means changing the values its HelmRelease renders
  from, and deleting one must remove only that release and never the `OCIRepository` a
  namespace's agents share — so neither is a menu item yet, and neither is "Launch
  session".

  Two columns from `lg` up, one below: the **status card takes a third of the width,
  beside the configuration**, and everything under that row spans the full width.
  Status is the one section that does not want the whole page — a rejected spec's
  admission-webhook message is several hundred words of prose, and across a full-width
  card it runs to line lengths nobody can follow. The sections below it do use the
  width: three skill cards per row, four columns in the sessions table.

  The page has seven sections:

  - **Header** — avatar, display name, derived readiness, technical name,
    installation/namespace, creation age, description. A kebab in the shared plugin
    header opens a **manifest dialog** with the Agent CR as read-only YAML, minus
    `metadata.managedFields` (server-side-apply bookkeeping, and the bulk of a
    reconciled Agent) and the `last-applied-configuration` annotation. That dialog is
    the escape hatch for what the page does not surface — `deployment`, `sandbox`,
    `a2aConfig`, labels.
  - **GitOps** — the shared `GitOpsCard`, but only when the agent's desired state
    really is in Git.
  - **Status** — readiness, the controller's explanation, an `UnsupportedFeatures`
    warning when present, a note naming both generations when the status is stale, and
    every condition verbatim. This is what makes a broken agent debuggable without
    `kubectl`, so it leads the page rather than following the configuration.
  - **Configuration** — type, model, installation, namespace, created, the owning
    HelmRelease (linked to its deployment page, where the release's Flux status already
    lives), and the MCP-server and agent tool references. A Muster gateway reference
    links to muster's Tool Explorer with the installation preselected.
  - **System prompt** — copyable. An unset value says so explicitly: the agent still
    has a prompt, just not one configured here.
  - **Skills** — the same card grid the create flow's picker uses, so an agent's
    skills look like the things that were picked, plus the `ref` each is pinned to
    (the picker has no equivalent: it always reads a repo's default branch). Via a new
    read-only `StaticCard` sharing the picker's card shell — deliberately not a
    `SelectableCard` with the indicator hidden, since a `role="checkbox"` button that
    does nothing is announced as operable and invites a click with no effect.
  - **Recent sessions** — the newest few, over a single-installation query sharing the
    Sessions tab's cache key.

  Decisions worth knowing:

  - **No stats strip.** The prototype's sessions all-time / sessions 30d / success rate
    have no data behind them: kagent keeps no per-agent counters and scopes its session
    list to the caller, so each would be a number invented from one person's history —
    wrong by orders of magnitude on a shared agent. Creation age moved into the header
    instead. The sessions section says whose sessions they are, and switches wording on
    an installation whose kagent is not user-scoped rather than claiming ownership it
    cannot.
  - **The agent is fetched directly**, not read out of the list's provider, so a deep
    link works without the list having loaded. It polls on the same two tiers as the
    list (`isAgentConverging` is now shared): 5 s while converging, 60 s once settled or
    durably broken.
  - **The model is read by name in the agent's own namespace**, not through the
    cluster-wide `ModelConfigsProvider` list, which is admin-only — reusing it would
    deny a non-admin the model name on a page they can otherwise read in full. A failed
    read falls back to the bare reference, never to "no model".
  - **A missing agent is a not-found state, not an error**, and the copy covers the
    case where kagent simply isn't installed on that installation.
  - **Rows link with a real anchor** on the agent name as well as a whole-row click, so
    cmd- and middle-click open a new tab and keyboard users have something focusable.
    Not `rowConfig.getHref`: `BUIProvider` is not mounted in this app, so react-aria's
    `RouterProvider` is inactive and a bui `href` would trigger a full page reload. The
    `stopRowPress` guard that keeps both affordances from firing on one click is now
    shared between the agents and sessions tables.

  **GitOps provenance is de-duplicated.** `readProvenance` / `isGitOpsManaged` /
  `provenanceReleaseId` (previously in `muster`) and `isManagedByFlux` with the
  Kustomization label readers (previously in `flux-react`) now live in one module in
  `kubernetes-react`, alongside new `getHelmReleaseName`/`getHelmReleaseNamespace`.
  `flux-react` and `muster` re-export from it, so their public APIs are unchanged.

  The distinction mattered here: `isManagedByFlux` is **false** for a kagent `Agent`,
  which is rendered by a Helm chart and so carries `helm.toolkit.fluxcd.io/*` rather
  than Kustomization labels. `GitOpsCard` therefore gained a hop — with no
  Kustomization label of its own it resolves the owning `HelmRelease` and follows
  _its_ labels to the Kustomization and GitRepository — and now takes any `KubeObject`
  as `resource` instead of an `App`/`HelmRelease` as `deployment`.

  It also stops equating "reconciled by Flux" with "GitOps-managed": where that chain
  ends without a Kustomization it now renders **nothing**. An agent created through
  this plugin is exactly that case, since the create flow applies its `HelmRelease` and
  `OCIRepository` through the scaffolder — Flux reconciles the agent, but no file in
  Git describes it, and saying otherwise sends the reader looking for something that
  does not exist. The "Deployed by" row remains, and is the whole truth for such an
  agent. The gs cluster and deployment pages gate on `isManagedByFlux` and so always
  have a Kustomization already; their behaviour is unchanged.

  **New in `ui-react`: `SimpleAccordion`** — one collapsible section, carrying the
  bottom padding bui's accordion trigger lacks, so an expanded header does not sit
  flush against its panel. Four places had composed bui's accordion primitives
  directly and fixed that locally in three different ways — one of them with a
  selector scoped to the trigger element rather than the button that actually carries
  `aria-expanded`, so it matched nothing. `useSimpleAccordionStyles` exposes the rule
  on its own, for cases needing controlled or exclusive expansion.

  gs's own `SimpleAccordion` is removed in favour of this one — its two call sites
  (the cluster access card and the workload details pane) import from `ui-react`
  directly and gain the spacing they never had. `plans`' `MergedTab`,
  agent-platform's `TimelineEntry` and muster's `DisclosureAccordion` still carry
  their own copies of the fix and could adopt it.

  **New in `ui-react`: `ConditionsList`** — a bui renderer for a resource's status
  conditions. One collapsible entry per condition with its type, satisfaction, relative
  transition time, reason and message; newest transition first, and the first failing
  condition expanded, because that is the one the reader came for. Takes an `isFailing`
  override for abnormal-true conditions (`Stalled`, `UnsupportedFeatures`), where
  `status: True` is the bad news.

- 2b79a0c: One word per concept in the agent platform: connectors are called connectors everywhere (named as Customize lists them, also in session tool calls and Usage), the read-only preset is "Read-only tools" and muster's own tools are "Platform tools", gateway costs are "Spend" and token estimates "Est. cost", served models use the Running models states everywhere, the hosting columns no longer reuse "Used by", the catalogue skill shows its "Latest commit", starting a session from an agent is "Start a session", stopping a turn is "Stop the turn", and error titles read "Could not …".
- 57df63e: The session page's actions menu has **Export session**: it saves the session
  and all of its tasks, as kagent stores them, as one JSON file, also mid-turn
  and while the session waits on the person. A session the portal
  cannot read whole (up to 1,000 turns, fewer with large messages) saves no file
  and points to agent-manager's `get_session`. The format is described in
  `docs/agent-platform-session-export.md`; a saved export is counted as
  `AgentPlatform.sessionExported`.

  The backend's session tasks route keeps the `nextPageToken` it did not follow
  when its read was cut short. `ui-react` exports `saveFile`, which the manifest
  Download and muster's tool-result download now share; it keeps the file's URL
  until the browser has taken it.

- 9312feb: The agent page's Technical details drop the Resource card's "Copy system
  prompt" button, show the agent's namespace and name as two facts, Namespace
  and Name, and link each skill version to its skill's page. The model and
  connector pages' Technical details split their resources the same way; a
  reference in the agent's own namespace (its ModelConfig, a sub-agent, the
  HelmRelease behind it) is named alone. The Configuration card's "See tools" is
  bui's link.

  Every git SHA the portal shows is 7 characters, a digest 12, with the full
  value as its title and a copy button on touch screens: skill pins and
  versions, agent revisions, workspace heads, Flux revisions and digests,
  branch-build versions, the release footer, scaffold and revert commits, and
  the backend's messages.

  New in `gs-common`: `shortSha`, re-exported by `ui-react`. New in `ui-react`:
  `CommitSha` and `namespacedNameFacts`.

- 1e1e0e3: Track creating a cluster (`AgentPlatform.clusterCreated`) and adding a GPU node
  pool (`AgentPlatform.nodePoolCreated`) through cluster-manager, each with its
  `mode` (`apply` or `commit`). The writes that ran outside react-query (the
  cluster-manager and model-manager dialogs, muster's server and workflow
  dialogs) now go through `useTrackedMutation`, so every one of them is tracked
  or opts out explicitly.
- be7bd04: A dropped connection is no longer reported as marge refusing the run. When the
  browser's connection closes before marge answers (a "Failed to fetch", a
  roaming Wi-Fi), or the portal's edge answers in its place with a 502, 503 or
  504, the Approve and merge and Sweep dialogs say the connection dropped:

  - On a preview, that it was only a preview and nothing changed, with
    **Preview again**, which runs only the calls of the teams whose answer was
    lost and keeps every other team's preview in view.
  - On an apply, that the outcome is unknown: marge may already have acted on
    some of the PRs, or all of them, and may still be at it. It no longer says
    nothing was approved or merged. The queue is read again, and the alert links
    each PR the apply named, whose evidence comment on GitHub records what marge
    did.

  marge's own refusal keeps its wording. The same tells a lost classification
  (**Classify now**) and a lost read of the queue apart from a refusal, and the
  Sweep dialog no longer reports **Applied** when no team answered.

  The muster client keeps the HTTP status on the error of a failed request.

- 9e00143: Muster's server and workflow dialogs (confirm, edit as JSON/YAML, manifest) use
  bui instead of MUI. Confirm buttons are red only for deletes: saving an edit,
  activating, deactivating or reconnecting a server, stopping a served model and
  cancelling a download no longer get the destructive treatment.

  `ConfirmDialog` can no longer be closed with its header button while busy, and
  keeps line breaks in error messages. ui-react exports `useOnDialogOpen`, which
  resets a controlled dialog's state when it opens, and `ALERT_MESSAGE_STYLE`.

- 2b79a0c: Customize filters become one multi-select dropdown per field (T64).

  `CatalogFilterBar` draws each facet as a bui `Select` in multiple-selection
  mode instead of a row of chips: the trigger names the field ("Source All",
  "Source acme/skills", "Source 2 acme/skills and gs/skills"), the list shows each
  value with what it keeps under the search and the other picks ("acme/skills
  31"), and a facet with more than `SEARCH_MIN` values gets a search inside its
  list. Picks within one dropdown widen the list (any of them); dropdowns narrow
  each other. Every facet the catalog has a value on is drawn — a field with a
  single value is a dropdown of one option, so the Skills tab's Source filter no
  longer disappears on a one-repository installation. The row wraps at phone
  width, two dropdowns to a row.

  API changes in `@giantswarm/backstage-plugin-ui-react`:

  - `CatalogFilterSelection` holds a list of picked values per facet;
    `useCatalogFilters().select(facetId, values)` takes that list (empty picks
    the whole facet again).
  - `CatalogFilterDimension` has `selected: string[]` in place of `value` and
    `total`.
  - `CatalogFilterBar` takes an optional `onClear`, offering "Clear filters"
    while anything is picked.
  - `ALL_FILTER_VALUES`, `FILTER_CHIPS_MAX` and `FILTER_CHIPS_CLASS_NAME` are
    removed.

  The agent wizard's skill step (via `SkillsFilterBar`) and its tool step's
  "What it does" filter use the same dropdowns; on the tool step, picking both
  kinds is the same as picking none.

- 2b79a0c: Condense UI copy: the agent platform's descriptions, helper lines, empty states, hints, alerts and dialogs say only what the surrounding UI does not already make clear, and every sentence is complete and grammatical (no half sentences or telegram-style cuts, e.g. the skill form's hand-off banner).
- 2b79a0c: A connector's Prompts and Resources tabs drop the "N prompt(s)" and "N
  resource(s)" headline, which repeated the tab's count, and list each entry as
  a row with its name over its description. A partial list says how many of how
  many entries muster returned.
- 99cede2: Every connector, tool and workflow link names its installation. The search
  palette lists a connector once per installation it is registered on, with the
  installation beside it, and opens the connector there. A connector's Edit opens
  the wizard with `&installation=<inst>`, and the wizard edits the server on that
  installation before falling back to the active one.
- 2b79a0c: Connector wizard, sign-in step: the advanced settings for "Each person signs in
  with their own account" are relabeled in plain language. The client credentials
  form a group "Client credentials — stored in a Kubernetes Secret" that asks for
  the Secret's name and the names of the keys inside it (never the values), with
  the real defaults (`client-id`, `client-secret`, the connector's own namespace)
  as hints; issuer, scopes and endpoints get one-line explanations, and the grant
  lifetime options read in plain words with muster's term in parentheses.
- f088683: A connector's old Settings tab address (`…/connectors/<server>/settings`) no
  longer redirects to the edit wizard or a family's instances; like any unknown
  tab, it opens the connector's Tools tab.
- 884bd42: A connector's Tools tab keeps its search, from the Connectors search or typed
  on the tab, when the person visits another tab of the page and comes back.
- 2b79a0c: The Customize Connectors list keeps each connector's state to a few words
  ("Sign-in expired", "Signing in…", "Could not sign in", "Status unavailable"),
  so it stays visible in a narrow Status column. The explanation it used to print
  beside the state (why an SSO connector has nothing to sign in to, the wait for
  the sign-in page, the client registration note, muster's answer to a refused
  sign-in) moves into a tooltip on the state; the Sign in button stays, at the
  end of the row on a phone. A deactivated connector's Sign in is disabled and
  says why.
- 2b79a0c: An SSO connector muster could not connect for the person reads "Could not
  sign in" in the Customize Connectors list, not "Sign in needed", with the
  explanation in its hint. The connector's page says it in full.
- 2b79a0c: A blocked Continue or submit in the create flows (new agent, add connector, add skill and edit skill, add model) now marks the fields that are wrong: a danger edge on the field, the reason right under it (tied to it with `aria-invalid` and `aria-describedby`), and the keyboard focus on the first one. The generic "Please fix the following" box is gone, except for the few problems no field on the step can show. Add skill no longer greys out its button while fields are missing; pressing it shows which ones.

  `ui-react` adds the shared mechanism: `useFieldValidation`, `fieldErrorProps` for bui text fields, `useSelectFieldError` for bui `Select`, `FieldErrorText` for hand-rolled fields, and an optional `describedBy` on `SelectableCardGrid`.

- 3043a1d: Form fields in the Agent Platform are now checked when you leave them, not
  only when you press Continue or Submit: a field you typed in shows its
  problem as you move on, an empty field you only tabbed through stays quiet
  until you submit, and a shown error clears the moment you fix it. Submit still
  shows every remaining problem and moves the focus to the first.

  `useFieldValidation` tracks each field: `errorFor(field, problem)` takes the
  field's name; `blurProps(field, problem, value?)`, `textFieldProps(field,
problem)` and `fieldProps(field, problem)` check a field when it is left (a
  blur caused by pressing a button waits until the press is over); errors
  announce through a polite live region; and `shown` is renamed `submitted`.
  `TextAreaField` passes `onFocus` and `onBlur` through and announces its error
  live only past its character limit.

- 0a05757: More Agent Platform forms check a field when you leave it and keep their
  buttons pressable: a tool's or workflow's run form, Edit as JSON, Create
  cluster, Delete cluster, Rename session, the agent wizard's Tools step and
  "Update the agents using …". Pressed with a problem, the button now says what
  is wrong on the field and moves the focus there instead of staying disabled
  or showing a banner, and an error clears as soon as it is fixed. Error
  messages for empty fields now say what to enter, for example "Enter a name
  for the agent." or "Enter a value for message.".

  `ui-react` exports `useGroupFieldError`, for a group of controls validated
  as one field.

- 0b2fa7f: Keep the MCP registration wizard's verify panel polling while the tab is hidden. The server connects during exactly the window where the user wanders off to another window or tab, and react-query skips interval refetches for unfocused tabs by default — the panel silently froze on "Waiting for the server to appear…" until it was refocused. The backend's `/servers` route now also asks muster for failed servers (`showAll`) with their raw errors (`verbose`); muster hides `Failed` servers from `core_mcpserver_list` by default, which made a failing server vanish from the runtime view instead of showing up with its error in the verify panel and the server detail.
- 89ad470: A server waiting for the person's MCP sign-in when the portal loads is in the
  notification inbox's summary toast again. The inbox's first read now waits the
  few seconds muster's sign-in status takes to settle, once muster has answered,
  instead of taking the waiting server in later as quietly unread. The status
  says when it has settled (`isSettled`).
- 2b79a0c: Long lists of connector capabilities and environments stay readable. The new
  connector's Test step previews six tools and reveals more six at a time
  instead of all at once, and says how many tools the connector has when it
  lists more than were read. A connector's Resources and Prompts tabs show 20 at
  a time, with a search once there are more than 20, and still mark a list that
  is only muster's first page. Notes and alerts that name environments (the
  unreachable-environments warning, the not-reachable note, GPU capacity and GPU
  node pool notices) name the first five and count the rest, group environments
  that failed the same way, and keep the full list behind a disclosure. The
  Profile page shows the first 20 environment badges with _Show all_. ui-react
  adds `joinNames` and `groupNames` for these sentences.
- 2b79a0c: Lists in Customize and the new-agent flow now fit both a handful of entries and hundreds. The Customize search shows only on tabs with more than eight entries, or when a search is already set (a `?q=` link can now open a tab with that search). The Models and Connectors tabs show 20 rows at a time, and the model picker shows 12 cards at a time and always keeps the selected model visible. In the new-agent Tools step, a catalogue of 20 entries or fewer opens straight away, with no search and no _Browse the catalogue_ toggle.
- 2b79a0c: The Usage page's remaining tables stay plain at a few entries and bounded at
  hundreds:

  - The conversations by-agent table, Cost's by-model table and the MCP usage
    connectors table render their first 15 rows (by the active sort), with
    _Show all N_.
  - The top tools and top connectors tables say what their top-10 cap left out
    ("and 14 more, 230 calls between them.") instead of dropping it silently.
    The `session-usage` route now returns `otherTools` and `otherMcpServers`
    (`{ count, calls }`) beside the capped lists.

- 4114dde: A page whose first read failed no longer says "No items" while the retry
  waits for the tab to come back to the foreground: it shows its loading state
  until the retry answers, then the data or the error. `isAwaitingData` in
  `ui-react` is the shared check (no data yet, fetching or waiting to retry),
  used in place of react-query's `isLoading`, which is false while a retry is
  paused.
- b628d71: The background read of which MCP servers need the person's sign-in no longer opens the "Login Required" dialog: it uses the current portal session only and stays quiet once that session has expired, and the servers' display names are read once.
- ad90805: The MCP server sign-in notice stands clear of what is docked at the bottom of
  the view: a wizard's footer (Continue, Create), the session page's composer and
  the shell's mobile bottom bar. It no longer covers those buttons or takes their
  clicks. `WizardFrame` publishes its footer's height on the document root while
  it is mounted (`WIZARD_FOOTER_HEIGHT_VAR`).
- f806f76: Show whole numbers in the tooltip of the "Tool calls by outcome" chart, as the
  tables below it already do. The counts come from Prometheus `increase()`, which
  extrapolates and so returns fractions.

  Also give the chart a legend, so its three outcomes are not told apart by colour
  alone.

  Counts in this section now always group thousands with a comma (`5,271`),
  whatever the browser's locale, like the other figures on the Usage page, and
  the chart's y-axis uses the same notation.

- 578b163: Make the muster manager's auth state coherent across every surface: gate create/add affordances on a muster session and stop conflating "auth required" with "down".

  - "Add ad-hoc server" (MCP servers) and "Create workflow" (workflows) are now disabled with an explanatory tooltip when there is no authenticated muster session for the selected installation, instead of opening a dialog that fails after the user composes a definition.
  - Auth-failure (HTTP 401 / "authentication failure") errors from the ad-hoc validate/save/delete flows are mapped to a friendly "connect to muster (sign in)" prompt rather than the raw `MCP HTTP Transport Error … (HTTP 401)` transport message.
  - An `Auth Required` server with no tools now reads "requires an authenticated muster session for your user" rather than "the server may be down", matching the dashboard's treatment of `Auth Required` as a session state, not a degraded one.

  The MCP-servers-page session probe is extracted to a shared `useMusterSession` hook so the dashboard, the manager and the workflows list resolve session state (and the connect action) the same way — the dashboard's connect now signs in for the selected installation rather than the default one, and its probe is deduped with the hook's.

- 57d8d40: Every place that names an MCP server's auth mode uses the same name: the servers table, the server detail panel (a new **Mode** row above the auth type), the registration wizard's authentication and review steps, and the edit-blocked tooltip. The modes read **No authentication**, **Own account (OAuth sign-in)**, **Platform SSO (forwarded token)**, **AWS request signing (SigV4, shared identity)**, **Token exchange (cross-cluster SSO)** and **Unrecognised authentication**. The review step repeats the shared-identity warning for a SigV4 server, and the detail panel shows the settings an anonymous server still carries.
- 7b4b7ae: A server registered with Platform SSO or token exchange (a forwarded token, no
  `auth.type`) no longer shows as "No authentication configured" in its details.
  Edit only opens the registration wizard for a server whose auth block is
  exactly what its wizard answer writes, so saving can no longer drop settings of
  another answer (such as required audiences on an OAuth sign-in), and an auth
  type this portal does not know is sent to "Edit as JSON" instead of being read
  as no authentication.
- 607d514: The muster dashboard's Capability surface table gives the tool group, the row's
  kind (server, family or muster core) and the number of instances behind it a
  column each, instead of trailing the server name as markers, and renders as a
  bui table.
- 578b163: Render the muster dashboard body immediately on a cold load instead of blanking it behind a full-page spinner.

  The dashboard previously gated its whole body on `isLoading` (installations + the single-cluster MCPServer CRD read). On a cold first load that read can be queued behind the Backstage whole-fleet cluster-access warm-up, so the page showed only a spinner for several seconds. The page now:

  - gates only on the active installation being resolved, then renders the chrome (identity, endpoint, browse cards, sections) immediately from persisted/last-known data;
  - shows a thin progress bar under the header and `…` / "Loading…" placeholders for the stats, browse counts, and fleet-health matrix while the live CRD read is still in flight, instead of a misleading "0 servers" / "No MCP servers found".

  The root-cause serialization fix (foreground proxy reads jumping ahead of the fleet warm-up) ships separately in `@giantswarm/backstage-plugin-gs`.

- 2b79a0c: Connector wizard, Connect step: the server address field's problems are named
  after its label — "Server address is required", "Server address must be an
  http(s) URL…" — instead of the classic wizard's "URL is required".
- 478aa4d: A connector muster still connects with the person's portal sign-in reads
  "Connecting" on the Connectors tab instead of its server state, and the
  sign-in status is re-read every 2 seconds until the connect settles, so the
  page shows the connected server without a reload.
- 2b79a0c: The shell's Add connector wizard no longer covers the whole screen. Its three
  steps (Connect, Sign-in, Test) render in the content area through the shared
  `WizardFrame`, so the rail stays visible and usable while a connector is added
  or edited; the step strip, the centered column and the sticky
  Cancel/Back/primary footer are unchanged in substance. The steps' headings now
  come from the shared `WizardStepHeading`, and the wizard's option cards and
  textarea field are the shared ui-react primitives the create-agent flow uses
  too, so the creation flows read as one system.
- 2b79a0c: The connector wizard's Test step wraps a long tool name beside its Reads/Changes badge at phone width, instead of running under it.
- 2b79a0c: Customize → Connectors and → Workflows read on a phone. At phone width each list shows a stacked row per item instead of a table whose columns were squeezed to slivers. Connectors: the name and its state, then how one signs in and its tools, then the description and the sign-in. Workflows: the name and its access badge, then category, steps, runs and source, then the description. The connector's **Sign in** was clipped out of reach at 375px; it is now in its row, outside the row's link. Wider viewports keep the tables.
- 578b163: Fix the muster dashboard "Servers healthy" stat.

  - The stat no longer flips to amber on every remote federated-backend failure. muster federates ~26 management clusters, so at least one backend is almost always degraded; colouring on `healthy != total` made the stat near-permanently amber and useless as a signal. It now warns only when a meaningful fraction (>10%) of aggregated servers is unhealthy, via the shared `serversHealthSummary` helper.
  - The stat now renders whenever the server list has loaded, independent of the muster session. It is computed from the CRD `.status.state` reads (not the auth probe) -- the same data the fleet-health pills below already render unauthenticated -- so hiding only the summary stat when unauthenticated was inconsistent.

- 7c9e6d6: The muster dashboard no longer runs its tool-count probe against an
  installation the backend reports as not reachable from this portal; the
  request could only time out and reach Sentry as a 500. The badge already said
  "Not reachable" -- now nothing is sent, the same as on the other live-MCP
  screens.
- c8743f8: Recognize muster's new `dcr-failed` client identification method (muster#1086)
  and warn truthfully on the per-server Sign-in: the authorization server
  rejected muster's automatic client registration, rather than the
  `cimd-fallback` claim that it advertises neither CIMD nor registration.
  Older musters never send the value; portals on this version simply keep
  showing the fallback warning for them.
- f2cc1f8: The MCP server detail page says when a server is deactivated.

  A server with `spec.suspended: true` used to read like an outage: the row said
  `Disconnected`, the Configuration block listed everything but the suspension,
  the Tools block said the server "may be down or unreachable", and `Sign in` was
  on offer — signing in produced a muster session that read "connected / 58
  tools" while the Tools block stayed empty, because muster's reconciler undoes
  the connection right away. The `Activate` button in the action row was the
  only trace of the deactivation.

  - The list row and the detail header lead with a neutral **Deactivated** badge,
    ahead of the live state; a family's per-cluster pill reads `Deactivated`
    instead of `Disconnected` for a deactivated instance.
  - The Configuration block carries a **Deactivated** row that says muster keeps
    the server disconnected and points at `Activate` (for an ad-hoc server; a
    GitOps-managed one has no Activate on this page, so the row stops at the
    fact).
  - The Tools empty state reads "No tools exposed — this server is deactivated.
    Use “Activate” in the actions below.", taking precedence over the
    reachability and sign-in wording.
  - `Sign in` is disabled while the server is deactivated, with the reason as a
    tooltip — the same shape as the gated Reconnect. The gate is the portal's own
    reading of the CR, not muster's refusal. `Sign out` stays available, since a
    stale grant is exactly what such a server may still need revoked.
  - The runtime block marks the session rows (`Session`, `Tools (session)`, …) as
    the session's last connection rather than a working server while the server
    is deactivated.

- 7b63a47: MCP server and workflow editing share one definition-editor dialog: the same dismiss lock while a validate or save is in flight, error display and seeding on open, with the server's JSON editor and the workflow's YAML editor. A definition that no longer parses clears the previous success message, and only a parse error marks the editor invalid (the server's JSON editor too), not a failed call. `ConfirmDialog`, the definition-editor dialog and the session rename dialog share one busy dismiss lock (now `ui-react`'s `BusyDialog`), and the rename dialog seeds through `useOnDialogOpen`.
- 2b79a0c: Workflow, connector and tool pages read on a phone.

  - **Workflow steps:** at phone width the flow canvas becomes a step list read with the page. Before, a parallel group or the cleanup lane made the flow wider than the screen, so the lane was a sliver at its edge, and the capped scroll box trapped the swipe that should scroll the page. Each step is a card that opens its details in place under it. A forEach or parallel step lists its steps indented under it, a condition is an "Only if …" line on the step, and cleanup has its own "If a step fails" section. Long workflows show 20 steps at a time. Wider screens keep the canvas.
  - **Workflow inputs and runs:** a long input default (JSON, a URL) now wraps instead of being cut off. An opened run says when it started to the minute; that was a hover title only.
  - **Tool page:** in the shell it uses the platform's page frame (phone gutters, a wrapping title, the trail under Customize). A tool's full name breaks instead of widening the page, and the result box stops above the phone's bottom bar.
  - **Tool result "Table" view:** columns keep a least width, so a wide result scrolls sideways inside its table instead of being squeezed to slivers.
  - **Connector page:** long tool names wrap in the Tools tab. A disabled Edit now says why on a tap, not only on hover or focus.

- 4b7522d: A portal tab left open past the Dex ID token's lifetime no longer sends muster
  an expired token. The portal session now expires with the ID token's own `exp`,
  so it is refreshed before the token lapses, or the person is asked to sign in
  again when the refresh fails. The muster client never forwards an expired ID
  token, and muster's "token has expired … re-authenticate" answer reads "Your
  session expired, sign in again." with the Sign in again action instead of the
  raw text. `idTokenExpiresAt` and `isIdTokenExpired` are new in gs-react.
- 578b163: Expose freshness for the muster UI's live health reads.

  The kubernetes-read-backed health data (dashboard stat row + fleet health; MCP-servers per-MC pills) was a point-in-time snapshot fetched once on load, with no indication of staleness -- it flapped silently against the live CRD between page loads. It now:

  - auto-refreshes in the background via a light `refetchInterval` on the MCPServer/Workflow CRD reads, configured once in `MusterInstanceProvider` so both the dashboard and the MCP-servers manager benefit (without blanking the page);
  - surfaces `dataUpdatedAt` and an `isRefreshing` flag from the provider, rendered as a shared "updated Xs ago" indicator plus a manual refresh control on the dashboard fleet-health section and the MCP-servers standard-servers section.

- c4a1640: Fix the MCP Servers section landing on a blank view with no tab selected.

  Opening the Agent Platform "MCP Servers" tab a second time within a session left
  the URL on `/agent-platform/muster` with no view rendered and no second-level tab
  highlighted. `MusterInstanceProvider` writes the active installation into
  `?installation=` from an effect, and that search-only navigation resolves against
  the pathname of the render that created it — so when it ran in the same commit as
  the section's index redirect (which it does once the installations query is
  cached), it replaced `/muster/dashboard` back with `/muster`.

  The index redirect and the legacy `workflows/:name/run` redirect are now mounted
  as siblings of the views, outside `MusterProviders`, so they can no longer be
  overwritten by the installation-param write. The index redirect also keeps the
  query string, so a deep link like `/agent-platform/muster?installation=alpha` no
  longer loses the requested installation to the default on the way to the
  dashboard.

- 9a71810: Add `installationErrorLine`, the line a page prints for an installation whose
  read failed: the backend's plain words as they are, the muster sign-in prompt
  for a 401, never the MCP SDK's transport text.
- c1c65ee: MCP servers page: rename the lifecycle actions to what muster actually does
  with a remote server — Activate/Deactivate (one shown at a time, keyed on
  `spec.suspended`) and Reconnect (hidden while suspended) — and say so in the
  confirm dialogs.
- 2b79a0c: Long muster lists stay usable at hundreds of entries and stay plain at a few:

  - Customize → Workflows renders 20 workflows (sorted by name) at a time with
    _Show more_, and reads the latest run only for the workflows on screen —
    it used to send one request per workflow on open and on every search
    keystroke.
  - A connector's Tools tab renders 20 tools at a time, starting over when the
    search or the Reads/Changes filter changes; with eight tools or fewer it
    shows neither the search nor the filter.
  - A workflow's recent runs keep the newest 5 as the first page and offer
    _Show older runs_, reading 20 more at a time with muster's `offset`; before,
    nothing past the newest 5 was reachable.
  - An expanded run's step trace renders 20 steps at a time (a loop leaves one
    record per iteration); a failed step past the first page stays pinned in
    view below them.
  - The tool runner's Table view renders 50 rows at a time, and a result longer
    than 50 rows gets a filter over every cell's text.

- 2b79a0c: A workflow's and a connector's page in the agent area title the browser tab
  after it ("deploy · Workflows · Agent Platform"), instead of keeping the
  previous page's title after client-side navigation.
- f9644fb: The muster views wait for the fleet's inventory probes before concluding that no installation runs muster, so the Servers, Dashboard, Workflows and Tool explorer views no longer flash "No muster installation" on the way to their content. All four now show a `LoadingIndicator` while they load.
- 578b163: Polish a few copy and edge-state details in the muster manager.

  - Core tool-family titles render verbatim again: the `text-transform: capitalize` on the muster-core families panel was turning the curated label "MCP server definitions" into "MCP Server Definitions"; it is dropped, and an explicit "Events" label is added so the un-curated `events` family no longer renders as a bare lowercase segment.
  - The workflows list distinguishes a zero-data installation ("No workflows in this installation.") from a filtered-to-empty result ("No workflows match your filters.") instead of always implying a filter is hiding rows.
  - A stale `/workflows/<name>/run` deep link (the bespoke Run route removed when Run was unified with the tool explorer) now redirects to the workflow detail page, preserving the query string, rather than silently resolving to the full workflows list.

- 7ff288f: Complete the MCP server registration wizard with its Review & register and
  Verify steps, and make it reachable: "Register server" is now the primary
  action in the MCP Servers page header (agent-flow convention), ahead of the
  raw-JSON ad-hoc dialog.

  - Review & register: summary strip, the full generated server definition, and
    a collapsed manual fallback (MCPServer manifest + `muster create mcpserver`
    command). Registration runs muster's existing `core_mcpserver_validate`
    (dry-run) then `core_mcpserver_create` over the per-user MCP session — the
    same live write path the raw-JSON dialog and the CLI use; no second write
    path.
  - Verify: a live status panel, not a gate — the CR already exists, so nothing
    blocks and there is no timeout. `Auth Required` is treated as a normal state
    with the downstream sign-in offered inline; failures surface muster's status
    message and the CRD's retry/backoff info; after discovery the tool list
    links into the tool explorer. Leaving mid-verify is safe and the step says
    so.
  - "Edit details" loops back to step 1 with the form intact and saves as an
    update to the same CR (the technical name locks once registered) — never a
    delete-and-recreate.
  - Registered-by attribution from muster's `registeredBy` field (stamped
    server-side, muster#1021) is shown on the verify step and the server detail
    view's live runtime block.
  - The muster-backend now takes `core_auth_login`'s sign-in URL from the MCP
    `structuredContent.authUrl` field (muster#1019) instead of scanning the
    prose for a URL line; the format-coupled prose parser is retired.

- ff6278b: Add the MCP server registration wizard's shell and its first two steps under
  the Servers view (`/agent-platform/muster/servers/new` and `.../new/auth`),
  built on the agent creation flow's conventions: sub-routes sharing one form
  provider, "Step X of N" labels, deep-link guards back to step 1, and
  validation surfaced on Continue.

  - Details step: installation (the section's active instance), display name
    with auto-derived technical name, description, URL, and transport.
  - Authentication step: one guided question about the backend — no
    authentication, sign in with your own account (showing muster's public OAuth
    callback URL to allowlist, with an issuer/scopes override for servers
    without RFC 9728 metadata), or Platform SSO (with the token-exposure warning
    and the new-audience restart caveat). Invalid auth combinations are
    structurally unreachable; dependent fields disable with an explanation.

  Not user-reachable yet: the "Register server" entry point lands with the
  review & register and verify steps.

- 578b163: Fix the muster MCP-servers manager so a federated family's "shared" config/auth no longer defaults to an arbitrary peer/customer management cluster.

  A phase-1 fix reclassified the `Auth Required` MCPServer state from `warning` to `ok`, which silently flipped `StandardServerDisclosure`'s representative selection (`servers.find(s => severity === 'ok') ?? servers[0]`) from the local installation's own Connected server to the alphabetically-first server in list order — typically a customer MC. That cluster's name, URL and (non-shared) auth/token chain were then presented as the family's canonical face on another installation's screen.

  - A shared `selectRepresentative` helper now prefers the active installation's own server (`managementCluster === activeInstallation`), then a `Connected`/`Running` server, then falls back to the first server but flags it unqualified so the family is labelled neutrally rather than by that server's MC.
  - The Configuration caption reflects whether the representative is qualified; when it is not, it states the values are from one cluster and may differ per cluster instead of claiming "shared across the fleet".
  - The Authentication / token-chain block now carries a "shown for `<mc>`; differs per cluster" caveat, since the chain (forward-token vs token-exchange/OBO) legitimately varies per management cluster.

- e97558c: Add the composition + validation core of the MCP server registration wizard:
  `lib/mcpServerDefinition` turns wizard form state into the definition muster's
  `core_mcpserver_*` tools take, and `NewMcpServerFormProvider` holds the
  wizard's shared state.

  The three auth choices map one-to-one onto muster's auth spec — no
  authentication omits `auth`, "sign in with your own account" composes
  `auth.type: oauth` with an optional issuer/scopes override, and Platform SSO
  composes `auth.forwardToken: true` with optional required audiences. Validation
  mirrors the CRD's rules and exposes the auth mutual exclusions as disabled
  fields with explanations rather than submit-time errors; composed definitions
  are tested against muster's real MCPServer CRD schema and its CEL rules.

  Nothing user-visible yet: no route or UI reaches this code.

- c3a9998: Support muster's `sigv4` MCPServer auth type (muster#1082, v5.4.0) end to end:
  the registration wizard composes it, the server manager renders it, and the
  vendored MCPServer CRD fixture is refreshed so the conformance tests run against
  the schema and CEL rules that shipped with it.

  The wizard's auth question gains a fourth answer, "AWS request signing (SigV4)",
  which composes `auth.type: sigv4` plus the `auth.sigv4` block (region, and the
  optional service and assumed role). It is the odd one out among the choices —
  not SSO but a machine identity, where every request signs as muster itself and
  all users share one AWS identity — so the step says so where the choice is made,
  and the server detail view repeats it above the signing configuration.

  All four of the CRD's new rules are enforced as the user answers rather than as
  a rejected apply: the signing block is required with the type and offered with
  nothing else, the SSO fields it excludes are disabled with the reason, and the
  choice itself is withdrawn on the SSE transport. Two things the rules allow but
  that produce a broken or — worse — quietly wrong server are surfaced as
  non-blocking advisories: a signing region the endpoint URL does not mention, and
  a missing `AWS_REGION` request-metadata entry, without which an AWS-hosted
  backend answers confidently about its own default region.

  `spec.meta` comes with it. The details step takes request metadata as
  `NAME=value` lines, the composed definition and the GitOps manifest carry it,
  the ad-hoc JSON editor no longer drops it from an existing server, and the
  server detail view lists it. The review step's CLI fallback reports that
  `muster create mcpserver` cannot express either field instead of printing a
  command muster would reject.

  A 401 from a SigV4 server is a connection failure, not a sign-in prompt: nothing
  in the servers page, the tool list or the wizard's verify step now offers a login
  a user could never complete for one.

- ab9b7a0: Refresh the MCP-server reads immediately after a mutation succeeds, instead of
  leaving the page stale until the next 30s background poll.

  Confirming Activate / Deactivate / Reconnect / Delete (and saving an ad-hoc
  server definition) now triggers the provider's CRD refetch and invalidates the
  aggregator's runtime server list (the "Runtime (live)" block). muster writes
  the CR synchronously inside the tool call, so spec-derived UI — most visibly
  the Activate/Deactivate swap keyed on `spec.suspended` — flips on the very
  next read rather than 10–30s later. `status.state` trails the reconciler by a
  beat, so a single follow-up refetch fires ~2.5s later to catch the settled
  status.

  This matters doubly in unfocused tabs: react-query pauses `refetchInterval`
  there and the plugin's QueryClient has focus-refetch off, so before this
  change a background tab could show a stale row indefinitely. The confirm
  dialog's "may take a moment to reflect in the CRD list" copy is updated to
  match the new behaviour.

  New `useMusterMutationRefresh(installation)` hook in the
  MusterInstanceProvider module; `MusterInstanceContext` is now exported for
  hooks that degrade gracefully outside the provider and for tests.

- f8be62f: The muster section reads MCPServers and Workflows in muster's namespace when a
  person may not list them cluster-wide: a person with only the namespaced
  `agent-platform:user` binding sees the MCPServers they may read, and an empty
  Workflows list where they may read none, instead of "Errors when trying to
  fetch resources" on every Customize page. A person who may list them
  cluster-wide reads them as before.
- 2b79a0c: The classic add-connector form's Name and Technical name fields line up on one line however long their descriptions run (`FormFieldGrid`).
- 2b79a0c: _Register a connector_ lays Name and Technical name out in one column, like the platform's other forms, instead of side by side.
- 6b18a17: MCP servers page: disable Start/Restart (with an explanation pointing at the
  sign-in flow) for an OAuth server waiting on a per-user sign-in, where muster
  refuses them by design; surface muster tool errors as their human-readable
  text instead of the serialized `{"isError":...}` JSON envelope.
- 65d8d60: Render authored Markdown in the muster and roadmap pages with the shared
  `GSMarkdownContent` component from `@giantswarm/backstage-plugin-ui-react`
  instead of calling `MarkdownContent` directly. This gives the muster workflow
  description and the roadmap item body/comments the same consistent paragraph,
  list, and code-block typography as the Plans page, and drops muster's
  now-redundant local paragraph-styling workaround.
- 6b3ac77: MCP server details: the expanded row opens with space between the server name and the first sub-heading instead of the two touching, every sub-heading gets room from its own body, and the Tools block separates its summary line from the tag rows. Every key/value block — configuration, auth/token chain, diagnostics, live runtime, GitOps provenance — is the shared `FactList` from `ui-react` rather than a grid of its own. The registration wizard's Verify step uses it too, so `DefRow` is gone.

  The GitOps footer now says what the rest of the portal says: a new `GitOpsManagedLabel` in `ui-react` carries the GitOps icon, "Managed through GitOps" and an optional link to the source in Git. It replaces the "GitOps-managed (read-only)" badge on the Servers and Workflows pages and the loose "Lifecycle is managed via GitOps" sentence on the standard-server rows, whose footer now matches the registered rows'. `flux-react`'s `GitOpsCard` renders the same label, keeping its own Kustomization/GitRepository lookups.

  The detail body and the action row are on bui: `Text` for the headings and notes, `Flex`/`Box` for the layout, `TagGroup` for the tool pills (each still a real link into the tool explorer, now undecorated) and bui `Button` for the lifecycle actions. The three dialogs behind those buttons stay on MUI for now.

- 954a810: Make the muster Tool Explorer's "Sign in" button work for auth-required MCP
  servers.

  The button called muster's _own_ sign-in, i.e. it resolved the Backstage OAuth
  token for muster's `authProvider` — a token the user already held (it is what
  made `list_tools` succeed), so the click was a guaranteed no-op. The servers
  muster lists in `servers_requiring_auth` each need their own downstream OAuth
  flow instead.

  - `muster-backend`: add `GET /auth/status` (a native `resources/read` of muster's
    `auth://status`) and
    `POST /auth/login` (`core_auth_login`), which normalises muster's free-text
    answer to `{ status, authUrl?, message }`. Muster's refusals (SSO-managed
    server, rate limit, undiscoverable issuer) return HTTP 200 with
    `status: 'error'` rather than a 5xx.
  - `muster`: new shared `ServerSignIn` component and `useServerSignIn` hook. "Sign
    in" now asks muster for the server's sign-in URL and offers it as a link;
    completing the flow in the other tab makes muster connect the server for that
    session, which the hook picks up by polling `auth://status` and then reveals the
    previously hidden tools. SSO-managed servers get an explanation instead of a
    dead button, since only an administrator can fix those.
  - The same affordance is now available per server on the MCP Servers page, under
    "Authentication / token chain".

- f90366e: `MusterTokenMintError` and `isSessionExpiredError` are exported from the plugin
  root, so another plugin can tell an expired portal session from a server it has
  no grant for.
- 54ea033: MCP servers page: move the per-server OAuth "Sign in" out of the
  "Authentication / token chain" detail into the bottom action row, rendered
  prominent (primary) next to the secondary lifecycle/CRUD buttons, and add a
  "Sign out" action (muster's `core_auth_logout`, via a new POST /auth/logout
  proxy route) shown while a per-user OAuth server is connected. Signing out
  revokes the session's auth for the server, re-gates its tools, and brings the
  sign-in affordance back. Standard (federated) servers get the same per-instance
  affordances in an action row of their own.
- 728d50e: Make the per-server MCP sign-in survive a realistic OAuth round-trip. The
  watch on `auth://status` used to give up after 3 minutes with polling paused
  while the user was on the IdP's tab and no re-read on returning — so a
  sign-in that took longer (Miro's organization/team pickers alone exceed it)
  completed successfully yet the MCP servers page still showed "Sign in" over
  an already-connected server. The wait now lasts 15 minutes, keeps polling
  while the tab is in the background, re-reads the status when the user
  returns to the tab, and a sign-in observed to complete even after the
  deadline still unblocks the page.
- c482453: Show a UI-authored confirmation after signing out of an MCP server instead of muster's verbatim logout message, which told portal users to run core_auth_login.
- 5e9b874: Re-read the muster auth status when a sign-out request fails in transport, instead of leaving the row on a stale "Sign out": the logout may have landed server-side even though the answer was lost (e.g. a backend pod terminated by a rollout mid-request). Transport errors for sign-in/sign-out are now also prefixed with the action they belong to instead of a bare "Failed to fetch".
- eba6372: A connector that comes with the portal sign-in (muster's `kind: sso`, token
  forwarding or exchange) is never counted as waiting for a sign-in, since there
  is nothing to sign in to: it is out of the MCP sign-in list the Notification
  inbox, its unread count, toast and desktop notification and the sign-in dialog
  are built from. One that refused that sign-in reads "Cannot connect" in the
  Connectors list, and its Tools tab says that an administrator needs to add the
  portal sign-in's audience to its trusted audiences, with muster's account of
  the attempt under Details. muster's `sso_attempt_failed` counts only while the
  connector is not connected in this session, so a failure muster kept from
  another session no longer marks a connected connector. `ServerAuthStatus`
  carries muster's `kind`.

  The MCP sign-in list settles before it raises a server: not while muster
  reports a server still connecting for the session, and only when a second
  read a few seconds later still has it waiting, so a fresh portal load no
  longer announces servers that connect a moment later. The sign-in dialog
  reads the status again when it opens, lists a provider App only while it
  needs a sign-in (connected ones are disconnected on the Profile page), and
  counts the Apps it lists with the servers.

- 2b79a0c: `ToolDetailPanel` takes an optional `note`, one line shown beside its run button, and an optional `runLabel` for that button ("Execute" by default).
- 32f943c: A tool-level error's further text blocks (muster-backend's `error.details`, from gs-node's `MusterToolError`) stay with the thrown error; `toolErrorDetails(error)` reads them — cluster-manager's `delete_node_pool` answers its structured refusal there.
- 4aa60ba: Tool Explorer: a tool's parsed result is shown in the read-only editor (the one
  the Workflow manifest dialog uses) with JSON highlighting and folding, and the
  Table, Parsed and Raw views grow with the window instead of stopping at 480 px.
  `YamlEditor` and `YamlEditorFormField` take a `language` prop (`'yaml'` by
  default, or `'json'`), and `YamlEditorFormField`'s `maxHeight` accepts a CSS
  length. A read-only editor no longer opens with a bracket highlighted, and
  parses long documents fully so their outer levels get fold markers.
- 5cf5f33: Fix regressions from the muster Tool Explorer bui migration:

  - Restore the result table's scroll cap (max-height with overflow) so large tabular results scroll inside the panel instead of overflowing it.
  - Keep the clickable tool row's contents as phrasing content so no block-level elements nest inside the native `<button>`.
  - Restore the ability to clear an optional enum argument back to unset (a leading "unset" option), so a previously chosen value can be removed from the call payload.

- 3383e35: Migrate the muster Tool Explorer (`/agent-platform/muster/tools`) to the bui design system (`@backstage/ui`).

  - Rebuild the tool browser, detail panel, argument form, and result viewer on bui primitives (`AccordionGroup`, `SearchField`, `Table`, `ToggleButtonGroup`, `Select`/`NumberField`/`TextAreaField`/`Switch`, `Alert`, `Button`/`ButtonIcon`, `Flex`/`Box`/`Text`), removing most per-component `makeStyles` styling in favour of bui layout props.
  - Also migrate the shared muster `SectionHeader` (used by all four muster screens) to bui.
  - Add render/smoke tests for the migrated Tool Explorer components.

- 578b163: Fix the muster Tool explorer browse tree so shared federated tools are no longer attributed to an arbitrary peer management cluster, the grouping no longer flickers on load, and `?server=` deep links scope correctly.

  - Shared/deduplicated federated tools (one `x_<family>` prefix that maps to many management clusters, targeted via the `management_cluster` argument) are now bucketed under a neutral family-level fleet label (`Kubernetes (fleet)` / `Prometheus (fleet)`) instead of the alphabetically-first peer MC, and split by family. Each server bucket's subtitle is derived from the family set it actually holds (and the federated cluster count for fleet groups), not from whichever server created the bucket (ADR muster-ui-iteration-2 D1).
  - The browse grouping waits for the MCPServer CRs to load before rendering, so the sections no longer reshuffle from raw `Server: <segment>` buckets to management-cluster buckets on load.
  - A `?server=` deep link now scopes the browse to that server's tools by tool-name prefix (with a clearable scope banner) instead of seeding a free-text search that also matched every tool whose description mentioned the segment.

- 578b163: Polish the muster tool explorer: pre-select enum defaults, keep result-table headers readable, and collapse the large browse groups.

  - Enum/select argument fields now pre-select the schema `default` (e.g. `x_kubernetes_list`'s `output` shows `slim`) so the form reflects the value the tool will actually use instead of rendering a blank select.
  - Result-table column headers no longer squeeze to one letter per line: header cells get `white-space: nowrap` and the horizontal scroll handles the width.
  - The browse tree now expands only the Core group by default, so the 282-row Workflows group is collapsed on load (consistent with the MCP-servers collapse-by-default direction); the long tail is reached via search.

- 2b79a0c: Connector tool calls on the Usage page read on a phone. At phone width the Top tools and Connector tables keep the name and Calls, and a row's errors and p95 latency appear under its name. Cells are padded more tightly, so a long tool name wraps over fewer lines. A table that is still too wide scrolls inside its card instead of being clipped.
- d19ad0c: Workflows: the **Workflow manifest** dialog uses the shared manifest dialog. **Copy manifest** now confirms with "Copied" and reports a failed copy instead of failing silently.
- 578b163: Make the workflow-list search token-aware and relevance-ranked instead of a naive substring filter.

  The previous filter matched the query against any substring of a workflow's name or description, so searching "dex" returned `loki-request-errors` and `memcached-low-hit-ratio` purely because their descriptions mention "in**dex**". Search now matches on word/token boundaries (a query token must be a prefix of a name/description token), requires every query token to match, and orders results by relevance (name matches and exact tokens rank above description-only and prefix matches). "dex" now returns the dex workflows, not "index"-only matches.

- 578b163: Decouple the muster workflow availability badge from the validator's `status.valid`, and clarify the workflow Executions/Statistics panels.

  A workflow whose aggregated `workflow_<name>` tool executes was reading "Unavailable" purely because muster's validator flagged its definition (e.g. the false-positive that demands a top-level `tool` on `parallel`/`forEach` container steps). The UI then contradicted itself: an "Unavailable" badge next to a working Run button.

  - `MusterWorkflow.isRunnable()` now backs the availability badge (every loaded Workflow CR is runnable because muster exposes its `workflow_<name>` tool). The validator verdict surfaces separately as a non-blocking "Validation warning" badge plus a reworded detail-page callout, instead of an "Unavailable" availability state (ADR D2). The workflows-list filter is repurposed from Available/Unavailable to Valid/Validation-warnings to stay coherent.
  - The Executions and Statistics panels now state that they reflect engine- and agent-driven runs recorded by muster's aggregator, and that a run launched from the tool explorer executes the aggregated tool directly and is not recorded there (its result is shown inline in the explorer).

- 610d01d: Every session-expired notice reads "Your session expired, sign in again.",
  from the one `SESSION_EXPIRED_MESSAGE` the kubernetes-react plugin exports; the
  Cluster access popover no longer says "Your session expired -- sign in again",
  and a rejected session reads "Your session was rejected, sign in again."
- 2b79a0c: `DateComponent` shows the browser's local time below a `DateTimeZoneProvider` set to `local`, with the full timestamp and its zone on hover; without a provider it stays UTC. The Agent Platform shell sets it, so its lists and detail pages show one clock. `DateComponent` no longer passes its `tooltip` prop to the DOM.

  Every Agent Platform page now sets a document title such as "Lab Helper · Agents · Agent Platform". `ShellPage` and `WizardFrame` set it from their breadcrumbs or title (`documentTitle` overrides), through the new `ShellDocumentTitle`, which an outer title template cannot suffix a second time.

- 2b79a0c: The Usage time range applies everywhere. The Overview's "Your sessions" tile counts the selected window, and Your sessions shows sessions and tool calls for 7 days too: the session-usage route now reports `toolCalls` and `lastActiveSessions` per day. The Connectors view asks muster for the selected window instead of a fixed 30 days. The per-day chart no longer draws a bar for tomorrow.
- 4f6d765: Show a gate instead of an empty section when the installation's inventory probe
  was refused.

  When the API server of the home (or pinned) installation rejected the portal's
  token, `MusterInstanceProvider` dropped the installation and the section
  rendered nothing that explained why: the dashboard sat on its progress bar, the
  other views claimed no installation runs muster. The provider now exposes the
  failure (`inventoryFailure`, from gs `selectInventoryFailure`) and a
  `refreshInventory`, and `MusterSection` renders the gs `InventoryFailureGate` in
  place of the views: it names the installation, quotes the 401/403/error and
  offers the remedy -- for a 401, signing out of the portal and in again.

  `Gate` moved to `ui-react`; muster re-exports it, so its call sites are
  unchanged.

- 2b79a0c: Detail pages in the agent-platform shell no longer flash a different page layout while they load. The agent, model, skill, session, connector and workflow pages render their final header (breadcrumbs, avatar or tile, title line, badge row, tabs, facts column) from the first paint, with skeletons where the data is still being read. An agent, model or session already in the query cache renders at once, instead of showing the loading state while the persisted cache is restored. Opening a detail page no longer shows the section's list header ("Agents", "Sessions", "Models") while the page's code loads, and the Agents and Sessions tabs wait for the agent-platform cookie only once per page load instead of on every visit. `ShellPage` gains `ShellPageTitleSkeleton`, `ShellPageBadgeSkeleton` and `ShellPageFactsSkeleton` for these loading states.
- 2b79a0c: The connector Tools tab filters by what a tool does with a "What it does" dropdown (Reads, Changes things) like every other filter.
- 2b79a0c: The agent shell now works at phone width (375px). The shell publishes how much
  of the viewport's bottom edge its fixed mobile bar covers as
  `--agent-shell-mobile-bar-height` — the bar's 56px plus the iOS home-indicator
  inset — and the session view's docked composer sticks above it instead of
  being covered by it; in-flow pages (the home composer) clear the inset too.
  Tables built on core-components scroll inside their own box at phone width
  instead of widening the page. In the session view, long tool names in timeline
  rows ellipsize rather than overflowing, and the approval card's caption and
  buttons wrap onto separate lines. A workflow step's arguments grid on the
  workflow detail page folds to one column below 420px, like the steps section's
  grid already did.
- 2b79a0c: Classic pages keep their pre-shell `InfoHint` and `FactList` behavior. The press-to-open popover, the larger hit area and the 600px stack point now apply only inside the agent-platform shell, which marks its pages with the new `ShellScopeProvider`. Markdown tables in `GSMarkdownContent` and the session timeline scroll instead of breaking words mid-word in their cells. The shell flag is read once per app load (`isAgentShellOn`), so the shell's pages and chrome always agree.
- 5d7602c: Only offer an installation selection when there is an actual choice.

  - `agent-platform`: when several installations are configured but, once the
    fleet has settled, only one of them is usable (has models and agent-manager),
    the "Create an agent" installation card selects it and says where the agent
    runs instead of offering a one-option dropdown. The card now also explains
    installations whose muster server list couldn't be read and installations
    whose cluster access isn't healthy, instead of leaving them out silently.
  - `gs`: the `GSInstallationPicker` scaffolder field selects the only selectable
    installation, regardless of `autoSelectFirstValue`, and hides itself when it
    is the only allowed one. It waits for the installations' health checks before
    deciding, withdraws a selection that becomes disabled, and withdraws an
    automatic pick when the list widens again.

  `muster`: remove the "Add ad-hoc server" button and its create dialog from the
  MCP Servers page. "Register server" is now the single way to add an MCP server.
  stdio servers and non-default settings (`autoStart` off, a custom timeout, and
  so on) are no longer created from the portal; add those through GitOps. An
  existing server's settings can still be changed through its JSON edit dialog.
  User-facing copy no longer calls these servers "ad-hoc".

- a5ec0eb: Explain every figure in the stats strips with an info hint: the session detail
  and session usage totals, the muster dashboard, MCP usage and workflow run
  stats, and the bot PR queue. The workload details pane's replica counts now use
  the shared `Stat` component too, and the session detail and muster dashboard
  strips use the same spacing as the others.
- 2b79a0c: Remove model config on a running model asks first and names the agents that use the config. The agent page's "Update skills…" is now "Update all skills to latest…", and a skill pinned behind its catalog's newest commit shows "Update available". Add GPU node pool is disabled with its reason where no environment has a cluster, and Serve model no longer preselects a preset the nodes cannot serve. `DisabledAction` moves from muster to ui-react.
- 2b79a0c: The connector page's tool search no longer leaves a tall gap above the filter, its no-match line is the shared one with Clear filters, its menu uses the vertical "more" icon, Edit has no icon, its state is a dot like the list's, its confirms name the action ("Remove", "Turn off") and a removal is confirmed with a toast. The workflow page's sections use the platform's section headings, the session gate's button is a bui button, and back links read "Back to connectors" / "Back to workflows".
- 49263b7: The "Reads" and "Changes things" badges on tools (and "Only reads" / "Can change things" on workflows) are easier to read: their text is set in bui's 12px badge size instead of 10px, on one line, and "Reads" now has a visible box (a light fill and edge) in light and dark theme, while "Changes things" stays the stronger, warning-coloured one. The workflow flow and its phone step list draw their step markers, the step number and "May fail" included, with the same shared badge (`MarkerBadge`, with a compact size for a box's edge) instead of a look of their own.
- 6ce4a71: Extract muster's client-side token-boundary search matching (`tokenize`/`matchesQuery`,
  previously a muster-local `lib/workflowSearch.ts`) into
  `@giantswarm/backstage-plugin-ui-react` so other plugins can reuse it for
  quick-search over an already-loaded list, without a backend ranking endpoint.
  The Workflows table's quick-search now imports it from `ui-react`; behavior is
  unchanged.
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
- 2b79a0c: Usage › Connectors draws its tables with bui like the other usage tables, and its counts, latencies and durations share the platform's formatters ("1.2 s", "274 ms"). Workflows and tools share one effect badge, the GitOps edit instructions use the shared manifest dialog, the definition editor says "Discard changes" and asks before Escape discards unsaved edits, the connector edit gate shows its states in the wizard frame, and state badges and the disabled sign-in explain themselves without MUI tooltips.
- 2b79a0c: Customize › Connectors and Workflows names are links, so a row opens by keyboard or in a new tab. The connector edit wizard is titled "Edit connector" with the connector in its context line and document title, and its locked name is read-only rather than disabled. A tool's breadcrumb trail no longer repeats the connector as "Tools". A connector family's instances show a page at a time.
- b773056: Workflows say what they do in the same words and badges as tools: "Reads" and "Changes things" instead of "Only reads" and "Can change things", in the Workflows list (table and phone rows), on a workflow's page and in its steps' spoken names. A workflow still shows "Reads" only when muster marks it read-only, which it does only when every tool its steps can reach is, and its badge now says so in a tooltip ("Every step only reads." or "At least one step can change things."), shown on hover, keyboard focus or a tap. A tool's badge is unchanged. `EffectBadge` loses its `subject` prop, which only chose the workflow wording.
- d400274: Refresh the workflow reads immediately after a mutation succeeds, instead of
  leaving the workflows page stale until the next 30s background poll.

  Confirming a workflow delete (and saving an ad-hoc workflow definition) now
  triggers the provider's CRD refetch, with one ~2.5s follow-up for the
  reconciler-trailing availability status — the same post-mutation refresh the
  MCP servers page gained. Unlike the servers page, the workflow list has no
  runtime aggregator query: the provider's CRD reads are the whole read path,
  so no extra react-query invalidation is needed. The success copy now says the
  list has been refreshed rather than promising it "will refresh shortly".

- Updated dependencies [5bdbb49]
- Updated dependencies [1fba94a]
- Updated dependencies [2978657]
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [d7b570d]
- Updated dependencies [e62dd24]
- Updated dependencies [7740b89]
- Updated dependencies [343d4b2]
- Updated dependencies [244719a]
- Updated dependencies [863da43]
- Updated dependencies [2b79a0c]
- Updated dependencies [d6bec76]
- Updated dependencies [a59b04c]
- Updated dependencies [2c4e7eb]
- Updated dependencies [17f51ca]
- Updated dependencies [2b79a0c]
- Updated dependencies [2494c9a]
- Updated dependencies [3f7455f]
- Updated dependencies [b0a1bd2]
- Updated dependencies [85b1ac8]
- Updated dependencies [4eaec47]
- Updated dependencies [551e5d5]
- Updated dependencies [c5b9c46]
- Updated dependencies [0c2f870]
- Updated dependencies [1a05f26]
- Updated dependencies [7a49e7f]
- Updated dependencies [9c53996]
- Updated dependencies [a036f84]
- Updated dependencies [2b79a0c]
- Updated dependencies [a776d8b]
- Updated dependencies [2d1f914]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [03a24b1]
- Updated dependencies [bf367f1]
- Updated dependencies [9c69597]
- Updated dependencies [5b5d408]
- Updated dependencies [27e64aa]
- Updated dependencies [57df63e]
- Updated dependencies [d6bec76]
- Updated dependencies [d6bec76]
- Updated dependencies [2b79a0c]
- Updated dependencies [b5f7aa4]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [c4f3eca]
- Updated dependencies [9eab10f]
- Updated dependencies [341e658]
- Updated dependencies [fedd5d8]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [d129ee1]
- Updated dependencies [2b94c2a]
- Updated dependencies [9188650]
- Updated dependencies [9312feb]
- Updated dependencies [a060513]
- Updated dependencies [aad1e93]
- Updated dependencies [1e1e0e3]
- Updated dependencies [2b79a0c]
- Updated dependencies [9c0ba49]
- Updated dependencies [281d787]
- Updated dependencies [21ae39b]
- Updated dependencies [ef01d42]
- Updated dependencies [4c69b72]
- Updated dependencies [9dcfef0]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [2fa183d]
- Updated dependencies [2fa183d]
- Updated dependencies [9e00143]
- Updated dependencies [d87fd9d]
- Updated dependencies [aad1e93]
- Updated dependencies [602f2a7]
- Updated dependencies [2b79a0c]
- Updated dependencies [b63373b]
- Updated dependencies [4f6d765]
- Updated dependencies [2b79a0c]
- Updated dependencies [ea12ebb]
- Updated dependencies [158457a]
- Updated dependencies [600a4c3]
- Updated dependencies [d0bf6da]
- Updated dependencies [c3409fb]
- Updated dependencies [fd4dc77]
- Updated dependencies [4048e91]
- Updated dependencies [67a32ef]
- Updated dependencies [9fd228e]
- Updated dependencies [4c4b507]
- Updated dependencies [f905068]
- Updated dependencies [4bcdf2e]
- Updated dependencies [86eec55]
- Updated dependencies [e928a56]
- Updated dependencies [884bd42]
- Updated dependencies [23bfca0]
- Updated dependencies [2b79a0c]
- Updated dependencies [e33193b]
- Updated dependencies [2b79a0c]
- Updated dependencies [d82c4c6]
- Updated dependencies [13225d7]
- Updated dependencies [87b1c2e]
- Updated dependencies [3dbde6e]
- Updated dependencies [a1292a5]
- Updated dependencies [6822ed1]
- Updated dependencies [ee7fe5a]
- Updated dependencies [d29ac2a]
- Updated dependencies [573b34d]
- Updated dependencies [b4dc429]
- Updated dependencies [d19ad0c]
- Updated dependencies [75cb9fa]
- Updated dependencies [526dd01]
- Updated dependencies [2c383a6]
- Updated dependencies [2789f3d]
- Updated dependencies [3043a1d]
- Updated dependencies [0a05757]
- Updated dependencies [66ac70b]
- Updated dependencies [8967f50]
- Updated dependencies [6720990]
- Updated dependencies [cfb48ae]
- Updated dependencies [d14ebda]
- Updated dependencies [0811b1e]
- Updated dependencies [74e4a0b]
- Updated dependencies [e807fa6]
- Updated dependencies [e9a6141]
- Updated dependencies [b79cf20]
- Updated dependencies [104d1bc]
- Updated dependencies [5e54675]
- Updated dependencies [1f1b881]
- Updated dependencies [0d6360e]
- Updated dependencies [faaf78e]
- Updated dependencies [0d6d9f3]
- Updated dependencies [6e1050e]
- Updated dependencies [0edc1c4]
- Updated dependencies [2c6f671]
- Updated dependencies [e447f16]
- Updated dependencies [b431a04]
- Updated dependencies [2b79a0c]
- Updated dependencies [8402eee]
- Updated dependencies [6a5c0d4]
- Updated dependencies [e5bd97a]
- Updated dependencies [381d16d]
- Updated dependencies [ea5fd6f]
- Updated dependencies [5c82125]
- Updated dependencies [b820660]
- Updated dependencies [871a9cb]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [ea12ebb]
- Updated dependencies [2e425c5]
- Updated dependencies [322e58c]
- Updated dependencies [d19ad0c]
- Updated dependencies [61b4c34]
- Updated dependencies [b2c5996]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [4114dde]
- Updated dependencies [0373fb1]
- Updated dependencies [32f7b03]
- Updated dependencies [731296e]
- Updated dependencies [56d8c05]
- Updated dependencies [ee2786b]
- Updated dependencies [ad90805]
- Updated dependencies [2b79a0c]
- Updated dependencies [87b1c2e]
- Updated dependencies [5b9c5f4]
- Updated dependencies [cfb83c6]
- Updated dependencies [846f143]
- Updated dependencies [94a61cb]
- Updated dependencies [7b63a47]
- Updated dependencies [4b7522d]
- Updated dependencies [c604256]
- Updated dependencies [6b3ac77]
- Updated dependencies [4aa60ba]
- Updated dependencies [b8afa37]
- Updated dependencies [8e3b668]
- Updated dependencies [2b79a0c]
- Updated dependencies [bbb9406]
- Updated dependencies [9180429]
- Updated dependencies [12aaa8b]
- Updated dependencies [610d01d]
- Updated dependencies [ca6ffd8]
- Updated dependencies [398c4b1]
- Updated dependencies [22b2ad6]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [2b79a0c]
- Updated dependencies [e8c6d73]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [c81464c]
- Updated dependencies [a6c427b]
- Updated dependencies [b9aff1b]
- Updated dependencies [741669e]
- Updated dependencies [7a6b30e]
- Updated dependencies [564456f]
- Updated dependencies [83cc65c]
- Updated dependencies [389a40b]
- Updated dependencies [fd05081]
- Updated dependencies [ee7fe5a]
- Updated dependencies [fa4ae37]
- Updated dependencies [b4a3dee]
- Updated dependencies [ebd7572]
- Updated dependencies [bf1e9b2]
- Updated dependencies [eb7ed35]
- Updated dependencies [69e07c8]
- Updated dependencies [eb2bbd1]
- Updated dependencies [aecc202]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f205e33]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f985210]
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
- Updated dependencies [5d7602c]
- Updated dependencies [14e878c]
- Updated dependencies [2b79a0c]
- Updated dependencies [14e878c]
- Updated dependencies [a2443de]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a5ec0eb]
- Updated dependencies [2b79a0c]
- Updated dependencies [220e7c7]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [b44a375]
- Updated dependencies [2b79a0c]
- Updated dependencies [1893681]
- Updated dependencies [f94930d]
- Updated dependencies [cba71a8]
- Updated dependencies [2b79a0c]
- Updated dependencies [0bed874]
- Updated dependencies [483c8f4]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [2e425c5]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [322e58c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [0d6360e]
- Updated dependencies [d19ad0c]
- Updated dependencies [b990251]
- Updated dependencies [2b79a0c]
- Updated dependencies [d9673e8]
- Updated dependencies [9e57736]
- Updated dependencies [2b79a0c]
- Updated dependencies [d95e52d]
- Updated dependencies [ff8b3f1]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [2b79a0c]
- Updated dependencies [9fab6b1]
- Updated dependencies [3130bf4]
- Updated dependencies [600a4c3]
- Updated dependencies [6079d5b]
- Updated dependencies [e6ced92]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [103014c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [ca3ad93]
- Updated dependencies [af67bbf]
- Updated dependencies [b032f65]
- Updated dependencies [0388b0e]
- Updated dependencies [0af6fea]
- Updated dependencies [2b79a0c]
  - @giantswarm/backstage-plugin-agent-platform-common@1.0.0
  - @giantswarm/backstage-plugin-kubernetes-react@1.0.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.15.0
  - @giantswarm/backstage-plugin-gs@0.71.0
  - @giantswarm/backstage-plugin-analytics-react@0.2.0
  - @giantswarm/backstage-plugin-gs-common@0.22.0
  - @giantswarm/backstage-plugin-gs-react@0.1.0

## 0.3.0

### Minor Changes

- bc88c69: Forward the main Dex ID token as the MCP bearer token when an MCP server's `authProvider` has no dedicated `auth.providers` entry. `MCPAuthProviders` and `MusterAuthProviders` accept an optional main auth API (wired to `gsAuthProvidersApi.getMainAuthApi()` in the app) and fall back to its ID token, enabling single sign-on for muster via its trusted-audiences validation. Deployments enable this by removing the `mcp-muster` provider from `auth.providers`, which also removes the separate PKCE login from the user settings page; dedicated providers keep taking precedence while still configured.

## 0.2.1

### Patch Changes

- db81de5: Fix the muster Workflows page failing with 401 ("requires a user token for
  auth provider ... but the request did not include one") when the muster MCP
  server uses per-user auth.

  The muster frontend resolves the server's `authProvider` by matching the
  `aiChat.mcp` entry by `name`, but `name` was not declared frontend-visible in
  the config schema, so the browser never saw it, never resolved the auth
  provider, and never sent the auth header. `aiChat.mcp[].name` is now
  `@visibility frontend`, and `muster.serverName` is declared frontend-visible
  in the muster frontend plugin's own config schema so overriding the entry
  name also works in the browser.

## 0.2.0

### Minor Changes

- c117a5e: Support muster MCP servers behind per-user auth (`authProvider` entries in
  `aiChat.mcp`): the muster frontend now forwards the user's OAuth token to the
  muster-backend proxy, which opens per-user MCP sessions. Previously such
  servers were reported as unconfigured and the Workflows page failed with a 503.

  Also addresses review feedback on the initial muster plugins: the shared MCP
  client cache moved from ai-chat-backend to `@giantswarm/backstage-plugin-gs-node`
  and is reused by muster-backend; config parsing no longer throws on unnamed
  `aiChat.mcp` entries; muster-backend uses `@backstage/errors` classes instead
  of a hand-rolled error middleware; query parameter validation rejects empty
  and repeated values; execution fetch errors are surfaced in the UI instead of
  being silently swallowed; duplicate workflow step ids no longer drop nodes
  from the graph; and `formatDuration` is shared instead of copy-pasted.

## 0.1.0

### Minor Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
