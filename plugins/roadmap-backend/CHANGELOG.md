# @giantswarm/backstage-plugin-roadmap-backend

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
- 5337c75: Make roadmap board loads fast: the items cache is now stale-while-revalidate
  with a five-minute TTL (an expired entry is served instantly while one
  background refresh updates it), the default team view is warmed on startup
  and kept warm, field writes patch the cached lists in place instead of
  forcing a full board rescan, and `GET /items/by-issue` resolves an issue via
  one targeted issue->projectItems GraphQL call instead of paginating the
  entire board.
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
