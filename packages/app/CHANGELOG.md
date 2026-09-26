# app

## 0.41.0

### Minor Changes

- e9a6141: Add the optional `app.rootRedirect` key. When set, `/` redirects to that in-app path (for example `/agent-platform`) instead of rendering the home page; unset keeps the home page, and so does a value that does not start with `/` or that is `/` itself. It lets a single-product deployment land on that product's page without a code change. The home page extension (`page:home`) must stay enabled, since it owns the `/` route.
- a1292a5: The login page signs in through the main OIDC login provider only; the
  `gs.signInProviders` list and its GitHub-provider card are gone. Which Dex
  connector a sign-in lands on is now a deployment choice: the provider's
  `startUrlSearchParams.connector_id` pins the default connector, and
  `gs.signInFallbackProvider` adds a second card that signs in through the same
  provider pinned to another connector (for people the default one cannot
  authenticate). The Giant Swarm OIDC authenticator forwards a `connector_id`
  passed on `/start` to Dex for that request; `gsFallbackSignInAuthApiRef`
  exposes the fallback sign-in API.
- 364fd54: Pin the public frontend config: `frontendVisibility.test.ts` enumerates every
  frontend-visible path of the app's merged config schema and compares it with
  the committed `frontendVisiblePaths.golden.json`, so a new field, plugin or
  dependency bump that widens what the unauthenticated `index.html` carries
  fails CI until the golden file is regenerated and the diff reviewed. The same
  test refuses `@deepVisibility frontend` in every `config.d.ts` of the
  repository; the app's own schema annotates the theme colors, the Sentry and
  the TelemetryDeck fields one by one instead.
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

- 0a21beb: The Grafana dashboards card on entities carrying `grafana/dashboard-selector`
  is disabled by default and enabled per portal through `app.extensions`
  (`entity-card:catalog/grafana-dashboards: true`). The card works only where the
  plugin is wired, a `proxy.endpoints` entry at `/grafana/api` with a
  service-account token for the `grafana` host; the section itself is required
  by the plugin's schema on every portal and the annotated team Groups reach every
  portal through the shared catalog, so until now every portal without the proxy
  entry showed `Request failed with 404 Not Found` on every team page. Portals
  that wire the plugin add the switch; everywhere else the team pages show
  neither the card nor the error. Documented in `docs/configuration.md`.
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

- eb337fb: Serve the config the signed-in frontend reads from the authenticated
  `GET /api/gs/config` instead of the public `index.html`.

  The unauthenticated page carried every `@visibility frontend` path, and the gs
  plugin marked whole blocks `@deepVisibility frontend`: the admin groups, the
  cluster token broker URL, the link templates with the fleet's hostnames, the
  friendly labels and annotations, the Kubernetes end-of-life table and the proxy
  knobs were readable by anyone who could reach the portal. They now keep the
  default (backend) visibility and reach the browser once, after sign-in, as one
  payload in app-config shape: `GET /api/gs/config` replaces
  `GET /api/gs/installations` and serves the paths listed in the gs-backend's
  `SIGNED_IN_CONFIG_PATHS`.

  - New `@giantswarm/backstage-plugin-gs-react`: the module-level source of the
    signed-in config, `useSignedInConfig()` for components and
    `getSignedInConfig()` for the utility APIs built at app boot.
  - The gs plugin's `SignedInConfigLoader` (replacing `InstallationsConfigLoader`)
    publishes the payload; `useInstallations` and the boot-time APIs read the
    installations from it; the cluster-access, tools, resources, labels and
    Kubernetes-version views read their keys from it.
  - `@visibility frontend` stays, per field, only on what the sign-in page needs:
    `gs.authProvider`, `gs.auth.scopes`, `gs.auth.extraScopes`, the two sign-in
    cards and `gs.github.brokerAudience` (read when the app constructs its
    GitHub auth API, before sign-in). `@deepVisibility frontend` is gone from
    the gs plugin.

### Patch Changes

