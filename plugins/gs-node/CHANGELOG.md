# @giantswarm/backstage-plugin-gs-node

## 0.4.0

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
- 8967f50: Backstage's standard GitHub auth API (`githubAuthApiRef`) runs on the person's own
  GitHub grant in muster when `gs.github` is configured -- no GitHub App and no GitHub
  login in the portal. The GitHub Actions and Pull Requests tabs, `ScmAuth` and the
  scaffolder pickers work unchanged with their own GitHub clients; only the token
  source changed.

  - `plugins/gs`: `GSAuthProviders.getGithubAuthApi()` builds `OAuth2` over a
    `GithubGrantAuthConnector` that mints from `POST /api/auth/github-token` with the
    Backstage token and the main Dex ID token, echoes the requested scopes as granted
    (a GitHub App user token carries none) and sets `expiresAt` from the token's
    remaining lifetime, so the session re-mints three minutes before it ends while
    muster refreshes the grant underneath. A person without a grant is sent through
    muster's connect once -- a full-page bounce with `redirect=<current page>` that
    GitHub answers without a prompt for the App already authorized at the Dex login
    -- never the "Login Required" dialog; a bounce that comes back without a grant is
    not repeated. Signing out (`removeSession`) revokes the grant in muster for every
    session and every server of that issuer. `gs.github.brokerAudience` (frontend
    visible) switches the API on; `gs.github.muster` names the installation and
    MCPServer.
  - `plugins/auth-backend-module-gs`: `POST /api/auth/github-token` exchanges the
    caller's Dex ID token through the muster token broker (`gs.clusterTokenBroker`
    credentials, RFC 8693, audience `gs.github.brokerAudience`) for the grant's access
    token, cached per user with 240 s skew; `invalid_target` is disambiguated through
    muster's `core_auth_login` on `gs.github.muster`: a connect that succeeds retries
    the exchange, `auth_required` answers 401 with `reason: no_grant` and muster's
    connect URL, anything else is 502 like the cluster-token route.
    `POST /api/auth/github-token/logout` runs `core_auth_logout`.
  - `plugins/gs-node`: `MusterServerGateway.logout()` (`core_auth_logout`).
  - `packages/app`: the `github-auth` factory uses the GS API when `gs.github` is
    configured and upstream `GithubAuth.create` otherwise; customer portals are
    unchanged.
  - `plans`, `roadmap`: a missing GitHub grant bounces the page through muster's connect
    on its own instead of showing a "Connect GitHub" button and polling a popup; the
    button remains as the fallback when a bounce comes back without a grant.

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

- 0bba1e6: The plans backend reaches GitHub through the muster server gateway shared in
  `@giantswarm/backstage-plugin-gs-node` (`MusterServerClient`, `asConnected`,
  `MusterServerNotConnectedError`) instead of its own copy of it. A caller
  without a GitHub grant now gets the same `401` the roadmap backend answers:
  `error.name: MusterServerNotConnectedError` with `error.server` and
  `error.authUrl` (was `GithubNotConnectedError`). The plans frontend recognises
  that name for its "Connect GitHub" step; its exported error class is renamed
  to `MusterServerNotConnectedError` accordingly.

  `MusterServerGateway` names the MCPServer it fronts (`server`), so backends
  no longer read it off the client by cast.

