# @giantswarm/backstage-plugin-muster

## 0.4.0

### Minor Changes

- 551e5d5: One installation scope for the Agent Platform section. A selector in the page header lists "All installations" (the default) and every installation whose inventory has kagent, muster or KServe, home first, each with its state (signed out, not reachable from this portal, no kagent/muster here); it scopes Agents, Sessions, Models and MCP Servers alike, is kept in `?installation=` and in localStorage under the key the muster picker always used, and is not rendered on a portal that knows one installation. Under "All installations" the three fleet-wide lists query the home installation first and render its rows before any other installation is asked; the others stream in as groups below, each headed by installation name, pipeline and a status line (loading, N items, none here, could not be read, not reachable from this portal). The MCP Servers tab shows the home installation under "All installations" and follows a pinned installation otherwise; its picker pins the shared scope instead of owning one, and no default is written back any more. Detail pages (agent, session, model) carry an installation chip in the header; the New-session composer names the installation in every picker row and in the selected value when the offered agents span more than one installation. The gs plugin exports `useInstallationScope`, `useInstallationScopeUrlSync`, `InstallationScopeSelect`, `applyInstallationScope` and the store (`setInstallationScope`, `INSTALLATION_SCOPE_STORAGE_KEY`, `INSTALLATION_SCOPE_SEARCH_PARAM`, `ALL_INSTALLATIONS`). The agent-platform tabs share one live react-query client. The Model configs list and the Add-model form take their installations from the inventory's kagent installations, home first, instead of every reachable installation.
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
- 69eaff0: `filterTools` learns the toolset arguments and exports the pieces the agent creation Tools step builds on.

  - `filterTools({ toolset, includePresets })` sends one `toolset=` entry per selector and `include_presets`; `FilterToolsResponse` gains `toolset` (echo), `toolset_unmatched` and `presets`; `ToolSummary` / `ToolDetail` gain `server`, `kind` and the forwarded `annotations` (read-only, destructive, idempotent, open-world hints). All optional — absent from an aggregator that predates toolsets.
  - Exported for other plugins: `ServerSignIn`, `useServerSignIn` (and their types) plus the `filter_tools` / `list_tools` types.

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
- 6205cca: Add a first-class muster management section. The muster plugin now exposes a tabbed page (Dashboard, MCP servers, Workflows, Tool explorer) over a two-client model: a read-only, multi-installation Kubernetes/CRD client (reusing the clusters-page `useResources` mechanism for `MCPServer` and `Workflow` CRs across every installation that runs a muster aggregator) and the muster MCP proxy for live execution.

  - **Dashboard**: per-installation identity/health cards plus a fleet health matrix (`management-cluster` × `family`) built from MCPServer CRD status.
  - **MCP servers**: CRD-driven list grouped by management cluster/family with an auth/token-chain detail view (`spec.auth`), runtime merge from `core_mcpserver_list`, and per-server tool listings.
  - **Workflows**: CRD-driven list with step counts and validity, a step-card detail view with cross-workflow references, execution statistics, and a run + execution-history view via the MCP proxy.
  - **Tool explorer**: unified browse/search over core, aggregated (`x_<server>_*`), and workflow tools via `filter_tools`, a JSON-schema-driven execution form (`describe_tool` + `call_tool`), and a result viewer.

  The backend `MusterMcpClient` is generalised from the four hardcoded workflow tools to all muster meta-tools (`list_tools`, `filter_tools`, `describe_tool`, `list_core_tools`, `call_tool`) and made multi-installation (config-driven map keyed by installation, selected per request via `?installation=`). A config-driven read-only-by-default safety allowlist gates mutating `call_tool` invocations. The unused ReactFlow workflow-graph stack and its dependencies (`@xyflow/react`, `classnames`) are removed.

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

