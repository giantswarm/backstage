# @giantswarm/backstage-plugin-gs-backend

## 0.11.0

### Minor Changes

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

- 37c3eb0: `GET /agent-skills` pins what it lists. The route resolves the ref to its head commit
  first (`GET /repos/{owner}/{repo}/commits/{ref}` with the `sha` media type — a branch,
  a tag or a commit alike) and reads the git tree and every `SKILL.md` at that commit,
  so the listing is one consistent snapshot. Every skill now carries `commit` next to
  `ref`, and the response carries the repository-level `ref` and `commit` too — the
  immutable reference an agent's chart values pin the skill to.
- 8402eee: Serve installation configuration (`gs.installations`) from the `gs-backend`
  plugin through a new authenticated endpoint, and load it in the frontend after
  sign-in instead of reading it from static frontend config. The boot-time
  frontend APIs (Kubernetes, discovery, auth) now obtain installation data
  asynchronously from a shared source, and per-installation auth providers
  initialize lazily once the main sign-in completes.
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

## 0.10.2

### Patch Changes

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-gs-node@0.3.0

## 0.10.1

### Patch Changes

- 610ead0: Add `LatestOciReleaseProcessor` that annotates `Component` entities carrying `giantswarm.io/helmcharts` with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` from the referenced OCI registry. For multi-chart entities the highest-semver stable tag wins; prerelease tags are skipped. Toggle via `catalog.processors.latestOciRelease.enabled`.

  Introduce a new `@giantswarm/backstage-plugin-gs-node` node-library package and move the container-registry client code (`ContainerRegistryService`, `AcrRegistryClient`, `OciRegistryClient`, `RegistryAuthClient`, `RegistryError`, registry utils, and `containerRegistryServiceRef`) into it so it can be shared between `gs-backend` and the catalog module. Move `parseChartRef` from `plugins/gs` to `gs-common` so it can be used backend-side.

- Updated dependencies [610ead0]
  - @giantswarm/backstage-plugin-gs-node@0.2.0

## 0.10.0

### Minor Changes

- ac09102: Add PagerDuty integration: "Who is on call" entity card, catalog processor that auto-annotates entities with PagerDuty IDs, and MCP action to resolve PagerDuty IDs from catalog entities.

## 0.9.1

### Patch Changes

- a240221: Decouple custom branding from the gs-backend plugin. Branding asset serving moves to a dedicated `branding` backend plugin colocated in `packages/backend/src/branding/`, registered unconditionally so it works in deployments without a `gs:` config block. The frontend hook now resolves assets via the `branding` discovery prefix at `/api/branding/*`.

## 0.9.0

### Minor Changes

- 0f6cd54: Add custom branding asset support with logo overrides, allowing organizations to customize UI logos via mounted volumes without code changes.

## 0.8.0

### Minor Changes

- fca7f1a: Add authenticated GitHub content fetching for private repositories. Helm chart README, values schema, and values YAML are now fetched through a backend endpoint that adds GitHub credentials, instead of direct unauthenticated browser fetches.

### Patch Changes

- 6e25580: Fix AI chat `get-helm-chart-values` tool failing with 500 for private OCI registries by authenticating GitHub URL fetches using Backstage's GitHub integration credentials.

## 0.7.0

### Minor Changes

- 7b162b5: Add support for authenticated access to private OCI container registries

## 0.6.0

### Minor Changes

- a1fe62e: Add MCP tool get-helm-chart-values for fetching Helm chart default values and schema

## 0.5.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.4.0

### Minor Changes

- cb579b3: Add metrics display to deployments details page

## 0.3.2

### Patch Changes

- d070c3a: Improve container registry error handling with user-friendly messages for missing repositories and consistent HTTP status code reporting.

## 0.3.1

### Patch Changes

- f3f3a50: Proper HTTP Error Handling for Container Registry Clients

## 0.3.0

### Minor Changes

- f665c62: Add Helm chart versions history.

## 0.2.0

### Minor Changes

- 7f837a5: Add container registry service.
