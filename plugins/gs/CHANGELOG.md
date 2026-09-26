# @giantswarm/backstage-plugin-gs

## 0.71.0

### Minor Changes

- 551e5d5: One installation scope for the Agent Platform section. A selector in the page header lists "All installations" (the default) and every installation whose inventory has kagent, muster or KServe, home first, each with its state (signed out, not reachable from this portal, no kagent/muster here); it scopes Agents, Sessions, Models and MCP Servers alike, is kept in `?installation=` and in localStorage under the key the muster picker always used, and is not rendered on a portal that knows one installation. Under "All installations" the three fleet-wide lists query the home installation first and render its rows before any other installation is asked; the others stream in as groups below, each headed by installation name, pipeline and a status line (loading, N items, none here, could not be read, not reachable from this portal). The MCP Servers tab shows the home installation under "All installations" and follows a pinned installation otherwise; its picker pins the shared scope instead of owning one, and no default is written back any more. Detail pages (agent, session, model) carry an installation chip in the header; the New-session composer names the installation in every picker row and in the selected value when the offered agents span more than one installation. The gs plugin exports `useInstallationScope`, `useInstallationScopeUrlSync`, `InstallationScopeSelect`, `applyInstallationScope` and the store (`setInstallationScope`, `INSTALLATION_SCOPE_STORAGE_KEY`, `INSTALLATION_SCOPE_SEARCH_PARAM`, `ALL_INSTALLATIONS`). The agent-platform tabs share one live react-query client. The Model configs list and the Add-model form take their installations from the inventory's kagent installations, home first, instead of every reachable installation.
- fedd5d8: Make Mimir the source of the Agent Platform's usage figures, add estimated
  cost, and split the Usage tab into sub-tabs.

  The Usage tab previously showed only numbers derived from kagent's REST API.
  That could never cover anyone but the signed-in user — kagent's session list is
  `WHERE user_id = <caller>` with no cross-user endpoint — and knew nothing about
  cost, because kagent records none. agentgateway's LLM metrics are gateway-side,
  so they cover every user by construction and carry priced spend.

  The tab now has four views:

  - **Overview** — cost, tokens, model calls, agents and models active, blended
    $/1M tokens and the cache-read share; cost per day stacked by model, tokens
    per day stacked by token type, and the gateway's request duration, error rate
    and 429 count. Every user's traffic.
  - **Cost** — the same metrics broken down by agent and by model, with share of
    spend, $/1M and average tokens per call, plus a table of models the gateway
    cannot price.
  - **Your sessions** — the previous kagent-derived section, now with an
    estimated cost. Only ever the caller's own, which the tab makes structural.
  - **MCP tools** — the section the muster plugin contributes, unchanged. Hidden
    when muster is not registered.

  Two kinds of cost figure, named apart. Per agent and per model it is
  **"Cost"** — measured, priced per call by the gateway from its model catalogue
  as the call happens. Per session it is **"Est. cost"** — the metrics carry no
  session label, so it cannot be read at all: it is kagent's token counts priced
  at an observed $/token over the last 7 days.

  That rate resolves in tiers, and the session detail stat carries a tooltip
  naming which one it used: the **session's own model** where the gateway has
  priced it, then nothing at all when the model is known but unpriced, and only
  when no model is resolvable does it fall back to the agent's or the
  installation's blend. A known model never borrows another model's price — a
  real `claude-opus-5` session read $0.194 against a catalogue price of $0.40
  because it was charged the installation's Sonnet-derived blend, so that case
  now shows `—` with the reason instead of a number that is half right. A model missing from `llmRouting.modelCatalog` contributes no
  cost rather than an error, so anywhere no rate can be derived reads `—` rather
  than `$0.00`, and the "models with no usable price" table says how much is
  uncounted.

  Per-_user_ breakdowns remain impossible: the gateway metrics carry no user
  label.

  Also in this change:

  - `MimirService` gains `queryRange`, exposed as `GET /mimir/query_range` and
    `useMimirRangeQuery` — the Mimir path was instant-query only, so no
    time-series chart could be built on it.
  - The daily charts render one bar per day of the window, zeros included, so a
    young metric cannot draw a single bar across the whole chart; today's bar
    comes from its own instant query over elapsed-time-since-midnight, which is
    real spend so far rather than a part-day extrapolated to a whole one.
  - The five agentgateway metrics are registered in the central metrics registry,
    and `useMimirQuery`/`useMimirRangeQuery`/`useMimirAvailable` are exported from
    the gs plugin so other plugins can query Mimir.
  - `ui-react` gains a validated categorical chart palette (`assignSeriesColors`),
    a `DataBar` component (a number with a proportional bar beneath it, for a
    table column whose rows are worth comparing), and `StackedBarChart` gains
    `showLegend`, `allowDecimalTicks` and `maxBarWidth`.
  - Every numeric column on all four Usage tables carries a data bar, scaled to
    that column's own maximum and coloured per **measure** — so money is the same
    hue everywhere, and the separate hues signal that bars compare rows down a
    column rather than across columns. Error counts take the reserved status red
    rather than a categorical slot.
  - The MCP tools tab's two tables now stack instead of sharing a row: at half
    width the tool-name column wrapped to three lines and the numeric columns
    were too narrow for a bar to be worth reading. Their numeric columns are also
    left-aligned now, matching every other Usage table — bars grow from the
    left.

- 281d787: Show node pool configuration alongside node metrics on a cluster's "Node pools" tab, which previously only answered how a pool was doing and never what it is.

  - Selecting a node pool now opens a tabbed details section: **Configuration** (shown first) and **Nodes**, the latter being the existing per-node metrics table. The active tab lives in the URL next to the pool name (`?name=<pool>&tab=<tab>`), so a specific pool's configuration is linkable. Closing the section clears both parameters, and an unrecognised `tab` value falls back to Configuration rather than rendering an empty section.
  - For **Karpenter** node pools the Configuration tab reads the `KarpenterMachinePool`, which inlines the upstream Karpenter `NodePool` and `EC2NodeClass` specs. This data was already being fetched and discarded — the row only ever used it to print the word "Karpenter".
  - Because a Karpenter pool is a set of constraints rather than a fixed shape, the constraints are presented as a comparison: what the configuration **allows** beside what is **actually running**, one row per constraint. The running side is read from Karpenter's own metrics, which carry `capacity_type`, `arch` and instance labels that `kube_node_labels` does not. It is additive — when those metrics are unavailable, or a pool has no nodes yet, the configuration still renders in full and the running column is omitted rather than shown as zero.
  - The tab is grouped by the questions a reader has rather than by the CRD's field layout: what is running now (node count, and CPU/memory against the pool's limits), what it may provision, when nodes churn (consolidation, expiry, disruption budgets, and the live disruption headroom), and what new nodes look like (AMI, root volume, taints, IAM role).
  - Exclusions are unmistakably exclusions. A `NotIn` requirement renders as "any except" with outlined chips, distinguished by wording and shape rather than colour alone, and a key with no requirement at all reads as "Any" rather than blank — which is Karpenter's actual behaviour.
  - The **Scaling** column now shows a Karpenter pool's real CPU/memory limits, or "Unlimited", in place of the uninformative literal "Karpenter-managed".
  - AWS autoscaling-group and Azure node pools get the same tabbed section with a correspondingly briefer Configuration tab, so it behaves consistently whichever row is selected.
  - An AWS installation that does not serve the Karpenter CRD no longer raises an error banner on this tab; a 404 there is a legitimate installation shape, not a fault.
  - `ui-react`: new shared `FactList` — a compact list of label/value pairs laid out as horizontal rows separated by hairline rules, rendered as a `dl`/`dt`/`dd` so the pairing reaches assistive technology. The existing shared primitives (`ContentRow`, and `StructuredMetadataList` by default) stack a label _above_ its value, which is what made these detail cards several times taller than their content.
  - `kubernetes-react`: `KarpenterMachinePool` gains configuration accessors (requirements, limits, weight, disruption and budgets, expiry, taints, node labels, AMI family and selector terms, block device mappings, kubelet, metadata options, IAM role, provider IDs, status conditions) plus exported types for the inlined `NodePool` and `EC2NodeClass` specs.

- 4f6d765: Explain an installation whose inventory probe was refused, and stop re-probing it.

  The installation inventory (`GET /apis` per installation) decides which
  installations the Agent Platform tabs query. When the API server rejected the
  person's token (401 -- the ID token carried no audience it accepts) or refused
  the read (403), the installation silently dropped out of every tab, and the
  probe was re-run on every mount of the hook: one rejected token showed up as ten
  `401 GET /api/kubernetes/proxy/apis` per page load.

  - The probe fails with an `InventoryProbeError` carrying the status and the
    reason; `isInventoryAuthError` tells a 401/403 apart from a failure worth
    retrying. A refused probe is not re-run on mount (`retryOnMount: false`); an
    explicit `refresh()` and an installation turning healthy again still re-run it.
  - `selectInventoryFailure` / `classifyInventoryFailure` / `inventoryFailureCopy`
    name the failure a section has to explain (the pinned installation's, or the
    home's) and word it: a rejected token offers the sign-out (a silent refresh
    cannot repair it), a refused or failed read offers a retry.
  - `InventoryFailureGate` renders that as the muster-style gate;
    `InstallationInventoryGate` reads the section scope and the inventory itself,
    for a tab to drop in next to its scope note.

- 600a4c3: Let the sidebar Cluster access widget narrow the Agent Platform section.

  Switching an installation off in the widget now removes it from the
  installation selector in the Agent Platform page header, and the section stops
  probing it: no `GET /apis` inventory read, and nothing on the Agents, Sessions,
  Usage, Models or MCP Servers tabs queries it. Until now the fan-out already
  skipped a switched-off installation, but the selector kept offering it — the
  inventory answer is cached for an hour and survives the switch — so pinning it
  emptied the whole section with nothing on the page saying why.

  An installation pinned in the selector and then switched off falls back to
  "All installations" rather than leaving every tab blank; the pin is cleared
  from the URL and from local storage too. Switching an installation back on
  brings it straight back, from the cached answer, while a background read
  confirms what it runs.

  Switching every installation off now reports an empty scope instead of leaving
  the tabs loading indefinitely.

  The Clusters page no longer records cluster-access status for a switched-off
  installation. A cluster list already in flight when the switch was flipped used
  to resolve afterwards and report the installation healthy again, quietly undoing
  the switch until it was toggled a second time.

