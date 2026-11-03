# @giantswarm/backstage-plugin-gs-backend

## 0.11.0

### Minor Changes

- 2b79a0c: Skills can be edited through the same pull-request flow that adds them. A skill's page gains **Edit**, which opens the add-skill form at `/agent-platform/skills/edit/<owner>/<repo>[/<skill dir>]`. The form is prefilled with the skill's current SKILL.md, read at the commit the catalog pinned it to. The repository and name are fixed, and submitting waits for an actual change. It opens a pull request that rewrites `<dir>/SKILL.md` on `update-skill/<name>`, authored as the signed-in person. The success screen matches adding a skill: the opened pull request, its link, and that a teammate approves it.

  gs-backend: the new `GET /agent-skills/content` returns a skill's frontmatter `name`/`description` and its body at a commit, for configured `agentPlatform.skills.repositories` only. github.com repositories are read through the contents API. Any other git repository is read from the depth-1 clone that discovery makes, and answers 409 when its branch moved on from that commit. `POST /agent-skills/pull-request` accepts `kind: 'update'` with the skill's `path` (and optionally `baseCommit`). An update writes the existing file with its blob sha and keeps the frontmatter keys the form does not show. It refuses with 404 when the file is gone, 422 when the edit changes nothing, and 409 only when the branch already exists.

  The portal event `AgentPlatform.skillProposed` gains the attribute `kind` (`created`, `updated`).

- 2b79a0c: Skills grow a detail page, an "Add skill" flow, and the meta-agent role helper.

  **Skill detail page** (`/agent-platform/skills/<owner>/<repo>[/<skill dir>]`):
  every card on Customize → Skills now opens a page built from the discovery
  list's data alone (decision G7 — no version history, no SKILL.md body, since no
  API serves either): name and description from the frontmatter, source
  repository, path, branch and the pinned commit, the agents using the skill
  (each linking to its page — which is also where a pin is updated, so the list
  is the page's honest "update" affordance; there is no global update), and a
  "View source" link into the repository at the pinned commit. An **Evaluate**
  button appears only where the `skillEvaluation` meta-agent role resolves
  (decision G8); it opens a session with that agent, the review prompt prefilled.

  **Meta-agent roles** (decision G13): `agentPlatform.metaAgents`
  (`generalInformation`, `agentManagement`, `workflowManagement`,
  `platformOperations`, `skillEvaluation`) maps each role to an agent name in
  app-config, served through the signed-in config. `readMetaAgents`
  (agent-platform-common) reads the mapping; `useMetaAgent(role)`
  (agent-platform) resolves it against the agent index and returns the agent or
  undefined — features gate on it and hide while unresolved.

  **Add skill via pull request** (decision G16 B): the Skills tab's new "Add
  skill" dialog (name, description, instructions, target repository) calls
  gs-backend's new `POST /agent-skills/pull-request`, which validates the target
  against `agentPlatform.skills.repositories`, creates `add-skill/<name>`, puts
  `<name>/SKILL.md` and opens the pull request — **as the signed-in person**,
  with their own GitHub grant in muster (`githubAuthApiRef`; the token travels in
  a `gs-github-token` header, and a person without a grant is bounced through
  muster's connect once). Nothing deploys: a teammate approves the PR and the
  skill appears once it merges and discovery re-reads the repository. GitHub's
  refusals (no push access, the skill or branch already existing, rate limits)
  are forwarded with their upstream status and said in words.

  New portal event `AgentPlatform.skillProposed`; `AgentPlatform.sessionStarted`
  gains the `skillDetail` entry point.

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

- 2a9d630: The agent wizard's skills step lists the plugins found in the configured skill
  repositories, each pinned to the commit its card shows: a Claude Code plugin
  (`.claude-plugin/plugin.json`) is picked whole, an Agent Plugins package
  (`plugin.json` at its root) by the skills it enables. The step warns when a
  skill name is picked twice, the review names each plugin with what of it loads,
  and an edit keeps the agent's plugins at their pins. `GET /agent-skills`
  answers the repository's `plugins` next to its skills, from the same tree read.
- 37c3eb0: `GET /agent-skills` pins what it lists. The route resolves the ref to its head commit
  first (`GET /repos/{owner}/{repo}/commits/{ref}` with the `sha` media type — a branch,
  a tag or a commit alike) and reads the git tree and every `SKILL.md` at that commit,
  so the listing is one consistent snapshot. Every skill now carries `commit` next to
  `ref`, and the response carries the repository-level `ref` and `commit` too — the
  immutable reference an agent's chart values pin the skill to.
- 2b79a0c: Skill discovery (`GET /agent-skills`) gains a second provider: a repository in `agentPlatform.skills.repositories` that is not on github.com is now read over the plain git protocol — a depth-1 clone via isomorphic-git, every `SKILL.md` frontmatter parsed from the checkout — instead of being refused. That removes the GitHub REST API (and its 60-requests-an-hour anonymous rate limit) from the portal's skill catalog for any self-hosted or lab-local git server (Gitea, `git http-backend`); github.com repositories keep going through the REST API as before. To keep the backend from cloning arbitrary URLs, a non-GitHub repository must be one of the configured `agentPlatform.skills.repositories`; its failures are forwarded with their upstream status (missing ref → 404, refused fetch → the server's status, unreachable host → 502), like the GitHub provider's.
- 2b79a0c: `GET /agent-skills` answers from an in-memory cache per repository and ref instead of asking GitHub on every page view. The cache keeps a listing for 10 minutes. After that, a revalidation of an unchanged branch costs two GitHub requests instead of three plus one per skill. When GitHub refuses with a rate limit, or a host is down, the cache serves the last listing (up to a day old) with `stale: true` and waits for GitHub's reset time before asking again. Each skill now carries `contentReadable`. A `SKILL.md` that could not be read no longer drops its skill silently: the skill is listed as unreadable and its read is retried after 2 minutes. `GET /agent-skills/content` answers a `SKILL.md` the listing already read without another request.
- 2b79a0c: Skills are their whole directory now, not only `SKILL.md`: discovery lists every skill's files (GitHub from the tree it already reads, generic git from its checkout scan; a nested skill's files belong to it; at most 200 per skill, with `filesTruncated`), and each listed skill carries a `fileCount`. `GET /agent-skills/content` answers the list next to the instructions (`files`, `filesTruncated`), and the new `GET /agent-skills/content/file` answers one listed file of a skill at its commit — text up to 512 KB inline, binary and larger files as metadata only — immutably cached in the browser and in a size-capped server cache. A file outside the skill's list is never served. Generic-git repositories are answered from what the scan kept, not a clone per file. The agent-platform plugin gains the matching types (`SkillFile`, `SkillFileListing`, `SkillFileContent`, `DiscoveredSkill.fileCount`).
- 8402eee: Serve installation configuration (`gs.installations`) from the `gs-backend`
  plugin through a new authenticated endpoint, and load it in the frontend after
  sign-in instead of reading it from static frontend config. The boot-time
  frontend APIs (Kubernetes, discovery, auth) now obtain installation data
  asynchronously from a shared source, and per-installation auth providers
  initialize lazily once the main sign-in completes.
