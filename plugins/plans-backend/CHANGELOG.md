# @giantswarm/backstage-plugin-plans-backend

## 0.2.0

### Minor Changes

- c9bff16: File reads (`/content`) are shared by every backend instance: each person's
  reads are kept in the plugin's database (`plans_content_reads`) behind each
  instance's own copy, so a person's second read of a plan or magazine file is
  warm on whichever replica serves it. An instance's copy is served for 5 s at
  most before the database is asked again, and a read is stored only if no
  newer one is, so a changed file read anew on one replica replaces the copy on
  every replica, and an older read finishing late never brings the old content
  back. A read made with one person's GitHub grant is never served to another;
  when the database fails, reads come from GitHub as on a cold start. Reads
  older than an hour are pruned hourly.

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

- 8fe23f0: Add the plans backend plugin: a thin REST proxy over the GitHub API for plan
  repositories, consumed by the plans frontend plugin.

  - Routes for open pull requests, changed files with patches, git trees, and
    base64-decoded file content.
  - Read/write routes for PR discussion comments and inline review comments.
    Comments are written with the GitHub App identity and prefixed with the
    Backstage user for attribution.
  - Repositories are config-driven via `plans.repositories` (owner/repo slugs);
    only configured repositories are served, and endpoints return 503 when none
    are configured.
  - GitHub access uses the deployed GitHub App credentials via the standard
    `integrations.github` config. All routes require a Backstage user.

- cd1b0b0: Plan documents are read and PR comments are written as the signed-in user.
  The plans backend no longer uses the deployment's GitHub App credentials: the
  frontend obtains the user's GitHub token from the portal's `github` auth
  provider (connecting the account on first use) and sends it with every request,
  so comments appear on GitHub authored by the person instead of by a bot account
  with a "via Dev Portal" prefix. Deployments need the `github` auth provider
  configured, and its GitHub App installed on the plan repositories with Pull
  requests and Issues write access.
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

- 59e31d6: Add the product magazine: a Magazine page at `/product` (extension `page:plans/magazine`) with Now, History (3 days, 3 weeks, 3 months) and Knowledge views, read from the repository in `plans.magazine` through the plans backend, and a Product group in the sidebar with Plans, Roadmap and Magazine.
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
- b625fce: `/content` keeps each person's file reads for 60 seconds per repository, ref and path, so a repeated load of a plan or of the Magazine's History answers without another GitHub read through muster. Concurrent reads share one call, a failed read is not kept, and a ref that moves on is read again once its entry expires. The tree cache and the content cache share one TTL cache helper.
- d419735: Surface GitHub errors on plan comment writes and make comment threads stand out.

  - The backend proxy no longer collapses every non-2xx GitHub response into an
    opaque 500. A GitHub 403 (typically the GitHub App missing `Pull requests` /
    `Issues` write permission) is now mapped to a `NotAllowedError` (HTTP 403) and
    GitHub's own message (e.g. "Resource not accessible by integration") is
    included, so the reply form shows an actionable error instead of a generic
    failure. As a 4xx it also stops being reported to Sentry as a server fault.
  - Review threads and the PR discussion now render inside a single primary-colored
    box (with a left accent) instead of blending into the page, so each
    conversation reads as one unit.

- f2af09f: The Merged tab of the Plans page no longer fails with `429 too many requests`
  from GitHub's hosted MCP server. The plans backend reads a branch's tree in
  one `get_repository_tree` call (the GitHub MCP server's `git` toolset, which
  the hosted server serves when the muster MCPServer sends
  `X-MCP-Toolsets: default,git`) instead of walking the repository one
  directory listing per folder, every folder of a level in parallel, twice per
  page load — about 250 calls for a repository of a hundred folders, a burst
  the hosted server refused. One tree fetch per repository and ref is shared by
  the tree and epics routes, concurrent requests included, and kept for a
  minute. A refused pace is answered as `429` with
  `error.name: TooManyRequestsError`, and the page does not retry it.
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