- 40e0039: Raise the transitive-dependency CVE `resolutions` to the currently-fixed versions so the High count in the published image is cut substantially (the previous pass cleared all fixable Critical findings but pinned to point-in-time versions that newer CVEs have since flagged). Updated/added pins: `tar` 7.5.11, `undici` v5 line to 6.27.0 and v7 lines to 7.28.0, `axios` v1 line to 1.16.0 and v0 line to 0.32.0, `protobufjs` 7.6.1, `basic-ftp` 5.3.1, `form-data` v2 to 2.5.6 and v4 to 4.0.6, `multer` 2.2.0, `node-forge` 1.4.0, `ws` 8.21.0, `fast-xml-builder` 1.1.7, and `minimatch` (3.x→3.1.4, 5.x→5.1.8, 7.4.x→7.4.8, 9.x→9.0.7, 10.x→10.2.3).
- dcdc3ec: Force fixed versions of vulnerable transitive npm dependencies via yarn `resolutions` to remediate the Critical/High CVEs that dominate the published `giantswarm/backstage` image scan. The OS base (`node:24-trixie-slim`) was already clean; every finding was in the bundled Node.js dependency layer. Pinned: `vm2` 3.11.5, `sha.js` 2.4.12, `protobufjs` 7.5.5, `basic-ftp` 5.2.0, `jsonpath-plus` 10.3.0; `fast-xml-parser` v4 line to 4.5.4 (v5 consumers untouched), `form-data` v2 line to 2.5.4 (v4 already fixed), `path-to-regexp` `~0.1.12` to 0.1.13, `axios` v1 line to 1.8.2, `tar` v6 line to 7.5.3, `undici` v5 line to 6.21.2, and `minimatch` `^10.0.0` to 10.0.3.
- Updated dependencies [b2a4e74]
- Updated dependencies [d93da36]
- Updated dependencies [6c82397]
- Updated dependencies [6c096fb]
- Updated dependencies [60b2c76]
- Updated dependencies [322e58c]
- Updated dependencies [004bdfe]
- Updated dependencies [5859267]
- Updated dependencies [d7b570d]
- Updated dependencies [e62dd24]
- Updated dependencies [f3ab798]
- Updated dependencies [343d4b2]
- Updated dependencies [7b43a16]
- Updated dependencies [244719a]
- Updated dependencies [d6bec76]
- Updated dependencies [e59a84c]
- Updated dependencies [b097034]
- Updated dependencies [dc97358]
- Updated dependencies [37c3eb0]
- Updated dependencies [2494c9a]
- Updated dependencies [0395e2d]
- Updated dependencies [86f7998]
- Updated dependencies [1f3fb8f]
- Updated dependencies [6e0bd9d]
- Updated dependencies [fb7354b]
- Updated dependencies [986b054]
- Updated dependencies [b9433d4]
- Updated dependencies [a1e3699]
- Updated dependencies [b02b541]
- Updated dependencies [b6f72fb]
- Updated dependencies [1698bc1]
- Updated dependencies [91c421b]
- Updated dependencies [2d333a6]
- Updated dependencies [32f943c]
- Updated dependencies [f335a7f]
- Updated dependencies [19d8e11]
- Updated dependencies [48cf35b]
- Updated dependencies [55b2dd9]
- Updated dependencies [247709d]
- Updated dependencies [757d619]
- Updated dependencies [85b1ac8]
- Updated dependencies [9a71810]
- Updated dependencies [551e5d5]
- Updated dependencies [c5b9c46]
- Updated dependencies [7654695]
- Updated dependencies [1a05f26]
- Updated dependencies [7a49e7f]
- Updated dependencies [bff30cb]
- Updated dependencies [a036f84]
- Updated dependencies [335f7fe]
- Updated dependencies [335f7fe]
- Updated dependencies [ab3560e]
- Updated dependencies [7273a37]
- Updated dependencies [3373287]
- Updated dependencies [a776d8b]
- Updated dependencies [c65731d]
- Updated dependencies [30e503d]
- Updated dependencies [bf367f1]
- Updated dependencies [5804cd2]
- Updated dependencies [052624a]
- Updated dependencies [cb06b6c]
- Updated dependencies [e80ae14]
- Updated dependencies [6052701]
- Updated dependencies [fe372f7]
- Updated dependencies [2e38e0b]
- Updated dependencies [4dfd71d]
- Updated dependencies [6b1e119]
- Updated dependencies [573c689]
- Updated dependencies [42f645b]
- Updated dependencies [5b5d408]
- Updated dependencies [335f7fe]
- Updated dependencies [6ab4cbf]
- Updated dependencies [befc0c2]
- Updated dependencies [aa77803]
- Updated dependencies [dfce475]
- Updated dependencies [2aaf08d]
- Updated dependencies [d6bec76]
- Updated dependencies [d6bec76]
- Updated dependencies [e5a5106]
- Updated dependencies [335f7fe]
- Updated dependencies [328ebcb]
- Updated dependencies [6fe3050]
- Updated dependencies [335f7fe]
- Updated dependencies [7715042]
- Updated dependencies [9ea8cf0]
- Updated dependencies [6ce4a71]
- Updated dependencies [c4f3eca]
- Updated dependencies [2c4e7eb]
- Updated dependencies [a021ef9]
- Updated dependencies [e1f1c38]
- Updated dependencies [839cf0a]
- Updated dependencies [f47e1e7]
- Updated dependencies [8bcea5e]
- Updated dependencies [e807fa6]
- Updated dependencies [9e57736]
- Updated dependencies [4f45e35]
- Updated dependencies [88d2fa8]
- Updated dependencies [69eaff0]
- Updated dependencies [54925ab]
- Updated dependencies [3980275]
- Updated dependencies [83cc49a]
- Updated dependencies [fedd5d8]
- Updated dependencies [b30a7fc]
- Updated dependencies [408bdfe]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [85e7d8c]
- Updated dependencies [bf3b759]
- Updated dependencies [3a5d5e3]
- Updated dependencies [293e889]
- Updated dependencies [be7bd04]
- Updated dependencies [8f3cd85]
- Updated dependencies [9602074]
- Updated dependencies [8425eed]
- Updated dependencies [73bc416]
- Updated dependencies [f90366e]
- Updated dependencies [f6f1d50]
- Updated dependencies [464f5ad]
- Updated dependencies [d87fd9d]
- Updated dependencies [4f6d765]
- Updated dependencies [600a4c3]
- Updated dependencies [d0bf6da]
- Updated dependencies [c3409fb]
- Updated dependencies [67a32ef]
- Updated dependencies [9fd228e]
- Updated dependencies [4bcdf2e]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [bebda60]
- Updated dependencies [d82c4c6]
- Updated dependencies [87b1c2e]
- Updated dependencies [3dbde6e]
- Updated dependencies [a1292a5]
- Updated dependencies [6822ed1]
- Updated dependencies [d29ac2a]
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
- Updated dependencies [bbb9e16]
- Updated dependencies [0b2fa7f]
- Updated dependencies [b431a04]
- Updated dependencies [8402eee]
- Updated dependencies [5c82125]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [322e58c]
- Updated dependencies [b2c5996]
- Updated dependencies [4f6d765]
- Updated dependencies [87b1c2e]
- Updated dependencies [b990251]
- Updated dependencies [9e57736]
- Updated dependencies [578b163]
- Updated dependencies [2b14d41]
- Updated dependencies [607d514]
- Updated dependencies [d200952]
- Updated dependencies [578b163]
- Updated dependencies [94a61cb]
- Updated dependencies [28aada8]
- Updated dependencies [ee800aa]
- Updated dependencies [578b163]
- Updated dependencies [7c9e6d6]
- Updated dependencies [c8743f8]
- Updated dependencies [f2cc1f8]
- Updated dependencies [5851bba]
- Updated dependencies [69eaff0]
- Updated dependencies [1642eed]
- Updated dependencies [578b163]
- Updated dependencies [c4a1640]
- Updated dependencies [9a71810]
- Updated dependencies [c1c65ee]
- Updated dependencies [f9644fb]
- Updated dependencies [6205cca]
- Updated dependencies [578b163]
- Updated dependencies [7ff288f]
- Updated dependencies [ff6278b]
- Updated dependencies [578b163]
- Updated dependencies [28aada8]
- Updated dependencies [5f09b20]
- Updated dependencies [e97558c]
- Updated dependencies [c3a9998]
- Updated dependencies [ab9b7a0]
- Updated dependencies [1305e9e]
- Updated dependencies [c604256]
- Updated dependencies [6b18a17]
- Updated dependencies [70eeb29]
- Updated dependencies [92f025f]
- Updated dependencies [65d8d60]
- Updated dependencies [6b3ac77]
- Updated dependencies [2995471]
- Updated dependencies [954a810]
- Updated dependencies [8d67e83]
- Updated dependencies [f90366e]
- Updated dependencies [54ea033]
- Updated dependencies [728d50e]
- Updated dependencies [c482453]
- Updated dependencies [5e9b874]
- Updated dependencies [32f943c]
- Updated dependencies [71d7a44]
- Updated dependencies [5cf5f33]
- Updated dependencies [3383e35]
- Updated dependencies [578b163]
- Updated dependencies [578b163]
- Updated dependencies [f47797c]
- Updated dependencies [28aada8]
- Updated dependencies [28aada8]
- Updated dependencies [b8afa37]
- Updated dependencies [578b163]
- Updated dependencies [578b163]
- Updated dependencies [ca6ffd8]
- Updated dependencies [398c4b1]
- Updated dependencies [d419735]
- Updated dependencies [cd1b0b0]
- Updated dependencies [f14f7ab]
- Updated dependencies [8fe23f0]
- Updated dependencies [d817adf]
- Updated dependencies [fd7799f]
- Updated dependencies [0987634]
- Updated dependencies [0bba1e6]
- Updated dependencies [f2af09f]
- Updated dependencies [aed0b9c]
- Updated dependencies [1ed9e31]
- Updated dependencies [7c5e287]
- Updated dependencies [d63665c]
- Updated dependencies [6909d96]
- Updated dependencies [582faca]
- Updated dependencies [f73f82e]
- Updated dependencies [33a02dc]
- Updated dependencies [221d872]
- Updated dependencies [a69dadf]
- Updated dependencies [ce9e155]
- Updated dependencies [7edb60f]
- Updated dependencies [104f638]
- Updated dependencies [1f00656]
- Updated dependencies [7e92eb9]
- Updated dependencies [5c843a9]
- Updated dependencies [a8bb5a6]
- Updated dependencies [5b036fc]
- Updated dependencies [e8c6d73]
- Updated dependencies [c81464c]
- Updated dependencies [a6c427b]
- Updated dependencies [741669e]
- Updated dependencies [7a6b30e]
- Updated dependencies [564456f]
- Updated dependencies [34d161d]
- Updated dependencies [a7a9a6e]
- Updated dependencies [bfa597e]
- Updated dependencies [f46a45f]
- Updated dependencies [3199a67]
- Updated dependencies [ea1324f]
- Updated dependencies [b6a5641]
- Updated dependencies [93210e4]
- Updated dependencies [f6f1d50]
- Updated dependencies [6ead0ab]
- Updated dependencies [bb9134b]
- Updated dependencies [3c8bcd0]
- Updated dependencies [7a5904a]
- Updated dependencies [b863d7c]
- Updated dependencies [bfe6914]
- Updated dependencies [beda76b]
- Updated dependencies [296a1e0]
- Updated dependencies [d3378b3]
- Updated dependencies [92d42d6]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [bddd1c9]
- Updated dependencies [389a40b]
- Updated dependencies [13e335e]
- Updated dependencies [d7b3983]
- Updated dependencies [4f6d765]
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
- Updated dependencies [14e878c]
- Updated dependencies [90f37c4]
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
- Updated dependencies [d400274]
  - @giantswarm/backstage-plugin-agent-platform@1.0.0
  - @giantswarm/backstage-plugin-kubernetes-react@1.0.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.15.0
  - @giantswarm/backstage-plugin-muster@0.4.0
  - @giantswarm/backstage-plugin-gs@0.71.0
  - @giantswarm/backstage-plugin-ai-chat@0.15.0
  - @giantswarm/backstage-plugin-bot-prs@0.1.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.6.0
  - @giantswarm/backstage-plugin-plans@0.1.0
  - @giantswarm/backstage-plugin-roadmap@0.1.0
  - @giantswarm/backstage-plugin-flux@0.10.0
  - @giantswarm/backstage-plugin-platform-capabilities@0.1.0
  - @giantswarm/backstage-plugin-repositories@0.1.0