- d7b3983: The roadmap plugin reads and changes the board through muster as the
  signed-in person; the portal holds no GitHub credential and no bot reads the
  board on the user's behalf. The frontend forwards the user's main login (Dex)
  ID token in `backstage-muster-authorization` on every request, and the
  roadmap backend runs pro's board tools (`list_issues`, `get_board_schema`,
  `get_item_by_issue`, `get_issue_details`, sub-issue and field tools) through
  muster with it (`roadmap.muster: { installation, server, toolPrefix? }`),
  which holds the person's GitHub grant. Board reads are cached per person. A
  person without a grant gets a "Connect GitHub" step (`GET
/api/roadmap/connection`, a 401 `MusterServerNotConnectedError` carrying
  muster's sign-in URL). The `X-GitHub-Token` header, the Backstage `github`
  auth provider and the GitHub App installation token are no longer used by
  the roadmap plugin; the pro library dependency is gone.

  `@giantswarm/backstage-plugin-gs-node` gains the shared
  `MusterServerGateway`/`MusterServerClient`, `readMusterServerRef`,
  `asConnected` and `MusterServerNotConnectedError` for backend plugins that
  run one MCP server's tools through muster on the user's behalf.

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

- 9a71810: The muster MCP client survives a lost MCP session. A stateful streamable-http
  server (agentgateway's MCP proxy in front of muster) forgets a session that was
  idle for its TTL, or that lived on a replica that was rolled, and answers 404
  for the id; the SDK's http transport then clears its id without closing, and
  every later request went out without a session id and was answered 400
  `session header is required for non-initialize requests` until the cache's
  30-minute sweep.

  - A lost session (404 `session not found`, 400 `session header is required`,
    the transport's `onSessionExpired` hook, a closed client) marks the cached
    client dead; the failed tool call runs once more on a fresh client (a new
    `initialize`), transparently. Such a request was rejected before it reached
    the tool, so the retry is safe even for a mutation.
  - The cache recreates a client idle for more than ten minutes (below the
    gateway's 30-minute idle TTL), so a person coming back to a page is not
    handed a client whose session the gateway has forgotten.
  - Transport failures reach the caller in plain words
    (`<installation> did not answer: <reason>`); the SDK's transport text goes
    to the log. A transport 401 passes through unchanged for the sign-in path.

- 32f943c: `MusterMcpClient` throws `MusterToolError` for a tool-level error (`isError`): the message is the tool's first text block as before, its further text blocks travel as `details` — cluster-manager's `delete_node_pool` puts its structured refusal (`{"refused": {nodes, models, hint}}`) in a second block next to the text, which was dropped before.
- e2958de: A first call through muster for a person who never consented to the server
  is refused by muster's aggregator with `failed to connect to server <name>:
user not authenticated to server <name>`. The shared gateway's not-connected
  detection (`looksNotConnected`, used by `asConnected`) did not recognise that
  answer, so the plans and roadmap backends returned it as a `500` instead of
  the `401 MusterServerNotConnectedError` that makes the frontends offer the
  "Connect GitHub" step. It is recognised now: the backend asks muster to
  connect the session (a person who consented before reconnects silently and
  the call is retried), and only a missing consent surfaces as the 401 with
  muster's sign-in URL.
- cad8b48: Reachability probes (muster's `/installations`, agent-platform's `/kagent/installations`): a probe that ran out of its 3 s budget while the backend's event loop was busy for most of that window -- a pod initialising every plugin at once under a CPU quota -- no longer records the installation as "not reachable from this portal", an answer the backend then served for five minutes and the browser kept for an hour. Such a timeout says nothing about the endpoint (the same endpoint answers the same process in well under a second once it is idle): it is now reported _inconclusive_, nothing is cached, and the next read probes again -- which both frontends do every few seconds while an installation is `'unknown'`. The warm-up moved from plugin initialisation to the backend's startup hook, a negative answer is re-probed after 30 s instead of 5 min, and the gRPC probe closes its HTTP/2 session instead of leaving one idle for 15 minutes per probe.

## 0.3.1

### Patch Changes

- f84adcc: Fix AI chat hanging forever when an MCP server is slow or its responses are dropped by the transport.
  - MCP servers are now connected in parallel and each connection/tool-load is bounded by a timeout (15s default, configurable per server via `aiChat.mcp[].timeoutMs`). A hanging server is reported as failed and the chat continues with the remaining servers' tools.
  - Patch `@ai-sdk/mcp` to treat SSE events without an explicit `event:` field as `message` events, per the SSE specification. MCP servers behind agentgateway emit bare `data:` frames, which the unpatched client silently dropped — leaving the request promise pending forever and hanging the whole chat request.

## 0.3.0

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

## 0.2.0

### Minor Changes

- 610ead0: Add `LatestOciReleaseProcessor` that annotates `Component` entities carrying `giantswarm.io/helmcharts` with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` from the referenced OCI registry. For multi-chart entities the highest-semver stable tag wins; prerelease tags are skipped. Toggle via `catalog.processors.latestOciRelease.enabled`.

  Introduce a new `@giantswarm/backstage-plugin-gs-node` node-library package and move the container-registry client code (`ContainerRegistryService`, `AcrRegistryClient`, `OciRegistryClient`, `RegistryAuthClient`, `RegistryError`, registry utils, and `containerRegistryServiceRef`) into it so it can be shared between `gs-backend` and the catalog module. Move `parseChartRef` from `plugins/gs` to `gs-common` so it can be used backend-side.