- 2995471: Decide whether an installation's muster carries a server by the name muster exposes it under (`family.name ?? toolPrefix ?? name`), not by the MCPServer's own name. A server declared with a `toolPrefix` is addressed by that prefix — `gazelle-mcp-marge` exposes `x_marge_<tool>` — so matching the name alone reported it as absent on every installation that runs it. `McpServerRuntime` now carries `toolPrefix` and `family`, and the muster plugin exports that type.
- 8d67e83: Group MCP servers by tool group — **Agent Platform**, **Infrastructure**, **Registered servers** — instead of by topology.

  The MCP servers page used to split servers into "Standard servers" (a `spec.family` federated across management clusters), "Integration servers" (everything singular) and a "muster core" section. That put the platform's own agent-manager and model-manager between GitHub, PagerDuty and a hand-registered server. The platform now tiers its MCP servers through a label the shipping chart stamps on the CR, `agent-platform.giantswarm.io/tool-group: agent-platform | infrastructure`; a CR without the label is a _Registered server_. The portal reads that label and infers nothing from names, provenance or topology.

  - **MCP servers page**: three sections in that order, each with a one-line explanation. Federation stays a row shape inside a section: servers sharing a `spec.family` still collapse into one family row with per-cluster pills and coverage, singular servers keep their disclosure. muster core is the last row of Agent Platform; the ad-hoc registration action sits under Registered servers. An installation whose charts do not carry the label yet lists everything under Registered servers — one long list, never an empty or broken page — and the empty groups say so. A family mid-rollout (only some clusters labelled) stays one row, placed by its labelled members.
  - **Dashboard**: the Capability surface groups its rows by tool group, muster core closing Agent Platform; Fleet coverage keeps measuring per family, whichever group a family is listed under.
  - **Public API** (for the agent creation Tools step and the agent detail page, which group the tool catalogue the same way): `MCPServer.getToolGroup()` (`'agent-platform' | 'infrastructure' | undefined`), `MCPServer.getToolGroupKey()` (adds `'registered'`), `TOOL_GROUP_LABEL`, `TOOL_GROUPS` (key, display title, one-line description per group), `TOOL_GROUP_ORDER`, `parseToolGroup`, and the types `ToolGroup`, `ToolGroupKey`, `ToolGroupInfo`. `partitionServers` now returns the groups in display order, each as rows (`{ kind: 'family' }` / `{ kind: 'server' }`); `familyGroups` flattens the family rows for coverage.

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

### Patch Changes

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

- 0b2fa7f: Keep the MCP registration wizard's verify panel polling while the tab is hidden. The server connects during exactly the window where the user wanders off to another window or tab, and react-query skips interval refetches for unfocused tabs by default — the panel silently froze on "Waiting for the server to appear…" until it was refocused. The backend's `/servers` route now also asks muster for failed servers (`showAll`) with their raw errors (`verbose`); muster hides `Failed` servers from `core_mcpserver_list` by default, which made a failing server vanish from the runtime view instead of showing up with its error in the verify panel and the server detail.
- 578b163: Make the muster manager's auth state coherent across every surface: gate create/add affordances on a muster session and stop conflating "auth required" with "down".

  - "Add ad-hoc server" (MCP servers) and "Create workflow" (workflows) are now disabled with an explanatory tooltip when there is no authenticated muster session for the selected installation, instead of opening a dialog that fails after the user composes a definition.
  - Auth-failure (HTTP 401 / "authentication failure") errors from the ad-hoc validate/save/delete flows are mapped to a friendly "connect to muster (sign in)" prompt rather than the raw `MCP HTTP Transport Error … (HTTP 401)` transport message.
  - An `Auth Required` server with no tools now reads "requires an authenticated muster session for your user" rather than "the server may be down", matching the dashboard's treatment of `Auth Required` as a session state, not a degraded one.

  The MCP-servers-page session probe is extracted to a shared `useMusterSession` hook so the dashboard, the manager and the workflows list resolve session state (and the connect action) the same way — the dashboard's connect now signs in for the selected installation rather than the default one, and its probe is deduped with the hook's.

- 607d514: The muster dashboard's Capability surface table gives the tool group, the row's
  kind (server, family or muster core) and the number of instances behind it a
  column each, instead of trailing the server name as markers, and renders as a
  bui table.
- 578b163: Render the muster dashboard body immediately on a cold load instead of blanking it behind a full-page spinner.

  The dashboard previously gated its whole body on `isLoading` (installations + the single-cluster MCPServer CRD read). On a cold first load that read can be queued behind the Backstage whole-fleet cluster-access warm-up, so the page showed only a spinner for several seconds. The page now:

  - gates only on the active installation being resolved, then renders the chrome (identity, endpoint, browse cards, sections) immediately from persisted/last-known data;
  - shows a thin progress bar under the header and `…` / "Loading…" placeholders for the stats, browse counts, and fleet-health matrix while the live CRD read is still in flight, instead of a misleading "0 servers" / "No MCP servers found".

  The root-cause serialization fix (foreground proxy reads jumping ahead of the fleet warm-up) ships separately in `@giantswarm/backstage-plugin-gs`.

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
- 32f943c: A tool-level error's further text blocks (muster-backend's `error.details`, from gs-node's `MusterToolError`) stay with the thrown error; `toolErrorDetails(error)` reads them — cluster-manager's `delete_node_pool` answers its structured refusal there.
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

- 578b163: Make the workflow-list search token-aware and relevance-ranked instead of a naive substring filter.

  The previous filter matched the query against any substring of a workflow's name or description, so searching "dex" returned `loki-request-errors` and `memcached-low-hit-ratio` purely because their descriptions mention "in**dex**". Search now matches on word/token boundaries (a query token must be a prefix of a name/description token), requires every query token to match, and orders results by relevance (name matches and exact tokens rank above description-only and prefix matches). "dex" now returns the dex workflows, not "index"-only matches.

