# @giantswarm/backstage-plugin-plans-backend

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