- 67a32ef: Add an **RBAC tab** to the cluster details page, giving customers an overview of
  who can do what in a cluster.

  The tab groups every RoleBinding and ClusterRoleBinding by subject, so each row
  is one user, group or service account with the roles it holds and where they
  apply (cluster-wide and/or per namespace). Expanding a row lists the individual
  bindings behind the summary. Subjects whose name starts with `system:` (or whose
  service-account namespace starts with `kube-`) are hidden behind a "Show system
  subjects" toggle, so the Kubernetes control-plane plumbing does not drown out
  the grants customers actually manage. The table's filter box searches subjects,
  roles and scopes.

  The tab only appears on **management cluster** pages: Backstage's Kubernetes
  access terminates at the management clusters, so a workload cluster's own RBAC
  (which lives inside the workload cluster) is not reachable — showing the
  management cluster's bindings on a workload cluster page would be wrong rather
  than helpful. Listing role bindings cluster-wide also requires read access the
  viewer may not have; a denied request surfaces as the usual errors banner plus
  an empty-state message that names permissions as a likely cause.

  `kubernetes-react` gains `RoleBinding`, `ClusterRoleBinding`, `Role` and
  `ClusterRole` resource classes (`rbac.authorization.k8s.io/v1`) with
  `RbacSubject`/`RbacRoleRef`/`RbacPolicyRule` types. `Role`/`ClusterRole` are not
  fetched by the tab yet — they are there for the natural next step of showing a
  role's rules.

- d82c4c6: Add a "Gateways" tab to the deployment detail page listing the hostnames
  exposed via Gateway API HTTPRoutes, together with their serving TLS
  certificates.

  - New tab shows a table of hostnames (from the
    `gatewayapi_httproute_hostname_info` metric, scoped to the workload's target
    namespace), each linking to `https://<hostname>/`.
  - Each row resolves its serving certificate by walking the Gateway API chain
    (HTTPRoute → parentRef → Gateway listener → cert-manager Certificate, matched
    by the conventional `gateway-<gateway>-<listener>` name) and shows readiness
    and expiry, color-coded by severity. Issuer, certificate name/namespace and
    the matched host pattern are available behind an info tooltip.
  - The deployment "About" card now shows the workload's target namespace when it
    differs from the HelmRelease/App namespace.

- a1292a5: The login page signs in through the main OIDC login provider only; the
  `gs.signInProviders` list and its GitHub-provider card are gone. Which Dex
  connector a sign-in lands on is now a deployment choice: the provider's
  `startUrlSearchParams.connector_id` pins the default connector, and
  `gs.signInFallbackProvider` adds a second card that signs in through the same
  provider pinned to another connector (for people the default one cannot
  authenticate). The Giant Swarm OIDC authenticator forwards a `connector_id`
  passed on `/start` to Dex for that request; `gsFallbackSignInAuthApiRef`
  exposes the fallback sign-in API.
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

- e9a6141: Drive the OIDC scopes of the Giant Swarm login providers from `gs.auth.extraScopes`, so the portal can run against an issuer other than Dex.

  Every provider requests the fixed set `openid profile email groups offline_access`, plus whatever `gs.auth.extraScopes` lists. The Dex-specific `federated:id` and `audience:server:client_id:dex-k8s-authenticator` scopes are no longer compiled in and have no default.

  A Dex deployment must set both explicitly:

  ```yaml
  gs:
    auth:
      extraScopes:
        - federated:id
        - audience:server:client_id:dex-k8s-authenticator
  ```

  Without `federated:id` the sign-in resolver falls back to the email of the token and the connector-based catalog lookups stop running. Without the cross-client audience scope, a service that trusts the `dex-k8s-authenticator` audience rejects the token the portal forwards to it, which takes the AI chat muster server and the Muster management UI with it. A deployment on Keycloak or Entra ID leaves the key unset.

- 1f1b881: One installation inventory, from one `GET /apis` per installation, tells every Agent Platform tab where its component is installed — home first.

  **gs: `useInstallationInventory()`.** Per `gs.installations` entry the hook yields whether it is the _home_ installation (the one whose `oidcTokenProvider` is the frontend's `gs.authProvider` — the portal's own management cluster on a central portal, the release itself on a standalone install), its cluster-access state, and which platform components it runs: `kagent`, `muster`, `kserve`, `capi`, read from the API group list (`kagent.dev`, `muster.giantswarm.io`, `serving.kserve.io`, `cluster.x-k8s.io`). The home installation is probed first, as a foreground request, the moment its access state is `healthy`; every other installation as a background request (behind foreground page reads) as it turns healthy; an installation that is not healthy is never asked. `installationsWith(component)` lists the installations a tab may query for a component — answered, present and healthy, home first. Also exported: `useHomeInstallation()`, `installationInventoryQueryKey(installation)` (`['gs', 'installation-inventory', 'v1', <installation>]`), `parseApiGroupList`, `isPlatformComponents`, `PLATFORM_API_GROUPS`, `INVENTORY_PROBE_PATH`.

  Answers are cached for an hour and, under the agent-platform QueryClientProvider, persisted to localStorage. The data shape is versioned in the key; a persisted entry of another shape reads as "not answered yet" and is fetched again. `refresh()` re-reads every healthy installation, and an installation turning healthy again after `degraded`, `session-expired` or leaving the status set is re-read on its own. A 403 or 404 on `/apis` is a failed probe with its error, never "no components".

  **agent-platform: the providers follow the inventory.** `AgentsDataProvider` and `ModelConfigsProvider` list CRDs only on `installationsWith('kagent')`; `SessionsDataProvider` intersects the backend's kagent installations with `installationsWith('kagent')` instead of with every reachable installation; `ServingProvider` reads KServe on `installationsWith('kserve')`. On a portal with many installations and few Agent Platform ones this replaces two doomed list requests per installation per tab (404s on `kagent.dev`), one KServe discovery request per installation, and a sessions request — with a broker token mint before it — to every installation the backend derives a kagent URL for, by one `GET /apis` per healthy installation for all tabs together. `useKServeInstallations` is removed (folded into the inventory); `useKServeServingSource` takes the inventory's KServe verdict. `useReachableInstallations` keeps its role as the access filter (used for model-manager, which registers no API group) and orders the home installation first. A single-installation portal behaves as before: its inventory is one entry.

- b431a04: Let users ask the AI chat to explain Flux error messages. ai-chat-react exports a new `buildExplainErrorMessage` prompt builder that embeds a resource's failing condition message plus context (kind, name, namespace, cluster, reason, revision). The Flux resource card's "Troubleshoot with AI" button now sends the actual error message instead of asking the AI to look the resource up, and the HelmRelease conditions card on the deployment details page gets an "Explain this error" button on failing conditions. The buttons render nothing on installations without ai-chat enabled.
- 8402eee: Serve installation configuration (`gs.installations`) from the `gs-backend`
  plugin through a new authenticated endpoint, and load it in the frontend after
  sign-in instead of reading it from static frontend config. The boot-time
  frontend APIs (Kubernetes, discovery, auth) now obtain installation data
  asynchronously from a shared source, and per-installation auth providers
  initialize lazily once the main sign-in completes.
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

- e8c6d73: Show a warning banner on the deployment details page when an ancestor Flux Kustomization is suspended or failing and therefore blocking updates to the deployment. The banner names the topmost blocked Kustomization, shows its Ready condition message, and links to the Flux overview with the resource selected. flux-react exports the new `FluxBlockedByCard` component and the `findKustomizationAncestors`/`findBlockedAncestors` utilities.
- a6c427b: Show release readiness in the component catalog, from the
  `giantswarm.io/readiness` label `AppReadinessProcessor` writes and the
  chart-metadata verdict `backstage-catalog-importer` publishes.

  - A sortable **Release readiness** column, blocked first — sorting a health
    column should surface what needs attention. Each verdict has a distinct icon
    silhouette via `StatusLabel`, so it survives greyscale, and the hover names the
    release blockers or, where there are none, explains what the verdict means.
    `unknown` is the verdict a reader can least interpret unaided, so it never
    renders as a bare chip.
  - A sidebar filter (`EntityReadinessPicker`), a thin wrapper around the existing
    generic `EntityCheckboxesPicker`, keying on the label because the catalog API
    only filters server-side on labels.
  - A per-component card (`EntityAppReadinessCard`) that keeps three claims apart:
    the release verdict, the chart-metadata verdict
    (`giantswarm.io/readiness-standards`), and advisory gaps. Both verdicts write
    to `giantswarm.io/readiness-flags`, so the card splits that list back apart by
    the flag that owns it — **Blocking the release** versus **Fails a build
    today** — rather than listing them under one claim. Advisory gaps are
    documented in the chart metadata standard but gated nowhere, and four charts in
    five carry at least one, so they sit under **Not enforced** in neutral styling:
    showing them as failures would turn a rollout nobody has run into hundreds of
    broken apps. Each flag carries an explanation in the reader's terms, naming the
    file and the app-build-suite rule that gates it.
  - The card appears wherever there is readiness data from either source, since the
    importer publishes for every component today while the processor ships
    disabled; the column needs the release verdict specifically. The card titles
    itself "Readiness" rather than "Release readiness" when it holds no release
    verdict.
  - New `components/utils/readiness.ts` owns how verdicts are presented — labels,
    intents, meanings, the verdict order, and the release-flag partition — so the
    column, the card and the picker cannot disagree about a verdict's label or its
    place in the order. The release blocker names come from
    `@giantswarm/backstage-plugin-gs-common`, so the processor and the devportal
    cannot disagree about which half of `readiness-flags` a flag belongs to.

- 741669e: Silent re-logins of the main OIDC login provider reuse the Dex connector the
  person signed in with. A sign-in through the login page's fallback card
  (`gs.signInFallbackProvider.connectorId`) is remembered for the browser in
  localStorage (`gs.auth.connector`); the main provider's login popups and
  redirects then carry that `connector_id`, so the re-login popups that AI chat,
  cluster access or muster open once the refresh token is gone land on the
  connector the person can actually use instead of the deployment's default one.
  `/refresh` is untouched. Picking the main card on the login page, or signing
  out, forgets the connector. `SignInConnectorMemory` and
  `LocalStorageSignInConnectorMemory` are exported; `GSAuthProviders` takes an
  optional `signInConnectorMemory`.
