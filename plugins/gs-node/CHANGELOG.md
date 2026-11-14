# @giantswarm/backstage-plugin-gs-node

## 0.6.0

### Minor Changes

- b623ab3: muster's own entry among the connectors shows the logo muster announces, and
  the portal calls the product "Muster".

  - gs-common: `connectorIconOf`, the check a connector's icon passes before it
    goes into an `<img src>`, moves here from the muster plugin (which still
    exports it), and `serverInfoIconOf` picks an icon it accepts from an MCP
    `initialize` result's `serverInfo.icons`: the first without a `theme`, else
    the first of all.
  - gs-node: `MusterMcpClient.serverIcon` reads that icon off the caller's
    cached muster session; it opens no connection of its own where one is open.
  - muster-backend: `GET /server-info` answers `{ icon }`, muster's logo from its
    `initialize` result (muster v5.59.0 or later), as the person. A muster that
    announces none answers `{}`; one that cannot be asked answers
    `{ unavailable: true }`, both with HTTP 200. A token that is missing,
    expired or refused by muster answers 401.
  - muster: `MusterApi.getServerInfo`, the hook `useMusterIcon`, and
    `useConnectorIcon`, the one rule for a connector's logo (muster's own, a
    server's `.status.icon`, a family's representative's). muster's row in the
    Connectors list and its page's header show the logo as an image, and the
    letter tile where there is none; an answer muster could not give is asked
    again within half a minute. The entry's name reads "Muster"
    (`MUSTER_DISPLAY_NAME`), and the plugin's copy calls the product "Muster";
    URLs, links, query keys and server names keep `muster`.

- a05070d: Tool calls from the portal declare MCP URL mode elicitation (protocol 2026-07-28). When muster answers that the person must open a page first, a sign-in to the tool's server or a server's own page such as a credential form, the portal shows it in the consent dialog and sends the call again with the person's answer (accept, decline or cancel). The same page asked by the same server is not asked about again for two minutes. `MusterMcpClient` calls that pass `urlElicitation` run on `@modelcontextprotocol/client` and throw `MusterInputRequiredError` (428) for muster's `input_required` answer. `gs-common` adds the wire types (`MusterInputAnswer`, `MusterUrlElicitation`, `inputRequiredBodyOf`) and now holds `musterServerOfTool`, which `gs-node` re-exports. `MusterApi.callTool` takes an optional `signal`, which also cancels a retry muster holds until a sign-in completes, and a tool's Run shows Cancel while a run is pending.
- ae00960: An installation whose muster the portal cannot reach no longer makes people wait. `ReachabilityCache` reports an endpoint unreachable only after two failed probes in a row (`UNREACHABLE_AFTER_FAILED_PROBES`), so muster's and kagent's `/installations` no longer report a distant installation unreachable for one late answer. muster-backend answers a call to an installation the probe reports unreachable at once with a 503, "not reachable from this portal", without a connection attempt or a warning; the probe allows a muster as long to answer as a call has to connect. gs-node exports `MUSTER_CONNECT_TIMEOUT_MS`, and `MusterUnreachableError` names its `installation`. Connections to muster time out after 5 s instead of undici's 10 s, and the Agent Platform stops asking for the server list of such an installation, reading a list that answered 503 again only after a minute, then less and less often.

### Patch Changes

