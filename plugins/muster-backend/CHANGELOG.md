# @giantswarm/backstage-plugin-muster-backend

## 0.3.0

### Minor Changes

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
- 69eaff0: `GET /tools/filter` passes a repeated `toolset=` query parameter through to muster's `filter_tools` as the `toolset` selector list, and `include_presets` as a boolean. muster owns the grammar: an unknown preset or a malformed selector comes back as muster's own error message.
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
- 6205cca: Add a first-class muster management section. The muster plugin now exposes a tabbed page (Dashboard, MCP servers, Workflows, Tool explorer) over a two-client model: a read-only, multi-installation Kubernetes/CRD client (reusing the clusters-page `useResources` mechanism for `MCPServer` and `Workflow` CRs across every installation that runs a muster aggregator) and the muster MCP proxy for live execution.

  - **Dashboard**: per-installation identity/health cards plus a fleet health matrix (`management-cluster` × `family`) built from MCPServer CRD status.
  - **MCP servers**: CRD-driven list grouped by management cluster/family with an auth/token-chain detail view (`spec.auth`), runtime merge from `core_mcpserver_list`, and per-server tool listings.
  - **Workflows**: CRD-driven list with step counts and validity, a step-card detail view with cross-workflow references, execution statistics, and a run + execution-history view via the MCP proxy.
  - **Tool explorer**: unified browse/search over core, aggregated (`x_<server>_*`), and workflow tools via `filter_tools`, a JSON-schema-driven execution form (`describe_tool` + `call_tool`), and a result viewer.

  The backend `MusterMcpClient` is generalised from the four hardcoded workflow tools to all muster meta-tools (`list_tools`, `filter_tools`, `describe_tool`, `list_core_tools`, `call_tool`) and made multi-installation (config-driven map keyed by installation, selected per request via `?installation=`). A config-driven read-only-by-default safety allowlist gates mutating `call_tool` invocations. The unused ReactFlow workflow-graph stack and its dependencies (`@xyflow/react`, `classnames`) are removed.

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

- 28aada8: Unify workflow execution with the tool explorer. Running a workflow is just executing its `workflow_<name>` aggregated tool, so the bespoke run dialog is removed in favour of a single execution surface.

  - The workflow detail "Run" button and the workflow list "Run workflow…" action now navigate to the tool explorer with the `workflow_<name>` tool preselected (`?installation=<inst>&tool=workflow_<name>`) and its argument form ready.
  - The tool explorer honours `?tool=` (preselects the tool) and `?server=` (seeds the browse search) deep links.
  - Removed the `RunWorkflowDialog` component, the `?run=1` auto-open, the `runWorkflow` client method, and the backend `POST /workflows/:name/run` route.

### Patch Changes

- 71317f9: Migrate the AI chat backend from the `ai@6` generation of the Vercel AI SDK to
  `ai@7` and the matching `v4` providers.

  - Bump `ai` → `^7`, `@ai-sdk/anthropic`/`@ai-sdk/openai`/`@ai-sdk/azure` → `^4`,
    `@ai-sdk/google-vertex` → `^5`, `@ai-sdk/openai-compatible` → `^3`, and
    `@ai-sdk/mcp` → `^2` (in `ai-chat-backend`, `gs-node`, and `muster-backend`).
  - Drop the `@ai-sdk/mcp` SSE transport patch: the fix (treating an `undefined`
    SSE `event` field the same as `event: "message"`) is upstreamed in
    `@ai-sdk/mcp@2`.
  - `ai@7` rejects `role: "system"` messages inside `messages`/`prompt` by
    default; the Anthropic prompt-caching path deliberately puts a system message
    in the array, so it now opts back in via `allowSystemInMessages: true`.
  - `ai@7`'s `ToolExecutionOptions` gained a required `context` field; the muster
    meta-tool executor passes `context: undefined`.

  The frontend (`ai-chat`) stays on `ai@6` because `@assistant-ui/react-ai-sdk`
  has no `ai@7` release yet. The UI-message-stream wire protocol is unchanged
  between v6 and v7, so the `ai@7` backend streams to the `ai@6` frontend
  unchanged. Root `package.json` pins only the backend to 7.x via a scoped
  `resolutions` override (`.../ai-chat-backend/ai`); there is no unscoped `ai`
  resolution (an unscoped pin would override the scoped one in Yarn 4). The
  frontend stays on 6.x via its own `ai@^6` range, kept there by the Renovate
  `ai`/`@ai-sdk/*` major-hold.

- 0b2fa7f: Keep the MCP registration wizard's verify panel polling while the tab is hidden. The server connects during exactly the window where the user wanders off to another window or tab, and react-query skips interval refetches for unfocused tabs by default — the panel silently froze on "Waiting for the server to appear…" until it was refocused. The backend's `/servers` route now also asks muster for failed servers (`showAll`) with their raw errors (`verbose`); muster hides `Failed` servers from `core_mcpserver_list` by default, which made a failing server vanish from the runtime view instead of showing up with its error in the verify panel and the server detail.
- 3b465ec: `GET /tools/filter` reads repeated `toolset=` parameters from the raw query
  string, so a toolset keeps every selector in order however many there are. The
  backend's query parser turned more than 20 repeats into an object, which was
  refused with "toolset must be a string or a list of strings", so the Tools tab
  of an agent with many selectors could not show its tools. `GET /executions`
  refuses a `workflow_name` given more than once instead of ignoring it.