- 381d16d: The Installations page reads the Kubernetes version and release of every management cluster in one request (`GET /api/gs/installations/versions`): the backend asks all installations at once as the signed-in person and keeps each answer for five minutes, so both columns fill together within the slowest installation's answer instead of one queued request after another.
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

- 2b79a0c: Add skill names its commit and pull request `feat: add skill <name>`,
  following conventional commits, and an edited skill's `fix: update skill
<name>`. The add- and edit-skill form says "This opens a pull request." and
  "Markdown formatting allowed." under Instructions,
  and its success message links to the pull request with "Review pull request".
  The add form's Name hint drops "Becomes the skill's folder."
- 2b79a0c: The "Use your agents right in Slack" banner has a "How it works" button that
  opens the installation's guide in a new tab: `agentPlatform.integrations.slackDocsUrl`
  where a platform admin sets it, Giant Swarm's docs otherwise. The new key is
  part of the signed-in config.
- 2b79a0c: Add the "Use your agents right in Slack" banner to the new-session home, shown
  only where a platform admin enables it with the new app-config key
  `agentPlatform.integrations.slack: true` (off by default; an unconfigured portal
  renders and reads nothing). Each person can dismiss it for good; the dismissal
  is stored in their user settings. The gs-backend signed-in config now passes
  `agentPlatform.integrations.slack` to the browser.
- 2b79a0c: `/agent-skills/content` and `/agent-skills/content/file` answer a skill path
  missing from a commit whose file lists are already known with a 404 from
  memory, instead of reading the repository tree (or cloning it) again on every
  request.
- 2b79a0c: The agent-skills routes recover from a stalled upstream and edit a skill again after its first pull request:

  - Every upstream skill read has a deadline: 60 seconds for a clone and 30 seconds for a GitHub read. A read past it is aborted and answers 504, which is never remembered as a miss. `GET /agent-skills` serves its last listing instead when it has one. An aborted clone always stops, and its temporary checkout is removed.
  - The read limit's own "too many reads" 503 is no longer cached as an upstream outage.
  - An empty `ref` now reads the default branch, as an absent one does. It no longer gives listed skills an empty `ref`.
  - `/agent-skills/content` and `/agent-skills/content/file` accept every skill directory that discovery lists, including ones with spaces or non-ASCII letters. Updates accept them too. A new skill's directory is still a lowercase slug.
  - Concurrent reads of one generic-git commit share one clone, whichever files they ask for.
  - A skill pull request whose branch already exists answers 409 only when a pull request is open from that branch, and links it. A leftover branch is left alone, and the edit goes to a new branch suffixed with the short head commit. When writing the file or opening the pull request fails, the branch the request created is deleted again.

- 2b79a0c: The agent-skills read routes are now bounded:

  - `GET /agent-skills` answers only for the configured `agentPlatform.skills.repositories` (400 otherwise), as `/agent-skills/content` and `/agent-skills/content/file` already did. It no longer reads any github.com repository with the portal's token.
  - On a cache miss, a read at a commit remembers a 404, 409 or 422 for five minutes, shares concurrent reads of one key, and runs at most two clones and four GitHub reads at once. Up to 32 more reads wait per pool; past that, the route answers 503.
  - github.com owner and repository names are restricted to GitHub's name characters, so a percent-encoded `..` and a `?` are rejected.
  - A non-commit answer from GitHub is logged at debug instead of being echoed in the 502 message.
  - A flood of refs cannot push a repository's default-branch listing out of the discovery cache.

- 9312feb: The agent page's Technical details drop the Resource card's "Copy system
  prompt" button, show the agent's namespace and name as two facts, Namespace
  and Name, and link each skill version to its skill's page. The model and
  connector pages' Technical details split their resources the same way; a
  reference in the agent's own namespace (its ModelConfig, a sub-agent, the
  HelmRelease behind it) is named alone. The Configuration card's "See tools" is
  bui's link.

  Every git SHA the portal shows is 7 characters, a digest 12, with the full
  value as its title and a copy button on touch screens: skill pins and
  versions, agent revisions, workspace heads, Flux revisions and digests,
  branch-build versions, the release footer, scaffold and revert commits, and
  the backend's messages.

  New in `gs-common`: `shortSha`, re-exported by `ui-react`. New in `ui-react`:
  `CommitSha` and `namespacedNameFacts`.

- 2b79a0c: The `/github/raw-content` proxy attaches the portal's GitHub credentials only
  for repository owners in `gs.githubRawContent.allowedOwners` (default:
  `giantswarm`). Previously it requested credentials for whatever owner appeared
  in the caller-supplied URL, so any signed-in portal user could read private
  content from every repository the portal's GitHub App can see. URLs under
  other owners are still proxied, but without credentials, so only their public
  content is reachable.
- 2b79a0c: Fixes three bugs in skill edits through `POST /agent-skills/pull-request`:

  - **No silent overwrites.** An update now replaces the SKILL.md from the commit the edit started from, and `baseCommit` is required for every update. If the default branch's file is no longer that version, the route refuses with 409 ("The skill changed since you started editing … Reload the skill") and creates no branch. Before this fix, an edit overwrote any change merged after it began. The file is checked at the resolved head commit, and the branch is created from that same commit.
  - **Large skills can be edited.** The route accepts JSON bodies up to 1 MB, up from Express's 100 KB default. Instructions are still capped at 100,000 characters, but the request no longer fails with 413 before reaching that cap.
  - **Skills whose name is not a lowercase slug can be edited.** An update may send the skill's existing name: the frontmatter `name`, or the directory name when there is none. A new skill's name must still be a slug, and an update can't rename a skill to a name that isn't one (422). The update branch is now `update-skill/<directory as a slug>` (`update-skill/<repository>` for a skill at the repository root). It is named after the directory, not the display name, so every name gives a valid branch and two skills with the same name don't share one.

- e5bd97a: The Installations page shows every installation's versions again. The backend reads only the installations it can read as the signed-in person (the main installation, the ones the cluster token broker covers, the ones the Kubernetes plugin authenticates to itself) within one 15-second deadline per installation, and leaves the others (their own OIDC sign-in, a `backendUrl` override) to the browser, as before. An expired session shows "Not signed in", a failed read a short status with the details on hover, and the answer is no longer persisted to the browser's storage, where the next person to sign in on the same browser saw it. The subject token header and the endpoint's types live in `gs-common`.
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

- 2b79a0c: `/agent-skills` says when GitHub refused a read because a rate limit tripped, instead of a bare 403 or 429: the primary limit used up, until when, and whether the portal reads GitHub without a token (60 requests an hour per IP), or the secondary limit, with when to retry.
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

- Updated dependencies [9312feb]
- Updated dependencies [71317f9]
- Updated dependencies [21ae39b]
- Updated dependencies [9d0caee]
- Updated dependencies [85e7d8c]
- Updated dependencies [2fa183d]
- Updated dependencies [b63373b]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [50c2f49]
- Updated dependencies [e5bd97a]
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
- Updated dependencies [cba71a8]
- Updated dependencies [103014c]
- Updated dependencies [167c24c]
- Updated dependencies [0af6fea]
  - @giantswarm/backstage-plugin-gs-common@0.22.0
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