- 06dfa3d: More muster tool errors get their own status instead of a 500.

  - gs-node: muster's `Tool not found: x`, its answer for a meta-tool's target
    (`describe_tool`), is `tool_not_found` (502) like `tool not found: x`.
    model-manager's `forbidden:` is a refusal (403, out of Sentry), and its
    `no_backend:` the new kind `no_backend` (503). A tool error of no known
    kind stays 500.
  - gs-common: `forbidden` is one of model-manager's refusal codes.
    `MODEL_MANAGER_FAILURE_CODES` and `mcpToolFailureOf` name the failures of a
    whole server, model-manager's `no_backend` for now, next to the refusals.
  - agent-platform: model-manager's `forbidden` reads as a `ForbiddenError` and
    `no_backend` as a `ServiceUnavailableError`, neither retried.
  - backend-common: `no_backend` events are grouped per server in Sentry. A
    server-wide kind whose tool names no server (a meta-tool's missing target)
    is grouped by its message instead of all in one issue.

- Updated dependencies [c775cfb]
- Updated dependencies [d97c11d]
- Updated dependencies [3b65ce4]
- Updated dependencies [694e2ae]
- Updated dependencies [b623ab3]
- Updated dependencies [06dfa3d]
- Updated dependencies [a05070d]
  - @giantswarm/backstage-plugin-gs-common@0.24.0

## 0.5.0

### Minor Changes

- 5bde8bf: Report a Mimir that cannot answer a query to Sentry once, under a fixed title,
  and say on the page when older data is temporarily unavailable.

  `MimirService` logs a Mimir that is down, slow or failing once as a warning
  with a fixed message (`Mimir answered a query with HTTP <status>`,
  `Mimir could not be reached`, or
  `Mimir could not read older data: no healthy store-gateway`), with the
  installation, the status and Mimir's own error text in the metadata, and throws
  the new `MimirUnavailableError`. Its message no longer carries Mimir's body;
  that stays in the warning (`mimirError`, left out of the answer to the
  browser), and a connection error no longer names the query. A query Mimir
  refused (a 4xx other than a refused token: bad PromQL, a range over its limits)
  is an `InputError` (400) with Mimir's text instead, not logged and not retried
  by the frontend. `query({ logFailures: false })` logs at `debug` for a caller
  that handles the failure itself, as the model cost route does. The gs
  backend's `/mimir/query` and `/mimir/query_range` routes answer a
  `MimirUnavailableError` 503 themselves, so the error middleware no longer
  reports it again. A Mimir without a healthy store-gateway answers
  with `error.reason: 'older_data_unavailable'` (`MIMIR_UNAVAILABLE_REASONS` in
  gs-common), and the model cost route answers `older-data-unavailable`.

  gs-node's answer-it-in-the-router pattern is now generic:
  `ReportedServiceUnavailableError` with `reportedErrorHandler()`, which replaces
  `musterUnreachableErrorHandler()` (`MusterUnreachableError` is one), and
  `errorResponseBody()` for a router that answers some other error with the body
  the error middleware would send.

  ui-react adds `MetricsUnavailableAlert` (with a `fallback` for a caller whose
  generic failure is a line of text), `describeMimirFailure` and
  `pickMimirError`, which every place that shows a failed Mimir read now uses: a
  deployment's resource usage and hostnames, a cluster's gateways and node pool
  nodes, the workload status summary, the Usage overview and cost pages, the
  activity heatmap, an agent's and a model's Usage tab, and the cost estimate and
  actual-cost hints.
  `MimirClient` throws a `MimirQueryError` that carries the backend's `reason`.

- 4c53a2b: Name the tool, its MCP server and the installation on a muster tool error, and give each known kind of failure its status: the refusals of agent-manager, model-manager and workspace-manager and muster's refusals of a connector write answer 4xx and no longer reach Sentry, a muster rollout's interruption is logged at info and answered with a 503 the muster, plans and roadmap pages retry, and a timeout (504), a server muster holds no connection to (503) and a missing tool (502) stay reported. Sentry groups muster tool errors by kind and tool, or by server for the kinds that belong to a whole server. The muster pages no longer retry a refusal. platform-capabilities and repositories no longer show muster's own failures as the manager's refusal. `gs-node` adds `MUSTER_TOOL_ERROR_STATUS`, `musterToolErrorKindOf`, `musterServerOfTool` and `markReported`; `gs-common` adds the refusal registry (`mcpToolRefusalOf`, `parseToolErrorCode`). bot-prs keeps offering the marge sign-in for a missing tool or a lost connection.

### Patch Changes

- 10604ae: Report a Muster installation that cannot be reached to Sentry once, as one
  issue per kind of failure instead of one per installation. `MusterMcpClient`
  logs `Muster MCP request failed: <reason>` with the installation in the log
  metadata and throws the new `MusterUnreachableError` (a
  `ServiceUnavailableError`). Every backend router that calls muster answers it
  503 through `musterUnreachableErrorHandler()`, with the body the error
  middleware sends, so the middleware no longer reports the same failure again;
  the plans, roadmap, platform-capabilities and repositories routers no longer
  read its text as one of GitHub's 403, 404 or 429 answers, and the GitHub token
  router logs it at `info`. A lost session that the client re-initializes and
  retries is logged at `info` instead of `warn`, and a warning says so when one
  installation, across all of the backend's muster clients, loses ten sessions
  within ten minutes. The error text the person sees is unchanged, except that
  `list_tools` still being truncated after 20 pages no longer names the
  installation.
- Updated dependencies [36f0927]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5bde8bf]
- Updated dependencies [4c53a2b]
  - @giantswarm/backstage-plugin-gs-common@0.23.0

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
- 55db519: Tool calls that report progress: `MusterApi.callToolWithProgress` hands each `notifications/progress` to `onProgress` as it arrives and rejects with `MusterAnswerCutError` when the answer ends before its result. muster-backend serves it on `POST /call/progress` as newline-delimited JSON (`progress` lines, then one `result` or `error` line); a caller that goes away cancels the call. gs-node's `MusterMcpClient.callToolWithProgress` runs the call on the official MCP SDK (`@modelcontextprotocol/sdk` 1.32.1), restarting its wait on every notification, up to 65 minutes.
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