- c8743f8: Recognize muster's new `dcr-failed` client identification method (muster#1086)
  and warn truthfully on the per-server Sign-in: the authorization server
  rejected muster's automatic client registration, rather than the
  `cimd-fallback` claim that it advertises neither CIMD nor registration.
  Older musters never send the value; portals on this version simply keep
  showing the fallback warning for them.
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

- 6b18a17: MCP servers page: disable Start/Restart (with an explanation pointing at the
  sign-in flow) for an OAuth server waiting on a per-user sign-in, where muster
  refuses them by design; surface muster tool errors as their human-readable
  text instead of the serialized `{"isError":...}` JSON envelope.
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

- 54ea033: MCP servers page: move the per-server OAuth "Sign in" out of the
  "Authentication / token chain" detail into the bottom action row, rendered
  prominent (primary) next to the secondary lifecycle/CRUD buttons, and add a
  "Sign out" action (muster's `core_auth_logout`, via a new POST /auth/logout
  proxy route) shown while a per-user OAuth server is connected. Signing out
  revokes the session's auth for the server, re-gates its tools, and brings the
  sign-in affordance back. Standard (federated) servers get the same per-instance
  affordances in an action row of their own.
- 02f726e: Send RFC3339 timestamps to the prometheus range-query tool in the MCP usage
  route — deployed mcp-prometheus versions reject Unix seconds despite the
  tool schema documenting them, which broke the usage view with an
  "invalid start time" error.
- 5d8b87b: Derive every MCP-usage aggregate from step-split range queries instead of
  instant queries with a range-long lookback, computing histogram quantiles
  client-side. Mimir splits range queries into short subqueries but sends
  `increase(x[24h])` instants to the long-range store path, which 500s when a
  store-gateway degrades (observed live: `[1h]` fine, `[12h]`+ failing while
  the equivalent range queries kept working). Secondary rollups (per-tool,
  per-server, latency) now also degrade to empty instead of taking the whole
  view down.
- d817adf: The plans plugin reaches GitHub through muster as the signed-in person; the
  portal holds no GitHub credential. The frontend forwards the user's main
  login (Dex) ID token in `backstage-muster-authorization`, and the plans
  backend runs the GitHub MCP server's tools through muster with it
  (`plans.muster: { installation, server, toolPrefix? }`), which holds the
  person's GitHub grant. A person without a grant gets a "Connect GitHub" step
  (`GET /api/plans/connection`, a 401 `GithubNotConnectedError` carrying
  muster's sign-in URL) instead of a GitHub App login; inline review comments
  are written through a pending review. The `X-GitHub-Token` header and the
  Backstage `github` auth provider are no longer used by plans. The app wires
  `plansAuthApiRef` to the main login provider (`PlansMainAuth`).

  The muster MCP client and its auth-tool parsing move from
  `@giantswarm/backstage-plugin-muster-backend` to
  `@giantswarm/backstage-plugin-gs-node` (`MusterMcpClient`,
  `readMusterInstallationsFromConfig`, `parseAuthLoginResult`,
  `MUSTER_AUTH_HEADER`, new `callToolContent`), so every backend plugin that
  calls muster on the user's behalf shares one implementation.

- cad8b48: Reachability probes (muster's `/installations`, agent-platform's `/kagent/installations`): a probe that ran out of its 3 s budget while the backend's event loop was busy for most of that window -- a pod initialising every plugin at once under a CPU quota -- no longer records the installation as "not reachable from this portal", an answer the backend then served for five minutes and the browser kept for an hour. Such a timeout says nothing about the endpoint (the same endpoint answers the same process in well under a second once it is idle): it is now reported _inconclusive_, nothing is cached, and the next read probes again -- which both frontends do every few seconds while an installation is `'unknown'`. The warm-up moved from plugin initialisation to the backend's startup hook, a negative answer is re-probed after 30 s instead of 5 min, and the gRPC probe closes its HTTP/2 session instead of leaving one idle for 15 minutes per probe.
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

- Updated dependencies [71317f9]
- Updated dependencies [85e7d8c]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [5851bba]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
  - @giantswarm/backstage-plugin-gs-node@0.4.0

## 0.2.3

### Patch Changes

- 95d1e6e: Fixed the workflow endpoints failing with "tool not found" against real muster servers. The muster aggregator only exposes its meta-tools (`list_tools`, `call_tool`, ...) over MCP, so the proxy now invokes the core workflow tools through the `call_tool` meta-tool and unwraps its result envelope.

## 0.2.2

### Patch Changes

- f84adcc: Fix AI chat hanging forever when an MCP server is slow or its responses are dropped by the transport.
  - MCP servers are now connected in parallel and each connection/tool-load is bounded by a timeout (15s default, configurable per server via `aiChat.mcp[].timeoutMs`). A hanging server is reported as failed and the chat continues with the remaining servers' tools.
  - Patch `@ai-sdk/mcp` to treat SSE events without an explicit `event:` field as `message` events, per the SSE specification. MCP servers behind agentgateway emit bare `data:` frames, which the unpatched client silently dropped — leaving the request promise pending forever and hanging the whole chat request.

- Updated dependencies [f84adcc]
  - @giantswarm/backstage-plugin-gs-node@0.3.1

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

### Patch Changes

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-gs-node@0.3.0

## 0.1.0

### Minor Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