- 578b163: Decouple the muster workflow availability badge from the validator's `status.valid`, and clarify the workflow Executions/Statistics panels.

  A workflow whose aggregated `workflow_<name>` tool executes was reading "Unavailable" purely because muster's validator flagged its definition (e.g. the false-positive that demands a top-level `tool` on `parallel`/`forEach` container steps). The UI then contradicted itself: an "Unavailable" badge next to a working Run button.

  - `MusterWorkflow.isRunnable()` now backs the availability badge (every loaded Workflow CR is runnable because muster exposes its `workflow_<name>` tool). The validator verdict surfaces separately as a non-blocking "Validation warning" badge plus a reworded detail-page callout, instead of an "Unavailable" availability state (ADR D2). The workflows-list filter is repurposed from Available/Unavailable to Valid/Validation-warnings to stay coherent.
  - The Executions and Statistics panels now state that they reflect engine- and agent-driven runs recorded by muster's aggregator, and that a run launched from the tool explorer executes the aggregated tool directly and is not recorded there (its result is shown inline in the explorer).

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

- a5ec0eb: Explain every figure in the stats strips with an info hint: the session detail
  and session usage totals, the muster dashboard, MCP usage and workflow run
  stats, and the bot PR queue. The workload details pane's replica counts now use
  the shared `Stat` component too, and the session detail and muster dashboard
  strips use the same spacing as the others.
- 6ce4a71: Extract muster's client-side token-boundary search matching (`tokenize`/`matchesQuery`,
  previously a muster-local `lib/workflowSearch.ts`) into
  `@giantswarm/backstage-plugin-ui-react` so other plugins can reuse it for
  quick-search over an already-loaded list, without a backend ranking endpoint.
  The Workflows table's quick-search now imports it from `ui-react`; behavior is
  unchanged.
- d400274: Refresh the workflow reads immediately after a mutation succeeds, instead of
  leaving the workflows page stale until the next 30s background poll.

  Confirming a workflow delete (and saving an ad-hoc workflow definition) now
  triggers the provider's CRD refetch, with one ~2.5s follow-up for the
  reconciler-trailing availability status — the same post-mutation refresh the
  MCP servers page gained. Unlike the servers page, the workflow list has no
  runtime aggregator query: the provider's CRD reads are the whole read path,
  so no extra react-query invalidation is needed. The success copy now says the
  list has been refreshed rather than promising it "will refresh shortly".

- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [d7b570d]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [85b1ac8]
- Updated dependencies [551e5d5]
- Updated dependencies [c5b9c46]
- Updated dependencies [1a05f26]
- Updated dependencies [7a49e7f]
- Updated dependencies [a036f84]
- Updated dependencies [a776d8b]
- Updated dependencies [5b5d408]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [4f6d765]
- Updated dependencies [600a4c3]
- Updated dependencies [d0bf6da]
- Updated dependencies [c3409fb]
- Updated dependencies [67a32ef]
- Updated dependencies [9fd228e]
- Updated dependencies [4bcdf2e]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [d82c4c6]
- Updated dependencies [87b1c2e]
- Updated dependencies [3dbde6e]
- Updated dependencies [a1292a5]
- Updated dependencies [6822ed1]
- Updated dependencies [573b34d]
- Updated dependencies [526dd01]
- Updated dependencies [2c383a6]
- Updated dependencies [8967f50]
- Updated dependencies [d14ebda]
- Updated dependencies [e807fa6]
- Updated dependencies [e9a6141]
- Updated dependencies [b79cf20]
- Updated dependencies [5e54675]
- Updated dependencies [1f1b881]
- Updated dependencies [faaf78e]
- Updated dependencies [b431a04]
- Updated dependencies [8402eee]
- Updated dependencies [5c82125]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [322e58c]
- Updated dependencies [87b1c2e]
- Updated dependencies [94a61cb]
- Updated dependencies [c604256]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [e8c6d73]
- Updated dependencies [c81464c]
- Updated dependencies [a6c427b]
- Updated dependencies [741669e]
- Updated dependencies [7a6b30e]
- Updated dependencies [564456f]
- Updated dependencies [389a40b]
- Updated dependencies [eb337fb]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
- Updated dependencies [a5ec0eb]
- Updated dependencies [1893681]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [322e58c]
- Updated dependencies [b990251]
- Updated dependencies [9e57736]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [9fab6b1]
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
  - @giantswarm/backstage-plugin-kubernetes-react@1.0.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-gs@0.71.0
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