## 0.40.7

### Patch Changes

- 3bcae7c: Cluster access is now established for every broker-covered installation on app load, independent of the current route, and the sidebar cluster-access status element is always visible (each installation starts in a new `connecting` state). Proxy requests — including broker token mints — are bounded by a global concurrency limit (`gs.kubernetes.proxyMaxConcurrency`, default 6) so the startup fan-out no longer overwhelms the broker and apiservers with a storm of simultaneous connections that intermittently time out before recovering.
- ff0fdb0: Migrate the example Grafana plugin config from the deprecated `grafana.domain` to the new `grafana.hosts[]` format to silence the deprecation warning.
- Updated dependencies [3bcae7c]
- Updated dependencies [2ed9ab4]
  - @giantswarm/backstage-plugin-gs@0.70.0
  - @giantswarm/backstage-plugin-flux-react@0.14.2
  - @giantswarm/backstage-plugin-flux@0.9.2

## 0.40.6

### Patch Changes

- Updated dependencies [865790a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.16.0
  - @giantswarm/backstage-plugin-gs@0.69.0
  - @giantswarm/backstage-plugin-flux@0.9.1
  - @giantswarm/backstage-plugin-flux-react@0.14.1

## 0.40.5

### Patch Changes

- Updated dependencies [5b7e7ba]
- Updated dependencies [bc88c69]
  - @giantswarm/backstage-plugin-gs@0.68.0
  - @giantswarm/backstage-plugin-ai-chat@0.14.0
  - @giantswarm/backstage-plugin-muster@0.3.0

## 0.40.4

### Patch Changes

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

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-muster@0.2.0

## 0.40.3

### Patch Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
- Updated dependencies [41a2afb]
  - @giantswarm/backstage-plugin-muster@0.1.0

## 0.40.2

### Patch Changes

- 44c9c69: Migrate the Grafana plugin from `@k-phoen/backstage-plugin-grafana` to the actively maintained `@backstage-community/plugin-grafana` (v0.20.0). The exported symbols (`grafanaPlugin`, `EntityGrafanaDashboardsCard`, `isDashboardSelectorAvailable`) and the `grafana.domain` configuration are unchanged, so this is a drop-in replacement with no behavior change.
- Updated dependencies [6aea60f]
  - @giantswarm/backstage-plugin-flux-react@0.14.0
  - @giantswarm/backstage-plugin-flux@0.9.0
  - @giantswarm/backstage-plugin-gs@0.67.0

## 0.40.1

### Patch Changes

- 9f83c43: Stop reporting "Untracked page view" warnings to Sentry for paths that do not match any registered app route. Bot/scanner probes against the public URLs (e.g. `/wp-login.php`) land on the "Not Found" page and previously created noise issues in Sentry. Untracked page views on real app routes are still reported.

## 0.40.0

### Minor Changes

- ac09102: Add PagerDuty integration: "Who is on call" entity card, catalog processor that auto-annotates entities with PagerDuty IDs, and MCP action to resolve PagerDuty IDs from catalog entities.

## 0.39.1

### Patch Changes

- Updated dependencies [02b1923]
- Updated dependencies [9cf3777]
  - @giantswarm/backstage-plugin-ai-chat@0.13.2
  - @giantswarm/backstage-plugin-ai-chat-react@0.5.0
  - @giantswarm/backstage-plugin-gs@0.66.0
  - @giantswarm/backstage-plugin-flux-react@0.13.3

## 0.39.0

### Minor Changes

- fe962ac: Allow customization of theme colors

## 0.38.5

### Patch Changes

- 1ab6877: Replace the `fa fa-kubernetes` Font Awesome icon in `KubernetesVersion` with an inline `KubernetesIcon` SVG component, and remove the now-unused Font Awesome kit integration (script tag, `faIcon` helper, and `use.fortawesome.com` CSP entry).
- Updated dependencies [b01606a]
- Updated dependencies [d9e4112]
- Updated dependencies [b01606a]
- Updated dependencies [1ab6877]
  - @giantswarm/backstage-plugin-ai-chat@0.13.1
  - @giantswarm/backstage-plugin-gs@0.65.1

## 0.38.4

### Patch Changes

- Updated dependencies [3953b15]
- Updated dependencies [3953b15]
- Updated dependencies [3953b15]
- Updated dependencies [3953b15]
  - @giantswarm/backstage-plugin-ai-chat@0.13.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.3

## 0.38.3

### Patch Changes

- 3473759: Avoid flashing the default logo while the branding manifest is loading.
- b47de86: Make sidebar logo image height configurable via `app.branding.logo.height`.

## 0.38.2

### Patch Changes

- 525eedb: Cache-bust custom branding logo URLs by appending the asset's mtime as a `?v=` query string, so replaced logos appear immediately instead of being served stale from the browser cache.
- Updated dependencies [693d573]
- Updated dependencies [0c368e6]
  - @giantswarm/backstage-plugin-ai-chat@0.12.1

## 0.38.1

### Patch Changes

- a240221: Decouple custom branding from the gs-backend plugin. Branding asset serving moves to a dedicated `branding` backend plugin colocated in `packages/backend/src/branding/`, registered unconditionally so it works in deployments without a `gs:` config block. The frontend hook now resolves assets via the `branding` discovery prefix at `/api/branding/*`.

## 0.38.0

### Minor Changes

- 0f6cd54: Add custom branding asset support with logo overrides, allowing organizations to customize UI logos via mounted volumes without code changes.

## 0.37.1

### Patch Changes

- f843e9e: Fix deprecation warning for the user settings General sub-page by migrating
  from the deprecated `config.schema` option to the new top-level `configSchema`
  option using a Standard Schema value from `zod` v4. Adds `zod@^4.3.6` as a
  direct dependency of `packages/app` so the schema resolves against a Zod
  build that includes JSON Schema conversion (the `zod/v4` subpath of Zod v3
  does not).
- 5fc31b3: Fix React "Each child in a list should have a unique key prop" warning
  emitted on the root page by adding a `key` to the scaffolder "Create..."
  `SidebarItem` in the main sidebar.
- Updated dependencies [d8d8e7b]
  - @giantswarm/backstage-plugin-ai-chat@0.12.0

## 0.37.0

### Minor Changes

- 52049ca: Update Backstage to 1.50.2.
- 52049ca: Migrate scaffolder pages to NFS SubPageBlueprint layout.
- 89aa3f2: Use custom X-Backstage-Token header for Backstage identity tokens to avoid conflicts with ingress-level Basic auth on the Authorization header.

### Patch Changes

- 89aa3f2: Allow hiding the Backstage Identity card on the settings general page via extension config.
- 89aa3f2: Use `ProxiedSignInPage` with guest provider as fallback when Dex auth is not configured.
- 89aa3f2: Make sidebar nav items configurable via NFS extensions. Search, catalog, AI chat, and scaffolder sidebar items now respect their extension enabled state. Dividers between groups are only rendered when the group has visible items.

## 0.36.0

### Minor Changes

- b928d80: Add custom review step for scaffolder templates.

### Patch Changes

- Updated dependencies [b928d80]
- Updated dependencies [b928d80]
- Updated dependencies [b928d80]
- Updated dependencies [34f5797]
- Updated dependencies [b928d80]
- Updated dependencies [8a1fbdc]
- Updated dependencies [b928d80]
- Updated dependencies [b928d80]
  - @giantswarm/backstage-plugin-gs@0.65.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.15.0
  - @giantswarm/backstage-plugin-flux@0.8.3
  - @giantswarm/backstage-plugin-flux-react@0.13.2

## 0.35.3

### Patch Changes

- Updated dependencies [fca7f1a]
  - @giantswarm/backstage-plugin-gs@0.64.0

## 0.35.2

### Patch Changes

- Updated dependencies [46094be]
- Updated dependencies [13bfeaf]
  - @giantswarm/backstage-plugin-gs@0.63.0

## 0.35.1

### Patch Changes

- Updated dependencies [c331208]
- Updated dependencies [e7f7b27]
- Updated dependencies [e7f7b27]
  - @giantswarm/backstage-plugin-gs@0.62.0
  - @giantswarm/backstage-plugin-ai-chat@0.11.3

## 0.35.0

### Minor Changes

- 9bd53c6: Add inbound dependency table to component entity page, little title improvements

### Patch Changes

- 8443e6c: Update Backstage to 1.49.3 and fix entity relation cards (Has Components, Has Resources, etc.) showing only one row by forcing deduplication of @backstage/plugin-catalog-react to 2.1.1, which contains the EntityDataTable pagination fix.
- 27a2c97: Add Graph tab with catalog relations graph for system entities.
- Updated dependencies [27a2c97]
  - @giantswarm/backstage-plugin-gs@0.61.3

## 0.34.0

### Minor Changes

- 90343c4: Move route bindings from App.tsx bindRoutes to declarative app-config.yaml for NFS compatibility.

### Patch Changes

- 90343c4: Move ai-chat-verbose-debugging feature flag from app overrides module to the ai-chat plugin.
- 90343c4: Clean up App.tsx: reorganize imports and features by group, move flux overrides to modules directory, remove stale comment.
- 31f7895: Migrate entity pages to NFS composable system, removing legacy EntityPage override and consolidating catalog extensions into NFS modules.
- Updated dependencies [9d911b1]
- Updated dependencies [90343c4]
- Updated dependencies [31f7895]
- Updated dependencies [206058e]
- Updated dependencies [31f7895]
  - @giantswarm/backstage-plugin-gs@0.61.1
  - @giantswarm/backstage-plugin-flux-react@0.13.1
  - @giantswarm/backstage-plugin-ai-chat@0.11.2

## 0.33.0

### Minor Changes

- 0860ea0: Update Backstage to 1.49.2. Migrate test utilities from @backstage/test-utils to @backstage/frontend-test-utils. Add @backstage/cli-defaults. Fix zod v3/v4 resolution, AiChatFab route crash, and TypeScript issues.
- 235dbc4: Refactor NFS migration: extract nav, user settings, scaffolder (page + API), home page, AI chat, kubernetes, api-docs, and app-level overrides into dedicated NFS modules, remove custom search page override in favor of upstream NFS page.

### Patch Changes

- c06f5bf: Replace AI chat floating action button with a sidebar nav item that toggles the chat drawer.
- Updated dependencies [c06f5bf]
- Updated dependencies [0860ea0]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
- Updated dependencies [b5802af]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
- Updated dependencies [584a717]
- Updated dependencies [2fbeb40]
- Updated dependencies [6e7c096]
  - @giantswarm/backstage-plugin-ai-chat@0.11.1
  - @giantswarm/backstage-plugin-gs@0.61.0
  - @giantswarm/backstage-plugin-flux-react@0.13.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.1
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.1
  - @giantswarm/backstage-plugin-flux@0.8.2

## 0.32.2

### Patch Changes

- Updated dependencies [b3e9dd7]
- Updated dependencies [c87b451]
- Updated dependencies [35dc69b]
  - @giantswarm/backstage-plugin-ai-chat@0.11.0
  - @giantswarm/backstage-plugin-gs@0.60.0

## 0.32.1

### Patch Changes

- Updated dependencies [5a216f5]
- Updated dependencies [d7cd901]
  - @giantswarm/backstage-plugin-gs@0.59.1
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.0
  - @giantswarm/backstage-plugin-ai-chat@0.10.0
  - @giantswarm/backstage-plugin-flux-react@0.12.2

## 0.32.0

### Minor Changes

- 9997d4a: Add deployment edit mode with DeploymentPicker and EntityPicker scaffolder fields, EditDeploymentButton on deployment pages, disabledWhenField support across pickers, and hidden template filtering.

### Patch Changes

- Updated dependencies [9997d4a]
- Updated dependencies [9997d4a]
- Updated dependencies [a0aa682]
- Updated dependencies [b1526bc]
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.0
  - @giantswarm/backstage-plugin-gs@0.59.0
  - @giantswarm/backstage-plugin-flux@0.8.1
  - @giantswarm/backstage-plugin-flux-react@0.12.1

## 0.31.3

### Patch Changes

- Updated dependencies [9efa04b]
- Updated dependencies [3e52c89]
  - @giantswarm/backstage-plugin-gs@0.58.0

## 0.31.2

### Patch Changes

- 6f3294a: Fix legacy plugin route refs not discovered in NFS app for github-actions, circleci, and github-pull-requests plugins.
- Updated dependencies [b4e604e]
  - @giantswarm/backstage-plugin-gs@0.57.0

## 0.31.1

### Patch Changes

- 8fc5501: Fix "App context is not available" and missing Grafana API errors on group entity pages. Add `@backstage/core-plugin-api` to yarn resolutions to ensure all plugins use the NFS-compatible version, and register the Grafana legacy plugin API via `ApiBlueprint` in the app module.

## 0.31.0

### Minor Changes

- 668ab64: Migrate GS plugin to New Frontend System (NFS) with PageBlueprint, NavItemBlueprint, and ApiBlueprint. Scaffolder field extensions remain on a temporary legacy compat plugin.
- ad5bd10: Migrate icons, sign-in page, and feature flags from legacy `convertLegacyAppOptions` to NFS extensions. Icons use `IconBundleBlueprint`, sign-in page uses `SignInPageBlueprint`, and feature flags use `createFrontendModule({ featureFlags })`. The `convertLegacyAppOptions` compat bridge is now fully removed.
- 915083b: Migrate routes from legacy FlatRoutes to NFS PageBlueprint overrides. Upstream NFS plugins now provide pages directly, with custom override modules for home, catalog, search, and user settings pages.
- 915083b: Remove EntityKubernetesContent and show-kubernetes-resources feature flag from entity page.
- 2f4aec1: Migrate app-level APIs from legacy createApiFactory to NFS ApiBlueprint modules. All 7 core API overrides (error reporter, analytics, discovery, fetch, SCM integrations, SCM auth, GitHub auth) are now registered via `createFrontendModule({ pluginId: 'app' })` in `appModules.tsx`, replacing the legacy `apis.ts`.
- 915083b: Remove convertLegacyAppRoot compat bridge and migrate sidebar to NFS NavContentBlueprint.
- 915083b: Replace GSFeatureEnabled with NFS config-based extension toggling. Page and nav-item blueprints are now disabled by default and enabled via `app.extensions` in app-config.yaml. Delete FeatureEnabled and MainMenu components from gs plugin.
- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.
- d8aa6f6: Migrate scaffolder to NFS: convert field extensions to FormFieldBlueprint, replace legacy scaffolder route with NFS page override, and remove temporary gsScaffolderPlugin.

### Patch Changes

- ebd466f: Fix API_FACTORY_CONFLICT errors by migrating custom API overrides to NFS frontend modules.
- Updated dependencies [668ab64]
- Updated dependencies [cb36dac]
- Updated dependencies [915083b]
- Updated dependencies [ebd466f]
- Updated dependencies [d8aa6f6]
- Updated dependencies [4ef43b2]
- Updated dependencies [0a0bea4]
  - @giantswarm/backstage-plugin-gs@0.56.0
  - @giantswarm/backstage-plugin-flux-react@0.12.0
  - @giantswarm/backstage-plugin-ai-chat@0.9.0
  - @giantswarm/backstage-plugin-flux@0.8.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.3.0
  - @giantswarm/backstage-plugin-error-reporter-react@0.3.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.13.0

## 0.30.2

### Patch Changes

- Updated dependencies [cd72c54]
- Updated dependencies [4ba7cab]
- Updated dependencies [5850ce3]
- Updated dependencies [cb579b3]
- Updated dependencies [dde73a8]
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.1
  - @giantswarm/backstage-plugin-ai-chat@0.8.0
  - @giantswarm/backstage-plugin-gs@0.55.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.12.0
  - @giantswarm/backstage-plugin-flux@0.7.2
  - @giantswarm/backstage-plugin-flux-react@0.11.1

## 0.30.1

### Patch Changes

- Updated dependencies [24c279b]
- Updated dependencies [bb1a3a4]
- Updated dependencies [d3fd8a5]
  - @giantswarm/backstage-plugin-ai-chat@0.7.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.0
  - @giantswarm/backstage-plugin-flux-react@0.11.0
  - @giantswarm/backstage-plugin-gs@0.54.0
  - @giantswarm/backstage-plugin-flux@0.7.1

## 0.30.0

### Minor Changes

- f09f501: Migrate flux plugin to New Frontend System
- f09f501: Convert app shell to New Frontend System hybrid mode

### Patch Changes

- f09f501: Migrate ai-chat plugin to New Frontend System
- Updated dependencies [f09f501]
- Updated dependencies [f09f501]
  - @giantswarm/backstage-plugin-flux@0.7.0
  - @giantswarm/backstage-plugin-ai-chat@0.6.0
  - @giantswarm/backstage-plugin-gs@0.53.5

## 0.29.0

### Minor Changes

- 7c1ad33: Replace TelemetryProvider with standard Backstage AnalyticsApi implementation for TelemetryDeck

### Patch Changes

- 7c1ad33: Add missing pages to telemetry tracking (Home, Catalog graph, Deployment details, Flux, AI Chat)
- 23e9f63: Extract error reporter API into dedicated package

  **New package: `@giantswarm/backstage-plugin-error-reporter-react`**
  - Provides `ErrorReporterApi` interface and `errorReporterApiRef` for reporting errors to external services
  - Can be used by any plugin that needs to report errors

  **Breaking change in `@giantswarm/backstage-plugin-kubernetes-react`**
  - Removed `errorReporterApiRef` export (now in `@giantswarm/backstage-plugin-error-reporter-react`)
  - Error reporter is now optional: if not registered, only console logging occurs
  - API version issues are now always logged to console in addition to error reporter

  **Changes in `app`**
  - Removed `ErrorReporterProvider` React context wrapper
  - Error reporter is now registered as a standard Backstage API via `createApiFactory`
  - Simplified implementation by merging `SentryErrorNotifier` into `SentryErrorReporter`

- c77afe4: Report "Unknown page" telemetry events as warnings via errorReporterApi so they surface in Sentry
- Updated dependencies [23e9f63]
- Updated dependencies [8e3e4a4]
- Updated dependencies [4166fda]
- Updated dependencies [8e3e4a4]
  - @giantswarm/backstage-plugin-error-reporter-react@0.2.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.0
  - @giantswarm/backstage-plugin-gs@0.53.3
  - @giantswarm/backstage-plugin-flux@0.6.8

## 0.28.1

### Patch Changes

- Updated dependencies [b4b5fc2]
- Updated dependencies [3e3dd4c]
  - @giantswarm/backstage-plugin-kubernetes-react@0.10.0
  - @giantswarm/backstage-plugin-flux@0.6.7
  - @giantswarm/backstage-plugin-gs@0.53.1

## 0.28.0

### Minor Changes

- 7cc2c17: Show icon for entities if giantswarm.io/icon-url annotation is given

### Patch Changes

- Updated dependencies [7cc2c17]
  - @giantswarm/backstage-plugin-gs@0.53.0

## 0.27.0

### Minor Changes

- 2efe3a2: Update Backstage from 1.43.3 to 1.47.3. This update includes new features and improvements from Backstage releases 1.44 through 1.47, including Node.js 22/24 support, Jest 30 compatibility, and various plugin updates.
- 470fceb: Add ability to render APIs of type CRD

## 0.26.3

### Patch Changes

- Updated dependencies [a68a2b2]
- Updated dependencies [d070c3a]
- Updated dependencies [d4b1b9a]
- Updated dependencies [a68a2b2]
  - @giantswarm/backstage-plugin-ai-chat@0.5.0
  - @giantswarm/backstage-plugin-gs@0.52.0

## 0.26.2

### Patch Changes

- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
  - @giantswarm/backstage-plugin-kubernetes-react@0.9.0
  - @giantswarm/backstage-plugin-gs@0.51.5
  - @giantswarm/backstage-plugin-flux@0.6.6

## 0.26.1

### Patch Changes

- Updated dependencies [9fb2244]
- Updated dependencies [31207f3]
- Updated dependencies [ccaf194]
- Updated dependencies [5475c38]
- Updated dependencies [13198eb]
  - @giantswarm/backstage-plugin-gs@0.51.4
  - @giantswarm/backstage-plugin-ai-chat@0.4.0

## 0.26.0

### Minor Changes

- 0384d69: Update ai-sdk packages to v6

### Patch Changes

- Updated dependencies [0384d69]
- Updated dependencies [98f9ffb]
- Updated dependencies [98f9ffb]
- Updated dependencies [009baf6]
  - @giantswarm/backstage-plugin-ai-chat@0.3.0
  - @giantswarm/backstage-plugin-gs@0.51.3
  - @giantswarm/backstage-plugin-flux@0.6.5

## 0.25.1

### Patch Changes

- c9d05b5: Fix react-router version mismatch that caused "useRoutes() may be used only in the context of a Router component" error on Entity pages

## 0.25.0

### Minor Changes

- 1a75706: Add AI Chat plugin.

### Patch Changes

- Updated dependencies [1a75706]
  - @giantswarm/backstage-plugin-ai-chat@0.2.0

## 0.24.0

### Minor Changes

- 4fd2838: Add Helm chart readme overview.

### Patch Changes

- Updated dependencies [4fd2838]
  - @giantswarm/backstage-plugin-gs@0.51.0

## 0.23.0

### Minor Changes

- f665c62: Add Helm chart versions history.

### Patch Changes

- Updated dependencies [f665c62]
- Updated dependencies [f665c62]
  - @giantswarm/backstage-plugin-gs@0.50.0

## 0.22.7

### Patch Changes

- 590fcac: Fix syntax highlighting in the YamlEditor component.
- Updated dependencies [2dfca83]
  - @giantswarm/backstage-plugin-gs@0.49.1

## 0.22.6

### Patch Changes

- b2d62f8: Allow to install only deployable applications.
- Updated dependencies [8812d57]
- Updated dependencies [39eb4f8]
  - @giantswarm/backstage-plugin-gs@0.49.0

## 0.22.5

### Patch Changes

- Updated dependencies [5e8c7e3]
  - @giantswarm/backstage-plugin-gs@0.48.0

## 0.22.4

### Patch Changes

- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-gs@0.47.0
  - @giantswarm/backstage-plugin-flux@0.6.3

## 0.22.3

### Patch Changes

- Updated dependencies [a478023]
- Updated dependencies [a478023]
  - @giantswarm/backstage-plugin-gs@0.46.0

## 0.22.2

### Patch Changes

- Updated dependencies [d6b1c2d]
- Updated dependencies [d6b1c2d]
  - @giantswarm/backstage-plugin-gs@0.45.0
  - @giantswarm/backstage-plugin-flux@0.6.2

## 0.22.1

### Patch Changes

- Updated dependencies [644308d]
  - @giantswarm/backstage-plugin-gs@0.44.0
  - @giantswarm/backstage-plugin-flux@0.6.1

## 0.22.0

### Minor Changes

- 1f347ff: Changed Flux UI default view to resources overview.

### Patch Changes

- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
  - @giantswarm/backstage-plugin-flux@0.6.0
  - @giantswarm/backstage-plugin-gs@0.43.0

## 0.21.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

### Patch Changes

- @giantswarm/backstage-plugin-flux@0.5.2
- @giantswarm/backstage-plugin-gs@0.42.3

## 0.20.1

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.
- 1cf23cb: Removal of the Quay plugin
- Updated dependencies [212cfcb]
- Updated dependencies [212cfcb]
  - @giantswarm/backstage-plugin-flux@0.5.1
  - @giantswarm/backstage-plugin-gs@0.42.2

## 0.20.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-flux@0.5.0
  - @giantswarm/backstage-plugin-gs@0.42.0

## 0.19.1

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-flux@0.4.0
  - @giantswarm/backstage-plugin-gs@0.41.0

## 0.19.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-flux@0.3.0
  - @giantswarm/backstage-plugin-gs@0.40.0

## 0.18.0

### Minor Changes

- 8685deb: Added Flux overview UI.

### Patch Changes

- Updated dependencies [cbdf4f6]
- Updated dependencies [8685deb]
  - @giantswarm/backstage-plugin-gs@0.39.0
  - @giantswarm/backstage-plugin-flux@0.2.0

## 0.17.1

### Patch Changes

- 55b7f9b: Fixed catalog routing issue.
- Updated dependencies [b2171b9]
  - @giantswarm/backstage-plugin-gs@0.38.1

## 0.17.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

### Patch Changes

- dc8295d: Fixed catalog routing.
- Updated dependencies [b4f69e9]
- Updated dependencies [2294710]
  - @giantswarm/backstage-plugin-gs@0.38.0

## 0.16.5

### Patch Changes

- Updated dependencies [46ae127]
- Updated dependencies [7307756]
  - @giantswarm/backstage-plugin-gs@0.37.0

## 0.16.4

### Patch Changes

- Updated dependencies [7eb690b]
  - @giantswarm/backstage-plugin-gs@0.36.0

## 0.16.3

### Patch Changes

- Updated dependencies [bb84af1]
  - @giantswarm/backstage-plugin-gs@0.35.0

## 0.16.2

### Patch Changes

- Updated dependencies [8378d2a]
- Updated dependencies [8378d2a]
  - @giantswarm/backstage-plugin-gs@0.34.0

## 0.16.1

### Patch Changes

- Updated dependencies [5ac83b5]
- Updated dependencies [32f30df]
  - @giantswarm/backstage-plugin-gs@0.33.0

## 0.16.0

### Minor Changes

- e9b3d0f: Use one GS context for the application.

### Patch Changes

- Updated dependencies [e9b3d0f]
- Updated dependencies [e9b3d0f]
  - @giantswarm/backstage-plugin-gs@0.32.0

## 0.15.1

### Patch Changes

- Updated dependencies [d37eb78]
  - @giantswarm/backstage-plugin-gs@0.31.0

## 0.15.0

### Minor Changes

- 4c21763: Added a custom scaffolder client to interact with headless backend instances.
- 4c21763: Added a custom discovery API to interact with headless backend instances.

### Patch Changes

- Updated dependencies [4c21763]
- Updated dependencies [4c21763]
  - @giantswarm/backstage-plugin-gs@0.30.0

## 0.14.1

### Patch Changes

- Updated dependencies [df8b489]
  - @giantswarm/backstage-plugin-gs@0.29.0

## 0.14.0

### Minor Changes

- c3eb724: Delegated unimplemented custom Kubernetes client methods to the standard Kubernetes backend client.

### Patch Changes

- Updated dependencies [c3eb724]
  - @giantswarm/backstage-plugin-gs@0.28.0

## 0.13.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

### Patch Changes

- Updated dependencies [09bae90]
- Updated dependencies [d121c2e]
  - @giantswarm/backstage-plugin-gs@0.27.0

## 0.12.4

### Patch Changes

- Updated dependencies [0126c0d]
  - @giantswarm/backstage-plugin-gs@0.26.0

## 0.12.3

### Patch Changes

- Updated dependencies [763e8fb]
  - @giantswarm/backstage-plugin-gs@0.25.0

## 0.12.2

### Patch Changes

- Updated dependencies [8ff7d5d]
  - @giantswarm/backstage-plugin-gs@0.24.0

## 0.12.1

### Patch Changes

- 58db05e: Fixed how deployments entity content is displayed.
- Updated dependencies [8f11eb3]
- Updated dependencies [93f0340]
  - @giantswarm/backstage-plugin-gs@0.23.0

## 0.12.0

### Minor Changes

- f5731e5: Improved resource entity page layout

### Patch Changes

- Updated dependencies [3c16f4d]
  - @giantswarm/backstage-plugin-gs@0.22.1

## 0.11.3

### Patch Changes

- Updated dependencies [492699f]
- Updated dependencies [492699f]
- Updated dependencies [492699f]
  - @giantswarm/backstage-plugin-gs@0.22.0

## 0.11.2

### Patch Changes

- Updated dependencies [1731002]
- Updated dependencies [2e4b66f]
- Updated dependencies [c43b45a]
- Updated dependencies [e8062d0]
  - @giantswarm/backstage-plugin-gs@0.21.0

## 0.11.1

### Patch Changes

- Updated dependencies [8e45f1b]
- Updated dependencies [d95c4ea]
- Updated dependencies [6c9ae8d]
- Updated dependencies [0423b34]
- Updated dependencies [d95c4ea]
  - @giantswarm/backstage-plugin-gs@0.20.0

## 0.11.0

### Minor Changes

- 1aad32a: Handle cluster creation state.
- 1aad32a: Added custom scaffolder action to apply manifest to a cluster.
- 1aad32a: Added InstallationPicker, OrganizationPicker, ReleasePicker scaffolder fields.

### Patch Changes

- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
  - @giantswarm/backstage-plugin-gs@0.19.0

## 0.10.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

### Patch Changes

- Updated dependencies [f42edd2]
  - @giantswarm/backstage-plugin-gs@0.18.0

## 0.9.3

### Patch Changes

- bfc0a5f: Pinned dependency versions to fix error "useEntityList must be used within EntityListProvider"
- Updated dependencies [bfc0a5f]
  - @giantswarm/backstage-plugin-gs@0.17.3

## 0.9.2

### Patch Changes

- Updated dependencies [2e9eb19]
- Updated dependencies [2e9eb19]
- Updated dependencies [2e9eb19]
  - @giantswarm/backstage-plugin-gs@0.17.0

## 0.9.1

### Patch Changes

- Updated dependencies [733fcf7]
  - @giantswarm/backstage-plugin-gs@0.16.0

## 0.9.0

### Minor Changes

- d431e37: On installations details, show custom CA info and non-standard access docs

### Patch Changes

- Updated dependencies [d431e37]
- Updated dependencies [6ed2cbb]
  - @giantswarm/backstage-plugin-gs@0.15.0

## 0.8.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- f99862c: Refactored how GS Kubernetes API is used.
- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- Updated dependencies [f99862c]
- Updated dependencies [9e6f3c1]
- Updated dependencies [c5d9972]
- Updated dependencies [e06b6cd]
- Updated dependencies [f99862c]
  - @giantswarm/backstage-plugin-gs@0.14.0

## 0.7.1

### Patch Changes

- Updated dependencies [d5e7820]
  - @giantswarm/backstage-plugin-gs@0.13.0

## 0.7.0

### Minor Changes

- 60cf504: Added deployments page.

### Patch Changes

- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [c9d0eb6]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
  - @giantswarm/backstage-plugin-gs@0.12.0

## 0.6.3

### Patch Changes

- Updated dependencies [b5f0dcb]
- Updated dependencies [46fdee2]
- Updated dependencies [055dcb4]
  - @giantswarm/backstage-plugin-gs@0.11.0

## 0.6.2

### Patch Changes

- Updated dependencies [219004e]
- Updated dependencies [20eab6a]
- Updated dependencies [20eab6a]
  - @giantswarm/backstage-plugin-gs@0.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [0bfc102]
- Updated dependencies [9c0d7ac]
  - @giantswarm/backstage-plugin-gs@0.9.0

## 0.6.0

### Minor Changes

- d9b40c8: Add configurable home page.

### Patch Changes

- Updated dependencies [3306938]
- Updated dependencies [d9b40c8]
  - @giantswarm/backstage-plugin-gs@0.8.0

## 0.5.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

### Patch Changes

- Updated dependencies [ca553ba]
- Updated dependencies [5b4002d]
- Updated dependencies [85e6de9]
  - @giantswarm/backstage-plugin-gs@0.7.0

## 0.4.1

### Patch Changes

- 5939854: Fix telemetry user reference for guest users.

## 0.4.0

### Minor Changes

- 3d05628: Use Dex authentication provider for user sign-in.

### Patch Changes

- Updated dependencies [3d05628]
  - @giantswarm/backstage-plugin-gs@0.6.0

## 0.3.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

### Patch Changes

- Updated dependencies [3cd9851]
- Updated dependencies [cebd404]
  - @giantswarm/backstage-plugin-gs@0.5.0

## 0.2.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.
- 06092e9: Add custom Kubernetes and KubernetesAuthProviders APIs to communicate with Kubernetes clusters from client side.
- 06092e9: Add custom OAuth2 implementation for client side OIDC auth providers.

### Patch Changes

- Updated dependencies [f508faf]
- Updated dependencies [06092e9]
- Updated dependencies [06092e9]
  - @giantswarm/backstage-plugin-gs@0.4.0

## 0.1.2

### Patch Changes

- 06c9efc: Fix how GS users are distinguished from customer users.
- Updated dependencies [06c9efc]
  - @giantswarm/backstage-plugin-gs@0.3.1

## 0.1.1

### Patch Changes

- Updated dependencies [e35602f]
- Updated dependencies [291a42f]
- Updated dependencies [291a42f]
  - @giantswarm/backstage-plugin-gs@0.3.0

## 0.1.0

### Minor Changes

- 5c59bf1: Add usage tracking with TelemetryDeck.
- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.

### Patch Changes

- Updated dependencies [b2b5cce]
- Updated dependencies [9aaa464]
  - @giantswarm/backstage-plugin-gs@0.2.0
