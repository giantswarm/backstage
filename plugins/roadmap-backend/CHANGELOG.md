# @giantswarm/backstage-plugin-roadmap-backend

## 0.2.0

### Minor Changes

- 0181591: Board reads survive restarts and are shared by every backend instance: each
  person's reads are kept in the plugin's database (`roadmap_board_reads`)
  instead of each instance's memory, served stale-while-revalidate as before.
  A person who read the board before gets it at once after a restart or
  rollout, on whichever instance serves them, and a read made with one
  person's GitHub grant is never served to another. A stored read is served
  however old it is while it is refreshed; reads nobody has asked for in 30
  days are pruned hourly.

### Patch Changes

- Updated dependencies [b623ab3]
- Updated dependencies [06dfa3d]
- Updated dependencies [a05070d]
- Updated dependencies [ae00960]
  - @giantswarm/backstage-plugin-gs-node@0.6.0

## 0.1.1

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

- Updated dependencies [10604ae]
- Updated dependencies [5bde8bf]
- Updated dependencies [4c53a2b]
  - @giantswarm/backstage-plugin-gs-node@0.5.0

## 0.1.0

### Minor Changes

- 0987634: Cross-link plans with the roadmap epics they implement, via the
  `**Epic:** [owner/repo#N](url)` PRD header convention.

  - plans-backend: new `GET /epics` endpoint parsing the Epic header out of
    merged plan documents (default branch) and open plan PRs (diff additions),
    cached for five minutes.
  - roadmap-backend: new `GET /items/by-issue/:owner/:repo/:number` endpoint
    resolving a GitHub issue reference to its Projects v2 board item.
  - plans frontend: merged plans and open plan PRs show an epic chip with the
    epic's board Status, linking to the roadmap item detail view (GitHub issue
    fallback when the roadmap plugin is not deployed). The selected merged plan
    now lives in `?plan=`, so plans are deep-linkable.
  - roadmap frontend: the epic detail sidebar links back to the plan(s)
    referencing the epic -- merged plans and open plan PRs ("proposed in
    owner/repo#N") across all configured plan repositories.

- 406698c: Add the roadmap backend plugin: a REST proxy over the GitHub Projects v2
  roadmap board built on the `@giantswarm-io/pro` core library (shared with
  the pro MCP server), consumed by the upcoming roadmap frontend plugin.

  - Read endpoints (board schema, filtered item lists, item detail,
    status/repo overview, sub-issue trees) are served with the deployed
    GitHub App credentials and cached in memory with a short TTL.
  - Write endpoints (board field updates, sub-issue linking/unlinking)
    require the caller's per-user GitHub OAuth token in the `X-GitHub-Token`
    header, so mutations are attributed to the person who made them; the App
    token is never used for writes. Successful writes invalidate the read
    cache.
  - Config: `roadmap.board` selects the pro board and enables the plugin
    (without it the endpoints return 503, so customer portals never serve
    the board); `roadmap.teams` exposes default team scoping to the
    frontend.

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
- 0ca1de7: The roadmap board reads its items one status column at a time, all columns
  at once, and shows each column as soon as its read lands: a team's board of
  well over a thousand items no longer waits about a minute on one sequential
  read, and the all-teams board no longer runs into the gateway's two-minute
  timeout. A failed column says "not loaded" next to the error, and a read that
  waits while the tab is in the background shows its progress bar instead of
  "No board items". `/items` takes `empty=<field>` for the items without a value
  in that field, and the backend logs how long each board read took.
- 5337c75: Make roadmap board loads fast: the items cache is now stale-while-revalidate
  with a five-minute TTL (an expired entry is served instantly while one
  background refresh updates it), the default team view is warmed on startup
  and kept warm, field writes patch the cached lists in place instead of
  forcing a full board rescan, and `GET /items/by-issue` resolves an issue via
  one targeted issue->projectItems GraphQL call instead of paginating the
  entire board.
- 2ccac89: The roadmap board reads every item of a column instead of the first 50: the
  backend asks pro's `list_issues` for every matching item (`limit: 0`), so each
  column's count chip and the team activity view count everything in scope. A
  read pro still cuts short fails the column with an error instead of showing
  part of it, and the read log carries pro's `totalCount` and `hidden` counts.
- 2950a35: The roadmap backend takes the name of the pro MCP server from the muster
  server gateway (`MusterServerGateway.server`) when it asks muster to connect
  the caller, instead of reading it off the client by cast with a `pro`
  fallback. No change in behaviour: the gateway has always named the server.
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
- Updated dependencies [9d0caee]
- Updated dependencies [85e7d8c]
- Updated dependencies [b63373b]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [50c2f49]
- Updated dependencies [25fc7da]
- Updated dependencies [846f143]
- Updated dependencies [55db519]
- Updated dependencies [5851bba]
- Updated dependencies [3198f83]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
- Updated dependencies [c3ec30a]
- Updated dependencies [103014c]
- Updated dependencies [167c24c]
- Updated dependencies [0af6fea]
  - @giantswarm/backstage-plugin-gs-node@0.4.0
