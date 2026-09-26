# @giantswarm/backstage-plugin-plans

## 0.1.0

### Minor Changes

- 398c4b1: Migrate the Plans page to the bui design system and share markdown rendering.

  - `ui-react`: add a shared `GSMarkdownContent` component wrapping
    `@backstage/core-components`' `MarkdownContent` with a GFM default and
    consistent typography — matched `<p>`/`<li>` line-height, spacing between
    list items, and padded non-highlighted code blocks (language-tagged blocks
    keep their `CodeSnippet` styling).
  - `plans`: move the Proposed/Merged tabs to bui `Tabs`, relocate the repository
    picker to a bui `Select` in the plugin header (via the shared page-header
    actions slot), and rebuild the proposed/merged/review lists on bui
    `List`/`ListRow`. The Merged tab now renders each plan document in a bui
    `Accordion` (expanded by default), hides dot files/folders and loose
    repository-root documents, strips the redundant folder prefix from document
    titles, and shows friendly labels for well-known files (e.g. `PRD.md` →
    "Product Requirements Document"). Comments, chips (→ `Badge`), alerts and the
    Rendered/Diff toggle move to bui equivalents, and plan/comment markdown now
    renders through `GSMarkdownContent`.
  - `gs`: render the app/chart component README and SOUL cards
    (`CollapsibleMarkdownCard`) through the shared `GSMarkdownContent`.

- cd1b0b0: Plan documents are read and PR comments are written as the signed-in user.
  The plans backend no longer uses the deployment's GitHub App credentials: the
  frontend obtains the user's GitHub token from the portal's `github` auth
  provider (connecting the account on first use) and sends it with every request,
  so comments appear on GitHub authored by the person instead of by a bot account
  with a "via Dev Portal" prefix. Deployments need the `github` auth provider
  configured, and its GitHub App installed on the plan repositories with Pull
  requests and Issues write access.
- 8fe23f0: Add the plans frontend plugin: a `/plans` page for reading and reviewing team
  plan documents from GitHub plan repositories (e.g. bumblebee-plans).

  - **Proposed** tab lists open pull requests; selecting one opens a shareable
    full-width review page (`/plans/pr/<number>`) with a document nav and a
    reading column.
  - The review page's left nav lists an Overview entry (PR description and
    discussion) and each changed document with its title and comment count; the
    reading column renders one document at a time with readable typography.
  - Paragraph-level commenting on rendered documents: hovering a changed block
    shows a comment affordance in the margin, and existing review threads render
    in place under the block they annotate, with replies. Comments are stored as
    regular GitHub review comments anchored to diff lines.
  - A per-document toolbar toggles between the rendered view and the GitHub
    diff (with line commenting), and shows diff stats, file status, and a
    GitHub link. Plan `index.html` files render in a sandboxed iframe.
  - **Merged** tab browses the plan folders on the default branch and renders
    their markdown. YAML frontmatter is split off and shown as a muted block
    instead of being garbled by the markdown renderer.
  - The page and API extensions are disabled by default and must be enabled via
    `app.extensions` app-config, so customer portals are unaffected.

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

- f14f7ab: A comment on a rendered plan document no longer comes back as an empty, still
  open composer when the request fails. The rendered view recreated its block
  components on every re-render, so the review page's own re-render during the
  request remounted the composer: the draft was wiped, the error landed on the
  unmounted form, and nothing told the reader the comment was rejected. The block
  components are now created once and the error (for example GitHub's 403 when
  the Dev Portal's GitHub App lacks pull-request write permission) shows under the
  draft, which stays put.
- fd7799f: Plans: the proposed plans read as a table, one column per fact. The open pull requests of a plan repository were a list whose facts were run together into one line (`#412 · marians · 7 files changed · updated Sep 18, 2026`); they are now a bui `Table` with PR, Author, Status, Last updated, Title and Epic as columns, sortable, newest first. Only a draft is marked — every row is an open pull request, so a badge on the others would say nothing. The changed-file count is gone, and with it the `GET /pulls/:n/files` request the list made per row.

  The author is the person, not their GitHub login: their photo and display name, linking to their catalog User entity. `UserEntityLink`, a new `ui-react` export, composes that from `EntityRefLink`, which resolves the name and degrades to the bare login for an author the catalog does not know (an outside contributor, a bot). The photo comes from a single batched catalog read for the whole table, because `DefaultEntityPresentationApi` fetches a fixed field list that `spec.profile.picture` is not part of and that cannot be extended. Entity refs are lower-cased, since the catalog indexes them that way — a mixed-case login like `QuentinBisson` otherwise matches nothing and renders with neither name nor photo.

  The epic cell is a plain link to the issue number, since the column heading already says Epic; the board status it used to spell out moves into the link's tooltip. `stopRowPress` moves from `agent-platform` to `ui-react` now that other plugins need it, and the epic link stops its own press from reaching the row behind it, so clicking it no longer opens the epic _and_ the plan.

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
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [c5b9c46]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [5c82125]
- Updated dependencies [4f6d765]
- Updated dependencies [94a61cb]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
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
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
  - @giantswarm/backstage-plugin-ui-react@0.9.0