- 7a6b30e: Remove Kratix support. Kratix is an unused internal-developer-platform tool being removed org-wide (refs giantswarm/giantswarm#36422). This drops the Kratix status entity card, the Kratix resources entity content tab, the `entityKratixResourcesContent` route, the `isEntityKratixResource` entity helper, the `kratix` components directory (`ResourceRequestsTable`, `ResourceRequestStatus`), and the now-unused `useResourceRequests` / `useResourceRequestStatusDetails` hooks.
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

- 9fab6b1: Uninstall an app from its deployment page. The page header gets an **Uninstall** button next to **Edit**, which confirms and then deletes the `HelmRelease` through the Kubernetes proxy as the signed-in user, so the apiserver decides. The chart's `OCIRepository` goes with it when the deployment owns it (same name and namespace as the release, the shape the deploy flow creates); a source under any other name may feed other releases and stays. The `valuesFrom` ConfigMaps and Secrets stay, and the dialog says so. The button is withheld when a Flux `Kustomization`, a parent Helm release or another tool owns the deployment, because the reconciler would re-create it, and when a `SelfSubjectAccessReview` says the user may not delete it.
- e6ced92: Usage Overview: the Gateway health strip gains **Tokens per second**, the
  platform's output speed over the window.

  It comes from `agentgateway_gen_ai_server_time_per_output_token`, now registered
  in the central metric registry and exported from the gs plugin. The histogram
  observes one value per streamed call — that call's own mean seconds per output
  token — and the query inverts the **median** of those values. Not the mean,
  which is unweighted by reply length: a reply that emitted three tokens after a
  long wait is seconds per token, and a handful of those pulled `graveler`'s
  63 tok/s median down to a reported 2 tok/s.

  Call duration already on the strip is the whole model call, so a long answer
  reads as a slow one; this is the figure that separates the two. It is printed
  to two significant figures, because the gateway's buckets are coarse enough
  that a third digit would be invented, and a platform slower than a token a
  second reads `<1/s` rather than `0/s`. It covers the
  streamed calls only: a reply asked for in one piece observes no per-token time,
  and an installation where nothing streams shows `—` rather than a zero.

  The comments and docs saying the gateway's streaming histograms are
  permanently empty, and that its metrics carry no `user` label, are corrected —
  both claims are false against agentgateway 2.0.0 on `gazelle`. No view breaks
  usage down per user yet.

  Every stat on the Overview — the cost totals and the gateway health strip —
  also gains an info affordance next to its label that says how the figure is
  arrived at: which window, which subset of the traffic, mean or median. `Stat`
  in `ui-react` takes an optional `hint` for it, rendered as a focusable button
  with a bui tooltip rather than a `title`, so the explanation is reachable by
  keyboard.

### Patch Changes

- 6c096fb: Add the agent detail page. Clicking an agent in the list now opens
  `/agent-platform/agents/<installation>/<namespace>/<name>` — all three segments,
  because an `Agent` name is only unique within a namespace on one installation.

  **Read-only.** Editing an agent means changing the values its HelmRelease renders
  from, and deleting one must remove only that release and never the `OCIRepository` a
  namespace's agents share — so neither is a menu item yet, and neither is "Launch
  session".

  Two columns from `lg` up, one below: the **status card takes a third of the width,
  beside the configuration**, and everything under that row spans the full width.
  Status is the one section that does not want the whole page — a rejected spec's
  admission-webhook message is several hundred words of prose, and across a full-width
  card it runs to line lengths nobody can follow. The sections below it do use the
  width: three skill cards per row, four columns in the sessions table.

  The page has seven sections:

  - **Header** — avatar, display name, derived readiness, technical name,
    installation/namespace, creation age, description. A kebab in the shared plugin
    header opens a **manifest dialog** with the Agent CR as read-only YAML, minus
    `metadata.managedFields` (server-side-apply bookkeeping, and the bulk of a
    reconciled Agent) and the `last-applied-configuration` annotation. That dialog is
    the escape hatch for what the page does not surface — `deployment`, `sandbox`,
    `a2aConfig`, labels.
  - **GitOps** — the shared `GitOpsCard`, but only when the agent's desired state
    really is in Git.
  - **Status** — readiness, the controller's explanation, an `UnsupportedFeatures`
    warning when present, a note naming both generations when the status is stale, and
    every condition verbatim. This is what makes a broken agent debuggable without
    `kubectl`, so it leads the page rather than following the configuration.
  - **Configuration** — type, model, installation, namespace, created, the owning
    HelmRelease (linked to its deployment page, where the release's Flux status already
    lives), and the MCP-server and agent tool references. A Muster gateway reference
    links to muster's Tool Explorer with the installation preselected.
  - **System prompt** — copyable. An unset value says so explicitly: the agent still
    has a prompt, just not one configured here.
  - **Skills** — the same card grid the create flow's picker uses, so an agent's
    skills look like the things that were picked, plus the `ref` each is pinned to
    (the picker has no equivalent: it always reads a repo's default branch). Via a new
    read-only `StaticCard` sharing the picker's card shell — deliberately not a
    `SelectableCard` with the indicator hidden, since a `role="checkbox"` button that
    does nothing is announced as operable and invites a click with no effect.
  - **Recent sessions** — the newest few, over a single-installation query sharing the
    Sessions tab's cache key.

  Decisions worth knowing:

  - **No stats strip.** The prototype's sessions all-time / sessions 30d / success rate
    have no data behind them: kagent keeps no per-agent counters and scopes its session
    list to the caller, so each would be a number invented from one person's history —
    wrong by orders of magnitude on a shared agent. Creation age moved into the header
    instead. The sessions section says whose sessions they are, and switches wording on
    an installation whose kagent is not user-scoped rather than claiming ownership it
    cannot.
  - **The agent is fetched directly**, not read out of the list's provider, so a deep
    link works without the list having loaded. It polls on the same two tiers as the
    list (`isAgentConverging` is now shared): 5 s while converging, 60 s once settled or
    durably broken.
  - **The model is read by name in the agent's own namespace**, not through the
    cluster-wide `ModelConfigsProvider` list, which is admin-only — reusing it would
    deny a non-admin the model name on a page they can otherwise read in full. A failed
    read falls back to the bare reference, never to "no model".
  - **A missing agent is a not-found state, not an error**, and the copy covers the
    case where kagent simply isn't installed on that installation.
  - **Rows link with a real anchor** on the agent name as well as a whole-row click, so
    cmd- and middle-click open a new tab and keyboard users have something focusable.
    Not `rowConfig.getHref`: `BUIProvider` is not mounted in this app, so react-aria's
    `RouterProvider` is inactive and a bui `href` would trigger a full page reload. The
    `stopRowPress` guard that keeps both affordances from firing on one click is now
    shared between the agents and sessions tables.

  **GitOps provenance is de-duplicated.** `readProvenance` / `isGitOpsManaged` /
  `provenanceReleaseId` (previously in `muster`) and `isManagedByFlux` with the
  Kustomization label readers (previously in `flux-react`) now live in one module in
  `kubernetes-react`, alongside new `getHelmReleaseName`/`getHelmReleaseNamespace`.
  `flux-react` and `muster` re-export from it, so their public APIs are unchanged.

  The distinction mattered here: `isManagedByFlux` is **false** for a kagent `Agent`,
  which is rendered by a Helm chart and so carries `helm.toolkit.fluxcd.io/*` rather
  than Kustomization labels. `GitOpsCard` therefore gained a hop — with no
  Kustomization label of its own it resolves the owning `HelmRelease` and follows
  _its_ labels to the Kustomization and GitRepository — and now takes any `KubeObject`
  as `resource` instead of an `App`/`HelmRelease` as `deployment`.

  It also stops equating "reconciled by Flux" with "GitOps-managed": where that chain
  ends without a Kustomization it now renders **nothing**. An agent created through
  this plugin is exactly that case, since the create flow applies its `HelmRelease` and
  `OCIRepository` through the scaffolder — Flux reconciles the agent, but no file in
  Git describes it, and saying otherwise sends the reader looking for something that
  does not exist. The "Deployed by" row remains, and is the whole truth for such an
  agent. The gs cluster and deployment pages gate on `isManagedByFlux` and so always
  have a Kustomization already; their behaviour is unchanged.

  **New in `ui-react`: `SimpleAccordion`** — one collapsible section, carrying the
  bottom padding bui's accordion trigger lacks, so an expanded header does not sit
  flush against its panel. Four places had composed bui's accordion primitives
  directly and fixed that locally in three different ways — one of them with a
  selector scoped to the trigger element rather than the button that actually carries
  `aria-expanded`, so it matched nothing. `useSimpleAccordionStyles` exposes the rule
  on its own, for cases needing controlled or exclusive expansion.

  gs's own `SimpleAccordion` is removed in favour of this one — its two call sites
  (the cluster access card and the workload details pane) import from `ui-react`
  directly and gain the spacing they never had. `plans`' `MergedTab`,
  agent-platform's `TimelineEntry` and muster's `DisclosureAccordion` still carry
  their own copies of the fix and could adopt it.

  **New in `ui-react`: `ConditionsList`** — a bui renderer for a resource's status
  conditions. One collapsible entry per condition with its type, satisfaction, relative
  transition time, reason and message; newest transition first, and the first failing
  condition expanded, because that is the one the reader came for. Takes an `isFailing`
  override for abnormal-true conditions (`Stalled`, `UnsupportedFeatures`), where
  `status: True` is the bad news.

- 5859267: Agents list: the agent name gets most of the width, a search field filters by
  name, description and installation, and the intro line above the table is gone.
  A status that needs explaining carries an info icon whose tooltip gives the
  reason, now the unresolved reference itself (e.g. a missing ModelConfig) rather
  than "blocked by ResolvedRefs"; the "on kagent" line under every status is
  dropped. The Installation column is left out when the list comes from one
  installation, Namespace while every agent shares one, and "No tools" reads as
  an absence. A pinned installation without kagent says so with a link to the
  Installations page, and "New agent" is disabled there.

  ui-react adds `InfoHint`, the info icon with a tooltip that `Stat` already
  used. The installation scope selector lists the home installation first and
  the rest by name instead of reshuffling as installations answer, and the gs
  plugin exposes its Installations page as the `installationsPage` route.

- 85b1ac8: Query only confirmed-healthy installations for the Agent Platform fleet lists,
  and stop flagging kagent-absent clusters as read failures.

  - `agent-platform`: `useReachableInstallations` now treats only `healthy` (not
    `connecting`) cluster-access state as reachable, so the agents list and the
    create-flow installation select no longer query or flag known-degraded /
    unreachable installations (the list stops churning wide-then-narrow on load).
    The "couldn't read" card is refined to `errored ∩ currently-healthy`.
  - `agent-platform`: a `404` — the `kagent.dev` API group isn't installed on an
    otherwise-reachable cluster — is treated as a successful empty read. Such an
    installation contributes zero Agents / ModelConfigs and is no longer surfaced
    as "couldn't read"; only `403` (forbidden) and unreachable clusters are
    flagged. Applies to both the agents list and the create flow.
  - `kubernetes-react`: add `isNotFoundError(errorInfo)` to classify a 404
    list/get error, distinct from a 403 or a transport failure.
  - `gs`: raise the cluster-access probe timeout from 2s to 5s so slow-but-healthy
    clusters aren't transiently flagged degraded during load spikes.

- 464f5ad: Migrate the cluster and deployment pages to a single BUI `PluginHeader`.

  - Replace the classic `<Page>`/`<Header>` (blue banner) on the cluster and
    deployment list and detail pages with the BUI `PluginHeader`, and suppress the
    app-shell header (`noHeader`) so the two headers no longer stack.
  - Detail-page tabs move from the classic `RoutedTabs` strip to BUI tabs rendered
    in the plugin header (via a shared `useLayoutTabs` hook), matching the muster
    and flux sections.
  - Header actions are now BUI buttons: the new `AIChatButtonBui` variant and a
    BUI-converted "Edit deployment" button. The troubleshoot state uses BUI's
    `destructive` styling.
  - The dropped header "type" line and the cluster description subtitle now live in
    the respective "About" cards.

  `ai-chat-react` gains a new exported `AIChatButtonBui` component for use in BUI
  contexts; the existing Material UI `AIChatButton` is unchanged.

- d0bf6da: Fix a grey-flicker regression in the sidebar Cluster access widget: muting or
  un-muting one installation reset every other installation's dot back to
  "connecting" (grey) until it re-probed. The connector re-runs its probe effect
  on every muted-set change and was re-seeding all installations to `connecting`
  each time; it now seeds only installations not already tracked, so
  already-resolved (healthy/degraded) clusters keep their state when another
  installation is toggled.
- c3409fb: Make the "Cluster access" sidebar widget cleaner and cover non-broker installations.

  - Compacted the popover: the header now shows a problem-first count summary
    ("1 degraded · 4 healthy", or "All N healthy" when nothing needs attention)
    instead of a single worst-state word, and each installation is a single-line
    row. Healthy/connecting rows drop the redundant status label, while degraded
    and session-expired rows show the reason left-aligned next to the name so the
    list is easy to scan.
  - Surfaced non-broker installations (per-cluster OIDC popup logins), which were
    previously invisible because only broker-covered installations are probed.
    They can't be probed proactively without triggering a login popup, so the
    connector now mirrors their auth session state: an installation appears while
    the user is signed in and drops off on sign-out. Adds a `remove` method to the
    cluster-access status store to support this.

- 9fd228e: Cluster access: a token broker that answers 503 (`temporarily_unavailable`, `service_unavailable` or an empty body) is reported as `broker_unavailable` -- "Token broker is briefly unavailable" in the cluster-access status -- and logged as `Cluster token exchange failed: token broker temporarily unavailable`, apart from the broker's genuine rejections (`exchange_failed`). A broker outage hits every installation at once and clears by itself; it was reported as a rejected exchange for each of them.
- 4bcdf2e: Degrade the Clusters page gracefully on installations without Cluster API.

  A standalone installation with the Clusters page enabled doesn't serve
  `cluster.x-k8s.io` at all. That 404 is now rendered as an empty cluster list
  instead of a permanent error banner, and the sidebar cluster-access status
  treats it as healthy (the apiserver answered authoritatively) instead of
  degraded. Companion to the Deployments-pages change from #2169.

- 86eec55: Add a reusable `CodeBlock` component (`ui-react`) that renders a code block with
  a copy-to-clipboard button, and migrate the `gs` plugin's code blocks to it.

  The copy button is now correctly aligned to the top-right of its code field
  (removing the previous negative-margin workaround), uses a neutral bui
  `ButtonIcon` (`tertiary` variant) instead of the oversized primary-colored
  `CopyTextButton`, and shows a text-sized icon with a "Copy"/"Copied" tooltip and
  check-icon feedback. This fixes the displaced copy button in the "Kubernetes API
  access" and "SSH access" cluster detail boxes.

- 23bfca0: Consolidate the duplicate `ContentRow` components onto the shared `ui-react`
  library.

  - `ui-react`: `ContentRow` now renders bui (`@backstage/ui` `Flex`/`Text`)
    instead of MUI v4, and adopts the proven stacked layout (bold title above its
    value). This fixes the previous inline variant, whose title and value touched
    because it had no gap/separator.
  - `gs`: the `components/UI/ContentRow` duplicate is removed; the `UI` barrel and
    its consumers now re-export/import `ContentRow` from
    `@giantswarm/backstage-plugin-ui-react`.

- 87b1c2e: Degrade gracefully when an installation does not serve an optional API group.

  Standalone installations legitimately run without app-platform
  (`application.giantswarm.io`) or kustomize-controller
  (`kustomize.toolkit.fluxcd.io`). Previously a 404 on API group discovery was
  surfaced as a permanent red error banner on the Deployments pages
  ("Failed to discover API group … Reason: .") and a fallback list query was
  sent that could only 404 again.

  - API version discovery now treats a 404 on `/apis/{group}` as absence: no
    GVK is resolved for that cluster, so no list query is started and the
    resource set is simply empty. The `NotFoundError` remains visible in the
    hook's errors, so callers can still distinguish "not installed" from
    "couldn't read".
  - The Deployments data provider and the Flux "blocked by" card no longer
    report `NotFoundError` through the error banner.
  - Discovery error messages now fall back to the HTTP status code when the
    response carries no reason phrase (HTTP/2), instead of ending in
    "Reason: .".

- 3dbde6e: Stop the Deployments pages from crashing when the Clusters page is disabled.

  With `page:gs/deployments` enabled but `page:gs/clusters` disabled in
  `app.extensions`, the clusters routes are never registered and `useRouteRef`
  returns `undefined`. Four call sites asserted the result non-null and crashed
  the page with `TypeError: t is not a function` when calling it:

  - the Cluster column and the Name column in `DeploymentsTable`
  - the Installation link in `DeploymentAboutCard`
  - the shared `ClusterLink` component (used by the deployment About card and
    the workload details pane)

  These now degrade gracefully: when the target page's route is not registered,
  the cluster (or deployment) is rendered as plain text instead of a link.

- 6822ed1: Stop racing resource requests against API discovery, and render a "Cluster not
  found" state on the cluster details page.

  During the persisted-cache restore window, enabled queries report fetchStatus
  'idle', which the discovery-settled check mistook for "settled": a fallback
  GVK was resolved for one render and the resource request fired alongside
  discovery. On installations that don't serve the API group at all (standalone
  installations without Cluster API or app-platform) that raced request is a
  guaranteed 404 whose error sticks in the query cache even after discovery
  correctly resolves no GVK — the cluster details page rendered it as a
  permanent error banner. Discovery now only counts as settled once its queries
  have produced a result, and the cluster details page shows a "Cluster not
  found" empty state instead of an error when neither the Cluster nor the
  cluster App exists.

- d14ebda: The Cluster access popover opens above its sidebar item in the mobile sidebar,
  where the item is a full-width row in the Menu, instead of to the item's right.
- e807fa6: The README and SOUL entity cards use the shared `CollapsibleMarkdownCard` from
  ui-react; their "Show full …" toggle now reports whether it is expanded to
  assistive technology.
- b79cf20: Drop the custom catalog entity-page header in favour of the upstream Backstage
  UI header.

  Backstage v1.53.0 ships the BUI entity-page header, so the entity page now
  renders the upstream header for every entity. The GS custom header
  (`EntityHeaderBlueprint` wiring plus the `CustomEntityHeader` reimplementation
  and the DOM-injected `EntityHeaderIcon`) has been removed. This gives a
  consistent header across all entities and keeps the upstream context menu
  (Copy URL / Inspect / Unregister) intact. The former GS header icon is dropped;
  the icon still appears next to the entity name in catalog tables and entity ref
  links via the custom entity presentation renderer.

- 5e54675: Stop a single-cluster Kubernetes proxy read from being serialized behind the whole-fleet cluster-access warm-up, which made CRD-backed pages (e.g. the muster dashboard) show a multi-second spinner on a cold first load.

  The headless `ClusterAccessConnector` proactively mints a cluster token and probes `/version` for every broker-covered installation on app load. Those probes shared the `KubernetesClient` concurrency lane with the page's own single-cluster read and were enqueued first, so the foreground read waited for the warm-up to drain (~9s on a 23-cluster fleet, with an unreachable cluster holding a slot for the full 10s default timeout).

  - `KubernetesClient.proxy` now serves foreground (page) reads ahead of background warm-up probes when a concurrency slot frees, so a single-cluster read is no longer queued behind the whole-fleet warm-up.
  - `KubernetesClient.proxy` accepts a per-request `timeoutMs` override; the cluster-access `/version` probe uses a short (2s) timeout so an unreachable cluster releases its slot quickly instead of dominating the tail.

- faaf78e: The installation inventory reports `isProbing` while any installation's cluster-access probe is still `connecting`, even when that installation's inventory answer is already cached from an earlier visit. Such an installation is not listed by `installationsWith` yet (it is not `healthy`), so the Agent Platform tabs had nothing to query for it _for now_ and read that as nothing to load: pinned to an installation other than the home, a cold reload showed "No agents found." for the seconds until its `/version` probe answered. They now keep their loading state until it settles.
- 87b1c2e: Add a per-installation Mimir opt-out: `gs.installations.<name>.mimirEnabled`.

  `baseDomain` alone cannot signal that an installation runs the observability
  stack — standalone installations must set it for other features (e.g. agent
  avatars) while having no Mimir at `observability.<baseDomain>`, so every
  metrics-backed card rendered a permanent error there (e.g. "Workloads (error)"
  with an HTTP 406 from whatever answers that host).

  With `mimirEnabled: false` (default: true):

  - the frontend never sends Mimir queries for that installation,
  - the workload status summary renders a neutral "Workloads (unavailable)"
    state with "Workload metrics are not available on this installation.",
  - the metrics-only cards (Resource Usage, Hostnames and certificates) are
    hidden entirely,
  - the backend Mimir proxy refuses queries for the installation with a 404.

- c81464c: Give each plugin's persisted react-query cache its own localStorage key, with a
  size guard.

  The gs, flux and agent-platform `QueryClientProvider`s all persisted under the
  library's default key `REACT_QUERY_OFFLINE_CACHE`. Every client rehydrated the
  others' entries on restore and wrote them back on its next save, so the three
  caches merged into one blob — 4.9 MB on the Dev Portal, 3.6 MB of it flux
  Kustomization lists — against a per-origin localStorage budget of roughly 5 MB,
  where one quota error would have silently ended persistence for all of them.

  - `kubernetes-react`: new `createPluginQueryPersister({ key, throttleTime?, maxChars? })`.
    Writes under the plugin's key, removes the legacy shared blob, keeps the
    persisted copy under 2 MB by leaving out the oldest queries first
    (`trimPersistedClient`), retries a quota error with the client halved, and
    reads garbage under the key as "nothing persisted" instead of an error per
    mount (`deserializePersistedClient`). The rule from #2264 stands: a new data
    shape needs a new _query_ key, and what is iterated from the cache is guarded.
  - `gs` persists under `gs-react-query-cache`, `agent-platform` under
    `agent-platform-react-query-cache`, `flux` under `flux-react-query-cache`.
    The first load after the upgrade refetches once; reloads after that rehydrate
    as before.

- 564456f: Rename the deployment detail "Gateways" tab to "Routes" (route path
  `/routes`), and rename the underlying `DeploymentGateway` component to
  `DeploymentRoutes` to match.
- 389a40b: Revert `@apidevtools/json-schema-ref-parser` to v15. v16 resolves remote
  `$ref`s through Node-only dynamic imports (`undici`, `node:dns/promises`) that
  the frontend bundle cannot resolve, which failed the app build on every commit
  since the bump.
- a5ec0eb: Explain every figure in the stats strips with an info hint: the session detail
  and session usage totals, the muster dashboard, MCP usage and workflow run
  stats, and the bot PR queue. The workload details pane's replica counts now use
  the shared `Stat` component too, and the session detail and muster dashboard
  strips use the same spacing as the others.
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [d7b570d]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [85b1ac8]
- Updated dependencies [c5b9c46]
- Updated dependencies [1a05f26]
- Updated dependencies [7a49e7f]
- Updated dependencies [a036f84]
- Updated dependencies [a776d8b]
- Updated dependencies [5b5d408]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [21ae39b]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [d87fd9d]
- Updated dependencies [67a32ef]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [87b1c2e]
- Updated dependencies [6822ed1]
- Updated dependencies [d29ac2a]
- Updated dependencies [573b34d]
- Updated dependencies [526dd01]
- Updated dependencies [2c383a6]
- Updated dependencies [b431a04]
- Updated dependencies [5c82125]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [322e58c]
- Updated dependencies [b2c5996]
- Updated dependencies [94a61cb]
- Updated dependencies [c604256]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [ca6ffd8]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
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
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
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
  - @giantswarm/backstage-plugin-kubernetes-react@1.0.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.15.0
  - @giantswarm/backstage-plugin-gs-common@0.22.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.6.0
  - @giantswarm/backstage-plugin-flux@0.10.0
  - @giantswarm/backstage-plugin-platform-capabilities@0.1.0
  - @giantswarm/backstage-plugin-gs-react@0.1.0

## 0.70.0

### Minor Changes

- 3bcae7c: Cluster access is now established for every broker-covered installation on app load, independent of the current route, and the sidebar cluster-access status element is always visible (each installation starts in a new `connecting` state). Proxy requests — including broker token mints — are bounded by a global concurrency limit (`gs.kubernetes.proxyMaxConcurrency`, default 6) so the startup fan-out no longer overwhelms the broker and apiservers with a storm of simultaneous connections that intermittently time out before recovering.

### Patch Changes

- Updated dependencies [2ed9ab4]
  - @giantswarm/backstage-plugin-flux-react@0.14.2
  - @giantswarm/backstage-plugin-flux@0.9.2

## 0.69.0

### Minor Changes

- 865790a: Make broker-backed cluster auth broker-only and surface per-cluster access health in the sidebar.

  Broker-covered kubernetes providers no longer fall back to the cookie `/refresh` or open per-cluster login popups: `createSession`/`refreshSession` mint silently through the muster token broker and, on failure, throw a typed `ClusterTokenError` carrying the installation and a coarse `reason`. The auth backend's cluster-token route now returns that `reason` (`broker_unreachable`, `exchange_failed`, `subject_invalid`) alongside the error. When the main Dex session is gone the connector triggers the single main SSO login automatically (the only popup a broker-backed cluster ever causes).

  A new in-memory `ClusterAccessStatusApi` records per-installation access outcomes (healthy / degraded / session-expired), fed by both the broker token flow and the clusters list, and rendered by a `ClusterAccessStatusSidebarItem` connection-status element with a "Sign in again" action when the main session has expired.

  The clusters list now loads fleet-wide fail-fast: API discovery and list queries are enabled per cluster as each one settles, the k8s proxy bounds each request with a configurable timeout (`gs.kubernetes.proxyTimeoutMs`, default 10s), and the table renders as soon as the first installation resolves instead of freezing on a single unreachable management cluster.

### Patch Changes

- Updated dependencies [865790a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.16.0
  - @giantswarm/backstage-plugin-flux@0.9.1
  - @giantswarm/backstage-plugin-flux-react@0.14.1

## 0.68.0

### Minor Changes

- 5b7e7ba: Mint per-management-cluster tokens silently through the muster token broker instead of per-cluster OAuth popups. The auth backend module gains an authenticated `POST /api/auth/cluster-token/:installation` route that exchanges the user's main Dex ID token (forwarded in the `gs-subject-token` header) for a short-lived cluster token via RFC 8693 token exchange against the broker configured in `gs.clusterTokenBroker`, cached per (user, installation) with expiry-aware re-exchange. The frontend kubernetes auth connectors try this silent path in `refreshSession` before the cookie-based refresh, so broker-covered clusters never open a login popup; the legacy popup remains as fallback when the broker is unreachable or a cluster is not migrated. Installations marked with `gs.installations.<name>.clusterTokenAudience` are considered fully covered and their entries disappear from the provider settings page, collapsing it to the single main login.

## 0.67.0

### Minor Changes

- 6aea60f: Migrate the Clusters, Deployments, Installations, Catalog, and Flux pages to the new frontend system page header (rendered automatically from the page blueprint's title and icon), replacing the classic `Header`/`PageWithHeader` from `@backstage/core-components`.
  - The Flux page's "List view" and "Tree view" are now sub-pages, rendered as tabs in the page header. `/flux` redirects to `/flux/list`; the tree view remains at `/flux/tree`.
  - BREAKING (`@giantswarm/backstage-plugin-flux-react`): the `FluxPageLayout` component has been removed. `FluxListFilterBlueprint` and `FluxTreeFilterBlueprint` extensions now attach to `sub-page:flux/list` and `sub-page:flux/tree` (input `filters`) instead of `page:flux`.
  - The page subtitles on the Clusters and Deployments pages have been dropped, as the new header does not support subtitles.
  - The catalog page title no longer includes the organization name (`organization.name` config); it is now just "Catalog". Installations can override it via app-config: `app.extensions` → `page:catalog` → `config.title`.
  - The `SupportButton` on the Catalog and Installations pages has been removed, as the new header has no place for it.

### Patch Changes

- Updated dependencies [6aea60f]
  - @giantswarm/backstage-plugin-flux-react@0.14.0
  - @giantswarm/backstage-plugin-flux@0.9.0

## 0.66.2

### Patch Changes

- 610ead0: Add `LatestOciReleaseProcessor` that annotates `Component` entities carrying `giantswarm.io/helmcharts` with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` from the referenced OCI registry. For multi-chart entities the highest-semver stable tag wins; prerelease tags are skipped. Toggle via `catalog.processors.latestOciRelease.enabled`.

  Introduce a new `@giantswarm/backstage-plugin-gs-node` node-library package and move the container-registry client code (`ContainerRegistryService`, `AcrRegistryClient`, `OciRegistryClient`, `RegistryAuthClient`, `RegistryError`, registry utils, and `containerRegistryServiceRef`) into it so it can be shared between `gs-backend` and the catalog module. Move `parseChartRef` from `plugins/gs` to `gs-common` so it can be used backend-side.

- Updated dependencies [610ead0]
  - @giantswarm/backstage-plugin-gs-common@0.21.1

## 0.66.1

### Patch Changes

- 87680d7: Fix Helm charts column in the catalog showing "Yes (0)" for entities without charts.

## 0.66.0

### Minor Changes

- 9cf3777: Add "Configure with AI" button to App Deployment template

### Patch Changes

- Updated dependencies [9cf3777]
  - @giantswarm/backstage-plugin-ai-chat-react@0.5.0
  - @giantswarm/backstage-plugin-flux-react@0.13.3

## 0.65.1

### Patch Changes

- 1ab6877: Replace the `fa fa-kubernetes` Font Awesome icon in `KubernetesVersion` with an inline `KubernetesIcon` SVG component, and remove the now-unused Font Awesome kit integration (script tag, `faIcon` helper, and `use.fortawesome.com` CSP entry).

## 0.65.0

### Minor Changes

- b928d80: Add custom review step for scaffolder templates.
- b928d80: Add multi-source value editing for app deployment scaffolder templates:
  - New `GSValueSourcesEditor` field extension: edit multiple `valuesFrom` sources (ConfigMaps/Secrets) with per-source YAML editors, name validation, drag-to-reorder, and merged Helm schema validation
  - New `MultiSourceDeploymentPicker` variant: populates editors from existing HelmRelease `valuesFrom` entries in edit mode
  - Warn when an app deployment is managed through GitOps (read-only notice)
  - Pass `valuesMode` via URL formData so edit templates can distinguish single- vs multi-source flows

### Patch Changes

- 34f5797: Discover app deployment templates by label instead of hardcoded name.
- b928d80: Add `height` and `maxHeight` ui:options to `GSValueSourcesEditor` scaffolder field extension.
- 8a1fbdc: Fix version truncation not working on deployment details page.
- b928d80: Disable Edit Deployment button when deployment structure is incompatible with the edit template (e.g., non-OCIRepository source, mismatched names/namespaces, digest pinning).
- b928d80: Fix YAML block-style autocompletion in CodeMirror editors (patch for codemirror-json-schema).
- Updated dependencies [b928d80]
- Updated dependencies [b928d80]
- Updated dependencies [8a1fbdc]
  - @giantswarm/backstage-plugin-ui-react@0.8.4
  - @giantswarm/backstage-plugin-kubernetes-react@0.15.0
  - @giantswarm/backstage-plugin-flux@0.8.3
  - @giantswarm/backstage-plugin-flux-react@0.13.2

## 0.64.0

### Minor Changes

- fca7f1a: Add authenticated GitHub content fetching for private repositories. Helm chart README, values schema, and values YAML are now fetched through a backend endpoint that adds GitHub credentials, instead of direct unauthenticated browser fetches.

## 0.63.0

### Minor Changes

- 46094be: Add Deployments tab to cluster details page showing apps deployed in that cluster

### Patch Changes

- 13bfeaf: Remove redundant App column from entity deployments table

## 0.62.0

### Minor Changes

- c331208: Improve cluster access component by showing kubectl-gs login command

## 0.61.3

### Patch Changes

- 27a2c97: Fix entity icons not rendering in catalog relations graph by using SvgIcon with SVG image element instead of HTML img tag.

## 0.61.2

### Patch Changes

- a79d45d: Replace `giantswarm.io/deployment-names` annotation with `giantswarm.io/helmcharts` for mapping catalog entities to deployments.
- 75eabf3: Migrate scaffolder field schemas from deprecated `makeFieldSchemaFromZod` to `makeFieldSchema`, removing direct zod dependency and fixing TypeScript OOM without needing a zod version resolution.
- fcac92e: Detect "x.x.x" as auto-upgrade Any instead of None on HelmRelease/OCIRepository details page
- c146a52: Replace portal-based EntityHeaderIcon with EntityHeaderBlueprint custom header so the entity icon persists across all tabs on catalog entity pages.

## 0.61.1

### Patch Changes

- 9d911b1: Migrate card components from Material-UI to @backstage/ui Card primitives.
- 31f7895: Use EntityChartProvider for deployments tab to get chart name from entity context instead of deployment names annotation.
- 206058e: Change installation sorting in InstallationPicker to show eu-north on top
- 31f7895: Add NFS entity extensions (content tabs, cards, content layouts) and portal-based EntityHeaderIcon for the New Frontend System.
- Updated dependencies [9d911b1]
  - @giantswarm/backstage-plugin-ui-react@0.8.3
  - @giantswarm/backstage-plugin-flux-react@0.13.1

## 0.61.0

### Minor Changes

- 0860ea0: Update Backstage to 1.49.2. Migrate test utilities from @backstage/test-utils to @backstage/frontend-test-utils. Add @backstage/cli-defaults. Fix zod v3/v4 resolution, AiChatFab route crash, and TypeScript issues.
- 584a717: Show auto-upgrade setting in HelmRelease details page

### Patch Changes

- c06f5bf: Replace SelectedResourceDrawer with shared DetailsPane component from ui-react. Add prefix support and open() method to useDetailsPane hook. Rename installationName to cluster in DetailsPane params.
- c06f5bf: Move DetailsPane component and useDetailsPane hook from gs plugin to ui-react for reuse across plugins.
- 2fbeb40: Add row highlighting for selected node pool
- 6e7c096: Fix EntityReadmeCard height clipping when content doesn't need expansion.
- Updated dependencies [0860ea0]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
- Updated dependencies [b5802af]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
  - @giantswarm/backstage-plugin-flux-react@0.13.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.1
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.1
  - @giantswarm/backstage-plugin-ui-react@0.8.2
  - @giantswarm/backstage-plugin-flux@0.8.2

## 0.60.0

### Minor Changes

- c87b451: Add node pool details panel to cluster details / node pools

## 0.59.2

### Patch Changes

- 843fedf: Replace SelectFormField with Autocomplete in ClusterPicker and InstallationPicker for consistent UX. Use TextField helperText prop in ChartPicker instead of separate FormHelperText. Clear dependent scaffolder fields (ChartPicker, ChartTagPicker) when parent entity is cleared, preventing stale values from persisting.
- Updated dependencies [843fedf]
  - @giantswarm/backstage-plugin-ui-react@0.8.1

## 0.59.1

### Patch Changes

- 5a216f5: Use SPA navigation for Edit Deployment button instead of full page reload.
- Updated dependencies [d7cd901]
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.0
  - @giantswarm/backstage-plugin-flux-react@0.12.2

## 0.59.0

### Minor Changes

- 9997d4a: Add deployment edit mode with DeploymentPicker and EntityPicker scaffolder fields, EditDeploymentButton on deployment pages, disabledWhenField support across pickers, and hidden template filtering.
- b1526bc: Dereference external schema references in app deployment configuration

### Patch Changes

- a0aa682: Show Troubleshoot button in case a Deployment workload is not ready
- Updated dependencies [9997d4a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.0
  - @giantswarm/backstage-plugin-flux@0.8.1
  - @giantswarm/backstage-plugin-flux-react@0.12.1

## 0.58.0

### Minor Changes

- 3e52c89: Add workload status to deployment details page

### Patch Changes

- 9efa04b: Fix invalid semver version case

## 0.57.0

### Minor Changes

- b4e604e: Add AWS account ID to cluster details page

## 0.56.0

### Minor Changes

- 668ab64: Migrate GS plugin to New Frontend System (NFS) with PageBlueprint, NavItemBlueprint, and ApiBlueprint. Scaffolder field extensions remain on a temporary legacy compat plugin.
- 915083b: Replace GSFeatureEnabled with NFS config-based extension toggling. Page and nav-item blueprints are now disabled by default and enabled via `app.extensions` in app-config.yaml. Delete FeatureEnabled and MainMenu components from gs plugin.
- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.
- d8aa6f6: Migrate scaffolder to NFS: convert field extensions to FormFieldBlueprint, replace legacy scaffolder route with NFS page override, and remove temporary gsScaffolderPlugin.
- 4ef43b2: Add GSSecretYamlValuesEditor scaffolder field extension that routes secret values through the template secrets context instead of regular parameters, preventing them from being persisted in the scaffolder task database. Also fix potential secret content leak in YAML validation console logging.
- 0a0bea4: Add workload display based on Mimir metrics

### Patch Changes

- cb36dac: Fix config visibility annotations to prevent sensitive backend configuration from being exposed to the frontend.
- Updated dependencies [668ab64]
- Updated dependencies [915083b]
- Updated dependencies [ebd466f]
  - @giantswarm/backstage-plugin-flux-react@0.12.0
  - @giantswarm/backstage-plugin-flux@0.8.0
  - @giantswarm/backstage-plugin-ai-chat-react@0.3.0
  - @giantswarm/backstage-plugin-gs-common@0.21.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.13.0
  - @giantswarm/backstage-plugin-ui-react@0.8.0

## 0.55.0

### Minor Changes

- cb579b3: Add metrics display to deployments details page
- dde73a8: Add node pools table to cluster details

### Patch Changes

- 4ba7cab: Remove unused `apiEndpoint` field from installation config schema.
- Updated dependencies [cd72c54]
- Updated dependencies [dde73a8]
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.1
  - @giantswarm/backstage-plugin-kubernetes-react@0.12.0
  - @giantswarm/backstage-plugin-flux@0.7.2
  - @giantswarm/backstage-plugin-flux-react@0.11.1

## 0.54.0

### Minor Changes

- d3fd8a5: Add Inspect/Troubleshoot with AI button

### Patch Changes

- Updated dependencies [24c279b]
- Updated dependencies [d3fd8a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.3
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.0
  - @giantswarm/backstage-plugin-flux-react@0.11.0
  - @giantswarm/backstage-plugin-flux@0.7.1

## 0.53.5

### Patch Changes

- Updated dependencies [f09f501]
  - @giantswarm/backstage-plugin-flux@0.7.0

## 0.53.4

### Patch Changes

- b1b1b7a: Move ExternalLink component from gs plugin to ui-react.
- b1b1b7a: Move GitOpsCard and related utilities from gs plugin to flux-react.
- b1b1b7a: Move `AsyncValue` component from `gs` plugin to `ui-react` shared library.
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [cd3f13e]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [cd3f13e]
- Updated dependencies [134df14]
  - @giantswarm/backstage-plugin-ui-react@0.7.2
  - @giantswarm/backstage-plugin-flux-react@0.10.0
  - @giantswarm/backstage-plugin-gs-common@0.20.1
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.1
  - @giantswarm/backstage-plugin-flux@0.6.9

## 0.53.3

### Patch Changes

- 4166fda: Fix AsyncValue component to properly handle falsy values
  - Make `value` prop required instead of optional
  - Use explicit loading/error state checks instead of truthiness check on value, so falsy values (empty string, `0`, `null`) render correctly
  - Update consumers to handle nullable values with explicit `<NotAvailable />` fallbacks

- 8e3e4a4: Enhance Flux details panel with additional metadata
  - Add creation timestamp, interval, and resource-specific metadata to details panel and list view
  - Extract `findHelmReleaseChartName` utility into flux-react for shared use
  - Add convenience accessors to HelmRelease, GitRepository, OCIRepository, and HelmRepository resource classes

- Updated dependencies [23e9f63]
- Updated dependencies [8e3e4a4]
- Updated dependencies [8e3e4a4]
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.0
  - @giantswarm/backstage-plugin-flux-react@0.9.0
  - @giantswarm/backstage-plugin-flux@0.6.8

## 0.53.2

### Patch Changes

- 7cd0eac: Fix EntityHeaderIcon selector to use structural selector instead of class names that break in production

## 0.53.1

### Patch Changes

- Updated dependencies [b4b5fc2]
- Updated dependencies [3e3dd4c]
- Updated dependencies [3e3dd4c]
  - @giantswarm/backstage-plugin-kubernetes-react@0.10.0
  - @giantswarm/backstage-plugin-flux-react@0.8.0
  - @giantswarm/backstage-plugin-flux@0.6.7

## 0.53.0

### Minor Changes

- 7cc2c17: Show icon for entities if giantswarm.io/icon-url annotation is given

## 0.52.1

### Patch Changes

- b535e10: Add OCIRepository support to getSource helper functions for HelmRelease resources.
- 68b52c4: Refactor Version component to extract helper components for better maintainability.
- 286d31a: Improve Helm chart name resolution with OCIRepository support.
- Updated dependencies [286d31a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.9.2

## 0.52.0

### Minor Changes

- a68a2b2: Add OAuth2 PKCE authentication support for MCP servers
  - Add custom OAuth2 authenticator with PKCE (Proof Key for Code Exchange) support for secure public client authentication
  - Add CIMD (Client ID Metadata Document) router to serve OAuth client metadata for MCP server authorization flows
  - Register MCP auth providers (prefixed with `mcp-`) in the backend auth module
  - Add `MCPAuthProviders` API in ai-chat plugin to fetch credentials for configured MCP auth providers
  - Update AI Chat page to automatically inject MCP auth tokens into request headers
  - Refactor `GSAuthProviders` to separate Kubernetes and MCP auth providers with dedicated methods

### Patch Changes

- d070c3a: Improve container registry error handling with user-friendly messages for missing repositories and consistent HTTP status code reporting.
- d4b1b9a: Fix GitOpsCard source URL generation for new Flux CD revision formats. The revision field now correctly parses formats like `main@sha1:abc123...` and `sha256:abc123...` to extract the commit SHA for URL construction.

## 0.51.5

### Patch Changes

- edee516: Refactor ProviderClusterLocation to separate components per provider
  - Split ProviderClusterLocation into AWSClusterLocation and AzureClusterLocation
  - Use ClusterSwitch pattern for provider-specific rendering
  - Remove useProviderClusterForCluster hook (was calling 4 useResource hooks with only one enabled)
  - Each provider component now uses a single useResource hook

- edee516: Handle missing namespace in TypedLocalObjectReference for CAPI v1beta2
  - Update Cluster.getInfrastructureRef() and getControlPlaneRef() to handle both v1beta1 ObjectReference and v1beta2 TypedLocalObjectReference formats
  - Update ProviderCluster.getIdentityRef() with the same namespace fallback pattern
  - Include apiGroup in returned refs for proper resource matching with findResourceByRef()
  - When namespace is missing from a reference, fall back to the parent resource's namespace

- edee516: Improve findResourceByRef to support multi-version API matching
  - Match resources by API group instead of exact apiVersion to handle version differences
  - Support both ObjectReference (apiVersion) and TypedLocalObjectReference (apiGroup) formats
  - Add comprehensive test coverage

- edee516: Integrate API version incompatibility errors into the error display system
  - Add IncompatibilityErrorInfo type and ErrorInfoUnion discriminated union
  - Update useShowErrors to handle both regular fetch errors and incompatibility errors
  - Include incompatibilities in errors array from useResource and useResources hooks
  - Add IncompatibilityPanel component for displaying incompatibility details
  - Move getIncompatibilityMessage and getErrorMessage helpers to kubernetes-react

- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
  - @giantswarm/backstage-plugin-kubernetes-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.7.1
  - @giantswarm/backstage-plugin-flux@0.6.6

## 0.51.4

### Patch Changes

- 9fb2244: Fix Card display of the ClusterAboutCard component.
- 5475c38: Remove feature flag experimental-data-fetching
- Updated dependencies [40626f8]
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.2

## 0.51.3

### Patch Changes

- 009baf6: Add search widget to Flux Tree view
- Updated dependencies [009baf6]
  - @giantswarm/backstage-plugin-flux-react@0.7.0
  - @giantswarm/backstage-plugin-flux@0.6.5

## 0.51.2

### Patch Changes

- e42fd25: Fix Mosaic styles not being cleaned up when JsonSchemaViewer component unmounts
- e42fd25: Remove custom markdown style overrides from EntityReadmeCard now that Mosaic styles are properly isolated

## 0.51.1

### Patch Changes

- f3f3a50: Consistent errors handling for chart tags requests.
- Updated dependencies [f3f3a50]
  - @giantswarm/backstage-plugin-flux@0.6.4

## 0.51.0

### Minor Changes

- 4fd2838: Add Helm chart readme overview.

## 0.50.0

### Minor Changes

- f665c62: Add Helm chart versions history.

### Patch Changes

- f665c62: Fix ChartPicker and ChartTagPicker to respect initial form value.
- Updated dependencies [f665c62]
  - @giantswarm/backstage-plugin-ui-react@0.7.1

## 0.49.2

### Patch Changes

- 9059740: Expose isManagementCluster value in ClusterPicker scaffolder field.
- 9059740: Improve formatTemplateString utility to replace clusterNamePrefix placeholders.

## 0.49.1

### Patch Changes

- 2dfca83: Configuration docs refactoring.

## 0.49.0

### Minor Changes

- 39eb4f8: Improve cluster details (about card)

### Patch Changes

- 8812d57: Remove policy compliance component from cluster details page
- Updated dependencies [578b11d]
  - @giantswarm/backstage-plugin-flux-react@0.6.3

## 0.48.0

### Minor Changes

- 5e8c7e3: Add YAML values docs to the custom scaffolder step layout.

## 0.47.1

### Patch Changes

- a6688e0: Added custom scaffolder fields improvements.

## 0.47.0

### Minor Changes

- 7f837a5: Add ChartTagPicker custom scaffolder field.
- 7f837a5: Add YamlValuesValidation custom scaffolder field.
- 7f837a5: Add YamlValuesEditor custom scaffolder field.
- 7f837a5: Add Container Registry API client
- 7f837a5: Add ChartPicker custom scaffolder field.
- 7f837a5: Change helmcharts catalog entity annotation format.

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.0
  - @giantswarm/backstage-plugin-flux@0.6.3
  - @giantswarm/backstage-plugin-flux-react@0.6.2
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.1

## 0.46.2

### Patch Changes

- 3d4d3f2: Use custom discovery API in custom auth connector.

## 0.46.1

### Patch Changes

- 7233c8c: Fix KubernetesClient race condition problem.

## 0.46.0

### Minor Changes

- a478023: Change custom Kubernetes client to use standard backend proxy.
- a478023: Handle Kubernetes plugin by custom Discovery service.

## 0.45.0

### Minor Changes

- d6b1c2d: Use types from @giantswarm/k8s-types package.

### Patch Changes

- d6b1c2d: Fixed cluster status icon alignment.
- Updated dependencies [d6b1c2d]
- Updated dependencies [d6b1c2d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.0
  - @giantswarm/backstage-plugin-gs-common@0.20.0
  - @giantswarm/backstage-plugin-flux@0.6.2
  - @giantswarm/backstage-plugin-flux-react@0.6.1

## 0.44.0

### Minor Changes

- 644308d: Handle rejected cluster authentication.

### Patch Changes

- Updated dependencies [644308d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.7.0
  - @giantswarm/backstage-plugin-flux-react@0.6.0
  - @giantswarm/backstage-plugin-flux@0.6.1

## 0.43.0

### Minor Changes

- 1f347ff: Changed Flux UI default view to resources overview.

### Patch Changes

- 1f347ff: Aligned pagination size options between tables.
- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
  - @giantswarm/backstage-plugin-flux@0.6.0
  - @giantswarm/backstage-plugin-flux-react@0.5.5
  - @giantswarm/backstage-plugin-ui-react@0.6.1

## 0.42.3

### Patch Changes

- Updated dependencies [3b06846]
- Updated dependencies [c930bcf]
  - @giantswarm/backstage-plugin-kubernetes-react@0.6.0
  - @giantswarm/backstage-plugin-ui-react@0.6.0
  - @giantswarm/backstage-plugin-flux-react@0.5.4
  - @giantswarm/backstage-plugin-flux@0.5.2

## 0.42.2

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.
- Updated dependencies [212cfcb]
- Updated dependencies [212cfcb]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.1
  - @giantswarm/backstage-plugin-flux-react@0.5.3
  - @giantswarm/backstage-plugin-flux@0.5.1

## 0.42.1

### Patch Changes

- 3030f54: Fixed Flux resources table sorting.
- Updated dependencies [3030f54]
  - @giantswarm/backstage-plugin-flux-react@0.5.2
  - @giantswarm/backstage-plugin-ui-react@0.5.1

## 0.42.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.0
  - @giantswarm/backstage-plugin-flux-react@0.5.0
  - @giantswarm/backstage-plugin-ui-react@0.5.0
  - @giantswarm/backstage-plugin-flux@0.5.0

## 0.41.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-kubernetes-react@0.4.0
  - @giantswarm/backstage-plugin-flux-react@0.4.0
  - @giantswarm/backstage-plugin-ui-react@0.4.0
  - @giantswarm/backstage-plugin-flux@0.4.0

## 0.40.3

### Patch Changes

- 9ed2265: Fixed catalog entity deployments cluster selector.

## 0.40.2

### Patch Changes

- 791a215: Fixed Cluster selectors when only one cluster is configured.
- Updated dependencies [791a215]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.2
  - @giantswarm/backstage-plugin-flux@0.3.1

## 0.40.1

### Patch Changes

- fbc1589: Fixed Kubernetes client clusters retrieval method.
- Updated dependencies [fbc1589]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.1

## 0.40.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.0
  - @giantswarm/backstage-plugin-flux-react@0.3.0
  - @giantswarm/backstage-plugin-flux@0.3.0

## 0.39.0

### Minor Changes

- 8685deb: Added Flux overview UI.

### Patch Changes

- cbdf4f6: Fixed AWS Account ID copy-paste issue in clusters table.
- Updated dependencies [8685deb]
  - @giantswarm/backstage-plugin-flux-react@0.2.0
  - @giantswarm/backstage-plugin-gs-common@0.19.0

## 0.38.1

### Patch Changes

- b2171b9: Fixed ReleasePicker scaffolder field to correctly format release version.

## 0.38.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

### Patch Changes

- b4f69e9: Cleaned up custom auth connector implementation.
- Updated dependencies [2294710]
  - @giantswarm/backstage-plugin-gs-common@0.18.0

## 0.37.0

### Minor Changes

- 46ae127: Added deployment details page.

### Patch Changes

- 7307756: Fixed alerts dashboard link.

## 0.36.0

### Minor Changes

- 7eb690b: Added possibility to configure how Kubernetes resources annotations are being displayed.

### Patch Changes

- Updated dependencies [7eb690b]
  - @giantswarm/backstage-plugin-gs-common@0.17.0

## 0.35.0

### Minor Changes

- bb84af1: Added possibility to configure how Kubernetes resources labels are being displayed.

## 0.34.0

### Minor Changes

- 8378d2a: Added configurable links to the cluster details page resources card.
- 8378d2a: Added configurable links to the homepage resources card.

## 0.33.0

### Minor Changes

- 5ac83b5: Hide provider filter when there is only one provider available.
- 32f30df: Hide installations selector when there is only one installation available.

## 0.32.1

### Patch Changes

- 59cd825: Moved installations data to context.

## 0.32.0

### Minor Changes

- e9b3d0f: Use one GS context for the application.
- e9b3d0f: Refactor errors handling.

## 0.31.3

### Patch Changes

- 76498b6: Improved installations status check.

## 0.31.2

### Patch Changes

- 5ce287f: Set timeout for scaffolder API requests.
- 5ce287f: Changed how disabled installations check is implemented.

## 0.31.1

### Patch Changes

- 1b04b30: Changed InstallationsPicker to use Autocomplete component.
- b29a058: Added validation for InstallationPicker scaffolder field.

## 0.31.0

### Minor Changes

- d37eb78: Added logic to check availability status of connected installations.

## 0.30.4

### Patch Changes

- 2c495c3: Refactored custom scaffolder API client.

## 0.30.3

### Patch Changes

- 031c015: Handle list tasks errors in custom scaffolder client.

## 0.30.2

### Patch Changes

- 50811a5: Handle list tasks errors in custom scaffolder client.

## 0.30.1

### Patch Changes

- 673eb67: Improved ReleasePicker scaffolder field to allow to filter releases by provider.
- Updated dependencies [673eb67]
  - @giantswarm/backstage-plugin-gs-common@0.16.1

## 0.30.0

### Minor Changes

- 4c21763: Added a custom scaffolder client to interact with headless backend instances.
- 4c21763: Added a custom discovery API to interact with headless backend instances.

## 0.29.0

### Minor Changes

- df8b489: Added Cloud Director support.

### Patch Changes

- Updated dependencies [df8b489]
  - @giantswarm/backstage-plugin-gs-common@0.16.0

## 0.28.0

### Minor Changes

- c3eb724: Delegated unimplemented custom Kubernetes client methods to the standard Kubernetes backend client.

## 0.27.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

### Patch Changes

- Updated dependencies [09bae90]
- Updated dependencies [d121c2e]
  - @giantswarm/backstage-plugin-gs-common@0.15.0

## 0.26.0

### Minor Changes

- 0126c0d: Changed column selection to be persisted in the deployments and clusters tables.

## 0.25.0

### Minor Changes

- 763e8fb: Display aggregated statuses for deployments.

## 0.24.2

### Patch Changes

- 96b704d: Refactored the cluster details page.

## 0.24.1

### Patch Changes

- 0109bc4: Fixed a bug where the cluster details page may be displayed as blank.

## 0.24.0

### Minor Changes

- 8ff7d5d: Changed gitopsRepositories configuration to support GitHub repositories by default.

## 0.23.1

### Patch Changes

- 5208ef7: Fixed a bug when Installation picker used to incorrectly save selected installations into local storage.

## 0.23.0

### Minor Changes

- 93f0340: Added GitOps indicator to the Deployment details pane.

### Patch Changes

- 8f11eb3: Changed mapping between deployments and catalog entities to use all entities of kind "Component".
- Updated dependencies [93f0340]
  - @giantswarm/backstage-plugin-gs-common@0.14.0

## 0.22.1

### Patch Changes

- 3c16f4d: Fixed how error messages are displayed for deployments.

## 0.22.0

### Minor Changes

- 492699f: Added catalog entity link to the Deployment details pane.
- 492699f: Added App filter to the Deployments page.
- 492699f: Added link to a catalog entity to the Deployments table.

## 0.21.0

### Minor Changes

- 2e4b66f: Display HelmRelease deployment conditions with keyword "Not" if status is "False"
- e8062d0: Show resource name as title of the deployment details pane

### Patch Changes

- 1731002: Changed K8s API fetching to use all installations when none is selected.
- c43b45a: Improved how error messages are displayed in HelmRelease details panel.

## 0.20.0

### Minor Changes

- 8e45f1b: Added developer portal roadmap link to homepage
- 6c9ae8d: Installations picker now shows region and pipeline info
- 0423b34: Add configurable Slack support channel link to home page

### Patch Changes

- d95c4ea: Allowed to template current user name in TemplateStringInput scaffolder field.
- d95c4ea: Improved loading and error states for OrganizationPicker and ReleasePicker scaffolder fields.

## 0.19.0

### Minor Changes

- 1aad32a: Handle cluster creation state.
- 1aad32a: Added custom scaffolder action to apply manifest to a cluster.
- 1aad32a: Added InstallationPicker, OrganizationPicker, ReleasePicker scaffolder fields.

### Patch Changes

- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
  - @giantswarm/backstage-plugin-gs-common@0.13.0

## 0.18.2

### Patch Changes

- 54e79ce: Allowed to set selected installations with the URL parameters.

## 0.18.1

### Patch Changes

- d37d5fb: Added Label filter to the Deployments page.
- d37d5fb: Added Label filter to the Clusters page.
- 37f9d76: Remove codename field from installations details
- 1d75e6c: Added Release filter to the Clusters page.
- 1d75e6c: Added App version filter to the Clusters page.
- 1d75e6c: Added Region filter to the Clusters page.
- 1d75e6c: Added Status filter to the Clusters page.
- 1d75e6c: Added Provider filter to the Clusters page.
- 1d75e6c: Added Kubernetes version filter to the Clusters page.
- 1d75e6c: Added Status filter to the Deployments page.

## 0.18.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

### Patch Changes

- Updated dependencies [f42edd2]
  - @giantswarm/backstage-plugin-gs-common@0.12.0

## 0.17.3

### Patch Changes

- bfc0a5f: Pinned dependency versions to fix error "useEntityList must be used within EntityListProvider"

## 0.17.2

### Patch Changes

- 859d53e: Added Namespace filter to the Deployments page.
- 859d53e: Added Version filter to the Deployments page.
- 859d53e: Added Cluster type filter to the Deployments page.

## 0.17.1

### Patch Changes

- 441dd20: Added Clusters filter to the Deployments page.
- 441dd20: Added Organizations filter to the Clusters page.

## 0.17.0

### Minor Changes

- 2e9eb19: Added filtering logic to deployments and clusters pages.

### Patch Changes

- 2e9eb19: Added Deployment Type filter to deployments page.
- 2e9eb19: Added Type filter to clusters page.

## 0.16.0

### Minor Changes

- 733fcf7: Used layout with facet filters on clusters and deployments pages.

## 0.15.1

### Patch Changes

- 3196e83: Made sorting by version column behave semver-aware.

## 0.15.0

### Minor Changes

- d431e37: On installations details, show custom CA info and non-standard access docs
- 6ed2cbb: Made GitOps indicator link configurable via app configuration.

### Patch Changes

- Updated dependencies [6ed2cbb]
  - @giantswarm/backstage-plugin-gs-common@0.11.0

## 0.14.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- f99862c: Refactored how GS Kubernetes API is used.
- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- f99862c: Refactored data fetching hooks to share common logic.
- Updated dependencies [f99862c]
- Updated dependencies [9e6f3c1]
- Updated dependencies [c5d9972]
- Updated dependencies [e06b6cd]
- Updated dependencies [f99862c]
  - @giantswarm/backstage-plugin-gs-common@0.10.0

## 0.13.0

### Minor Changes

- d5e7820: Added "Managed through GitOps" indicator to cluster details.

### Patch Changes

- Updated dependencies [d5e7820]
  - @giantswarm/backstage-plugin-gs-common@0.9.0

## 0.12.1

### Patch Changes

- 1ba6a38: Changed deployments table page size to 50. Allowed to change to 100.
- 1ba6a38: Sorted deployments table by name on initial render.
- e08db30: Changed Grafana link on cluster details page.
- 0b15773: Fixed how cluster type is determined for deployments.
- Updated dependencies [0b15773]
  - @giantswarm/backstage-plugin-gs-common@0.8.1

## 0.12.0

### Minor Changes

- 60cf504: Split SOURCE column in deployments table into SOURCE and CHART NAME.
- 60cf504: Split NAMESPACE/NAME column in deployments table into two separate columns.
- 60cf504: Fixed missing values in CLUSTER column in deployments list.
- 60cf504: Added deployments page.
- 60cf504: Added links to cluster details from deployments table and deployment details pane.
- 60cf504: Added CLUSTER TYPE column to deployments list.

### Patch Changes

- c9d0eb6: Change grouping of AWS account ID into groups of four digits
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
  - @giantswarm/backstage-plugin-gs-common@0.8.0

## 0.11.0

### Minor Changes

- 46fdee2: Added column KUBERNETES VERSION to clusters list.

### Patch Changes

- b5f0dcb: Changed AWS ACCOUNT ID column in clusters list to display value with color hashing and link to AWS account.
- 055dcb4: Changed CLUSTER APP column in clusters list to display provider specific cluster app version.
- Updated dependencies [b5f0dcb]
- Updated dependencies [055dcb4]
  - @giantswarm/backstage-plugin-gs-common@0.7.3

## 0.10.2

### Patch Changes

- e671231: Fetch only supported infrastructure cluster identity resources.
- Updated dependencies [e671231]
  - @giantswarm/backstage-plugin-gs-common@0.7.2

## 0.10.1

### Patch Changes

- 9243e49: Fetch infrastructure cluster resources only for supported providers.
- Updated dependencies [9243e49]
  - @giantswarm/backstage-plugin-gs-common@0.7.1

## 0.10.0

### Minor Changes

- 219004e: Add RELEASE column to clusters list
- 20eab6a: Added column AWS ACCOUNT ID to clusters list
- 20eab6a: Added column LOCATION to clusters list

### Patch Changes

- Updated dependencies [20eab6a]
- Updated dependencies [20eab6a]
  - @giantswarm/backstage-plugin-gs-common@0.7.0

## 0.9.0

### Minor Changes

- 0bfc102: Change TYPE column in clusters list view to show management/workload cluster icon
- 9c0d7ac: Added column CLUSTER APP to clusters list

## 0.8.0

### Minor Changes

- d9b40c8: Add configurable home page.

### Patch Changes

- 3306938: On the cluster details page, move the information about the installation from a dedicated widget into the About widget.

## 0.7.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2
- 85e6de9: Add links to Grafana and Web UI to cluster details page.

### Patch Changes

- 5b4002d: Remove 'vintage' from 'Cloud Director vintage' provider label
- Updated dependencies [ca553ba]
  - @giantswarm/backstage-plugin-gs-common@0.6.0

## 0.6.0

### Minor Changes

- 3d05628: Use Dex authentication provider for user sign-in.

## 0.5.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

### Patch Changes

- Updated dependencies [3cd9851]
- Updated dependencies [cebd404]
  - @giantswarm/backstage-plugin-gs-common@0.5.0

## 0.4.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.
- 06092e9: Add custom Kubernetes and KubernetesAuthProviders APIs to communicate with Kubernetes clusters from client side.
- 06092e9: Add custom OAuth2 implementation for client side OIDC auth providers.

### Patch Changes

- Updated dependencies [f508faf]
  - @giantswarm/backstage-plugin-gs-common@0.4.0

## 0.3.3

### Patch Changes

- e1446d5: Fix Grafana dashboard link for deployment by using "default" for namespace variable.

## 0.3.2

### Patch Changes

- 607bb9a: Fix Grafana dashboard link for deployment by removing "default-" prefix from application name and adding a namespace variable.

## 0.3.1

### Patch Changes

- 06c9efc: Fix how GS users are distinguished from customer users.

## 0.3.0

### Minor Changes

- 291a42f: Refactor K8s resources management.
- 291a42f: Add cluster details page.

### Patch Changes

- e35602f: Add `--auth` flag to first time Teleport (tsh) login command
- Updated dependencies [291a42f]
- Updated dependencies [291a42f]
  - @giantswarm/backstage-plugin-gs-common@0.3.0

## 0.2.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.

### Patch Changes

- Updated dependencies [b2b5cce]
- Updated dependencies [9aaa464]
  - @giantswarm/backstage-plugin-gs-common@0.2.0