- c3ec30a: New scaffolder action `gs:oci:tagExists`: checks whether a tag exists in an OCI registry repository and outputs `exists`, so a template can branch on whether a chart version is published. A registry 404 means `false` (gsoci also returns it for a missing repository); any other registry error fails the step. It supports dry runs. `ContainerRegistryService` and `OciRegistryClient` gain the `tagExists` method it uses.
- 103014c: The Version History card and tab list only stable releases by default. A "Show all" switch brings back release candidates and dev builds. Stable means a semantic version without a pre-release part (`isStableVersion` in `gs-common`).

  The backend parses and compares versions with `@giantswarm/semver-ts` instead of npm `semver`, so tags are read the way Flux reads them (Masterminds/semver): `sortVersions` in `gs-node` now also drops tags that are no version, and accepts incomplete ones such as `1.2`. GitHub release tags in the app readiness check are still parsed strictly, so a date-named release is not mistaken for a version.

  `ContainerRegistryService.getTags` without a `limit` now follows the registry's pagination (`Link: rel="next"`), so the version history lists every tag instead of the 100 most recent ones ACR returns on its first page. With a `limit` it stops once it holds that many tags, which for the catalog processors' limit of 500 is a single request. The OCI path now honours `limit` and asks for pages of 1000 tags, as the ACR path asks for 999.

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

- 9d0caee: The avatars route answers 404, an agent without an avatar, when the
  installation serves no avatars (its avatars host has no address, or a route
  that is not the renderer answers 406 because the renderer is off), instead of
  502, and does not ask that installation again for a minute. The portal shows
  the initials either way. A 502 stays for a renderer or gateway in trouble
  (another 4xx, a 5xx, a timeout, something other than a raster image).
  `gs-node` exports `isDnsErrorCode`.
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
- 50c2f49: `MusterMcpClient.callTool` answers a wrapped tool's object `structuredContent` wherever the tool answers one, and its text (parsed as JSON where it is JSON) otherwise. MCP makes `structuredContent` the machine-readable result and the text its rendering: a tool that answers `NewToolResultStructured(data, "3 workspaces")`, a JSON scalar as its text, or no text block at all now reaches `/call` as its data instead of the prose, `3` or an empty body. Tools that answer the same JSON as text and `structuredContent` (muster's own) are unchanged. The Tool explorer, which reads `/call`, shows such a tool's data instead of its prose: for `core_auth_login` the `{authUrl, clientIdMethod}` instead of the sign-in instructions; the server sign-in itself reads both through `callToolWithStructured`. The MCP usage route refuses a prometheus answer that is structured data instead of the text it parses, naming the tool, instead of reading it as zero calls.
- 25fc7da: `MusterMcpClient.listTools` reads every page of muster's `list_tools`, so the agent wizard's Tools step lists the whole catalogue; an organization's MCP server's tools land on its own tile.
- 3198f83: A page polling a muster server's tools while the person holds no grant for it no longer spends their muster sign-ins: muster's `auth_required` answer is reused per person and server until the person signs in or the link lapses, and reaches the browser as a 401 carrying the server and sign-in link instead of a 500.
- cad8b48: Reachability probes (muster's `/installations`, agent-platform's `/kagent/installations`): a probe that ran out of its 3 s budget while the backend's event loop was busy for most of that window -- a pod initialising every plugin at once under a CPU quota -- no longer records the installation as "not reachable from this portal", an answer the backend then served for five minutes and the browser kept for an hour. Such a timeout says nothing about the endpoint (the same endpoint answers the same process in well under a second once it is idle): it is now reported _inconclusive_, nothing is cached, and the next read probes again -- which both frontends do every few seconds while an installation is `'unknown'`. The warm-up moved from plugin initialisation to the backend's startup hook, a negative answer is re-probed after 30 s instead of 5 min, and the gRPC probe closes its HTTP/2 session instead of leaving one idle for 15 minutes per probe.
- 167c24c: A person who holds the workspace-manager grant no longer sees "Sign in to use
  workspaces" in a new portal session. The backend's sign-in hold, kept per
  person, answered a new token's calls with "a sign-in to it is pending for you"
  without asking muster, although muster connects that token's session with the
  person's grant. A new token's held call now first reads its own
  `auth://status` once (a read that starts no sign-in) and goes to muster when
  the server reads connected. The sign-in card reads again whenever muster reads
  the server connected, also when it already did as the card mounted.
- Updated dependencies [9312feb]
- Updated dependencies [21ae39b]
- Updated dependencies [2fa183d]
- Updated dependencies [e5bd97a]
- Updated dependencies [846f143]
- Updated dependencies [cba71a8]
- Updated dependencies [103014c]
- Updated dependencies [0af6fea]
  - @giantswarm/backstage-plugin-gs-common@0.22.0

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
