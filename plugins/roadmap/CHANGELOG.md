# @giantswarm/backstage-plugin-roadmap

## 0.1.0

### Minor Changes

- 3cea21c: Add Hive (`/hive`), one sidebar entry that merges Plans, Roadmap and the product magazine: routed tabs Now, History, Roadmap, Plans and Knowledge, with the team and the search in the page header. History shows the last three weeks, epic by epic. Hive takes over the extension id `page:plans`, so a portal that enabled the Plans page shows Hive. `/plans` (extension `page:plans/plans-redirect`), `/roadmap` (`page:roadmap`) and `/product` (`page:plans/magazine`) redirect into Hive with their paths and parameters. `plans.fixtures` and `roadmap.fixtures` serve built-in fixtures for local development.
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

- 13e335e: Add the roadmap frontend plugin: a `/roadmap` page over the GitHub Projects
  roadmap board, served by the roadmap-backend plugin.

  - **Board** view renders the status lifecycle as columns (Inbox → Backlog →
    Up Next → In Progress → Validation → Done), filterable by Team, Kind,
    Quarter, Availability, and keyword. Cards move between columns by drag
    and drop or a per-card status menu, with an optimistic in-place move.
  - **Team activity** view shows who is working on what: In Progress and
    Validation items grouped by assignee, unassigned in-flight work called
    out explicitly, per-status counts, and items updated in the last week.
  - **Item detail** page (`/roadmap/items/<id>`) renders the issue body and
    comments, board fields editable inline (single-select, iteration, and
    date fields from the board schema), and the sub-issue tree with
    link/unlink.
  - Reads go through the backend's shared GitHub App token. Writes send the
    caller's per-user GitHub OAuth token (from the portal's existing
    `githubAuthApiRef` session) in the `X-GitHub-Token` header so board
    mutations are attributed to the person; the classic `project` scope
    Projects v2 mutations need is requested incrementally on the first write.
  - The page and API extensions are disabled by default and must be enabled
    via `app.extensions` app-config, so customer portals are unaffected.

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

- 9c0ba49: Report meaningful portal actions through Backstage's analytics API: a new
  `analytics-react` library with the typed event list and `useTrackedMutation`.
  Creating an agent (`AgentPlatform.agentCreated`), starting a session
  (`AgentPlatform.sessionStarted`) and registering an MCP server
  (`Muster.mcpServerAdded`) are tracked; every other write opts out explicitly.
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

- 4114dde: A page whose first read failed no longer says "No items" while the retry
  waits for the tab to come back to the foreground: it shows its loading state
  until the retry answers, then the data or the error. `isAwaitingData` in
  `ui-react` is the shared check (no data yet, fetching or waiting to retry),
  used in place of react-query's `isLoading`, which is false while a retry is
  paused.
- 65d8d60: Render authored Markdown in the muster and roadmap pages with the shared
  `GSMarkdownContent` component from `@giantswarm/backstage-plugin-ui-react`
  instead of calling `MarkdownContent` directly. This gives the muster workflow
  description and the roadmap item body/comments the same consistent paragraph,
  list, and code-block typography as the Plans page, and drops muster's
  now-redundant local paragraph-styling workaround.
- 0ca1de7: The roadmap board reads its items one status column at a time, all columns
  at once, and shows each column as soon as its read lands: a team's board of
  well over a thousand items no longer waits about a minute on one sequential
  read, and the all-teams board no longer runs into the gateway's two-minute
  timeout. A failed column says "not loaded" next to the error, and a read that
  waits while the tab is in the background shows its progress bar instead of
  "No board items". `/items` takes `empty=<field>` for the items without a value
  in that field, and the backend logs how long each board read took.
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [c5b9c46]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [1e1e0e3]
- Updated dependencies [9c0ba49]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [9e00143]
- Updated dependencies [f905068]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [66ac70b]
- Updated dependencies [5c82125]
- Updated dependencies [4f6d765]
- Updated dependencies [4114dde]
- Updated dependencies [56d8c05]
- Updated dependencies [94a61cb]
- Updated dependencies [7b63a47]
- Updated dependencies [6b3ac77]
- Updated dependencies [4aa60ba]
- Updated dependencies [b8afa37]
- Updated dependencies [398c4b1]
- Updated dependencies [22b2ad6]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [b9aff1b]
- Updated dependencies [fd05081]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
- Updated dependencies [1893681]
- Updated dependencies [0bed874]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [2e425c5]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [322e58c]
- Updated dependencies [0d6360e]
- Updated dependencies [d19ad0c]
- Updated dependencies [b990251]
- Updated dependencies [9e57736]
- Updated dependencies [d95e52d]
- Updated dependencies [ff8b3f1]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-analytics-react@0.2.0
