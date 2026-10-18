# @giantswarm/backstage-plugin-ui-react

## 0.9.0

### Minor Changes

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

- e62dd24: Show readiness for each agent in the Agent Platform agents list
  (`/agent-platform/agents`), which previously gave no health signal at all.

  - New "Status" column with four states derived from the `Agent`'s status
    conditions: **Ready**, **Not ready** (accepted, but the backing workload has no
    available replica), **Not accepted** (the controller rejected the spec), and
    **Pending**. Hovering a non-ready agent shows the controller's own explanation
    — the reconcile error, or "Deployment is not ready, N/M pods are ready" — so
    the common cases don't need a `kubectl` round-trip. Any
    `UnsupportedFeatures` warning is appended to the same tooltip.
  - The table is now sortable on every column, like the sessions list. Status sorts
    by severity rather than alphabetically, so one click brings the agents needing
    attention to the top. The default order is unchanged (installation, then name).
  - **Pending** covers an agent the controller has not reconciled yet, or whose
    `status.observedGeneration` still lags `metadata.generation` — so a just-edited
    agent reads as "not known yet" instead of showing stale conditions as fact.
    kagent's own UI has no equivalent state.
  - The list now polls, on a two-tier interval evaluated per installation: 60s
    normally (matching the query client's `staleTime`, so it doesn't undercut the
    cache), dropping to 5s for an installation that has an agent still converging.
    An agent that has been non-ready for over 3 minutes is treated as durably
    broken rather than converging, so it falls back to the baseline instead of
    pinning its installation to the fast interval for as long as the tab stays
    open. Interval refetches only run while the tab is focused.
  - The "loading more agents" bar now means "an installation has not reported its
    first result yet" rather than "a request is in flight". With polling, the old
    meaning made the bar flash during steady state, and since it sits above the
    table it pushed the table down on every poll. Its slot is also a fixed height
    now, so toggling it can never shift the table.
  - `ui-react`: new shared `StatusLabel` — an icon plus a label describing the
    state of something, built on bui (`Flex`/`Text` plus a `--bui-fg-*` intent
    token) rather than on `@backstage/core-components`' `Status*`. Each intent has a
    distinct silhouette as well as a distinct colour, so a status survives
    greyscale and colour blindness, and the label is a sibling of the icon so
    assistive tech reads it (`Status*` puts `aria-hidden` on a span wrapping both
    its icon _and_ its children, which silently hides any label passed as a child).
    The agents list is the first consumer; `gs`, `muster` and `flux-react` each
    still have their own implementation and can migrate as their pages move to bui.
  - `kubernetes-react`: add readiness to `Agent` — `getReadiness()`,
    `getReadinessMessage()`, `getUnsupportedFeaturesWarning()`, `getConditions()`,
    `getCondition()` — plus the free functions `deriveAgentReadiness()`,
    `isAgentTransitional()` and `getAgentStatusChangedAt()` for callers that hold
    raw list data rather than hydrated instances, and the `AgentConditionType`
    constants. The `ready` derivation matches kagent's REST API exactly: it keys on
    the `Ready` condition's _reason_ (`DeploymentReady`/`WorkloadReady`), so a
    missing Deployment (`Ready=Unknown`/`DeploymentNotFound`) counts as not ready.

- 2494c9a: Add the companion delete to agent creation. The agent detail page's kebab menu
  gains **Delete agent…**, which removes the agent's `HelmRelease` — the object that
  owns its existence, since an `Agent` rendered by a chart would just be rendered
  again. Deleting it makes helm-controller uninstall the release and take the `Agent`
  CR with it. The owner is resolved through the Flux provenance labels rather than by
  assuming the release is named after the agent, so it also works for agents created
  outside the wizard.

  **The delete is offered only to users who may perform it.** A
  `SelfSubjectAccessReview` for `delete` on that named `HelmRelease` in its namespace
  runs first, and the menu item is withheld while the checks are still in flight, so
  it never appears and then disappears. The review decides what is _shown_;
  authorization stays the apiserver's, since the proxy forwards the user's own OIDC
  token — a bypassed menu item still gets a real 403. Two further conditions hide it:
  the owning release not being **in hand** (the object, not merely a label naming it —
  a release that could not be read is "cannot decide", not "no owner"), and a release
  applied by a Kustomization, whose desired state is in Git and which would be
  recreated on the next reconciliation.

  **A suspended release is refused rather than deleted.** Flux drops the finalizer on
  a suspended `HelmRelease` without running the uninstall, so deleting it would remove
  the release and leave the agent and the rest of the chart's objects behind, with no
  owner left to clean them up. The mutation explains that instead of reporting an
  uninstall that will not happen.

  **The shared `OCIRepository` goes only when it is provably unused.** Every agent in
  a namespace shares one `agent` chart source, so the `HelmRelease`es in the source's
  namespace are listed first and any other release referencing the same object keeps
  it. That list is read fresh at mutation time via the new `fetchResourceList`, not
  from the query cache: a cached list is up to `staleTime` (60s) old, so a sibling
  created moments ago in another tab would be invisible while looking perfectly
  certain. Every failure resolves to keeping the source — a failed list read means
  "cannot tell", never "nothing found", and a failed delete is swallowed, since the
  agent is gone by then and an unreferenced chart source is inert and re-applied
  identically by the next agent creation. This is also why the permission gate does
  not require `delete` on `ocirepositories`.

  **Bug fix in `kubernetes-react`: `useListResources` keyed its query without the
  namespace**, while the namespace lived in the request path. Two lists of the same
  kind on one cluster differing only by namespace were therefore _one_ query, and the
  second caller was served the first one's items with no request made at all — silent,
  because `staleTime` is 60s in several plugins and the cache is persisted to
  localStorage. `useGetResource` has always keyed on its namespace; lists now match.
  Found while reviewing this PR's own use of it, where the collision could have
  answered "nothing else references this chart source" from a different namespace and
  deleted a source other agents still needed. Also latent for
  `useNodePoolsForAWSCluster` and `SecretStoreSelector`. The scope is appended last so
  the existing 6-segment prefix still matches for invalidation.

  **The confirmation modal says one thing**: that this ends any session currently
  running with the agent, including ones started by other people that are not shown.
  That is the only thing the person clicking cannot work out for themselves, since
  kagent scopes its session list to the caller and a quiet list is therefore not
  evidence that an agent is idle. Nothing mechanical appears in it — not the
  `HelmRelease`, not the shared chart source, not the fact that a suspended release is
  not uninstalled at all. True, and all of it noise at the moment of deciding; it is
  documented in `docs/agent-platform.md` instead.

  On success the user returns to the agents list with a toast that says "Deleting",
  not "Deleted": the `HelmRelease` has a finalizer, so all that is certain is that the
  apiserver accepted the request, and the agent can still be in the list for a few
  seconds. On failure the dialog stays open with the message inline — no toast, since
  the user is still looking at the modal they pressed Delete in.

  **New in `ui-react`: `ConfirmDialog`** — the repo's first reusable modal, for asking
  before doing something that cannot be taken back. Controlled rather than wrapping a
  `DialogTrigger`, which is the only thing that works when the trigger is a `MenuItem`
  (react-aria unmounts the menu on selection, taking any trigger inside it along).
  Confirming deliberately does not close it: an action that can fail needs somewhere
  to report that, and a dialog that dismisses itself on confirm has thrown away the
  only place the user was still looking. So the caller runs the action, passes
  `isBusy` while it is in flight and `error` if it fails, and closes on success. While
  busy the dialog is undismissable, so a stray click or Escape cannot orphan a request
  already on its way to a server.

  **New in `kubernetes-react`: `deleteResource`** — the package's first mutating verb
  besides `patchResource`, and the first Kubernetes `DELETE` in the app. It goes
  through the same proxy, with the same trailing-slash stripping and the same
  `ForbiddenError`/`NotFoundError` naming, so an idempotent caller can treat a 404 as
  success. The details both verbs need moved into a shared `k8sMutation` module;
  `BACKSTAGE_FIELD_MANAGER` keeps its existing import path.

  Toasts here use `toastApiRef` from `@backstage/frontend-plugin-api` rather than the
  deprecated `alertApi`, which upstream has scheduled for removal.

- c5b9c46: Move the Installation picker to its own card at the top of the "Create an
  agent" form (`/agent-platform/agents/new`), ahead of Identity and
  Configuration, since the avatar preview and model picker both depend on it.

  When only one installation is configured for access, the picker is hidden
  entirely and that installation is auto-selected — customer Backstage
  instances wired to a single management cluster no longer see a single-option
  dropdown with nothing to choose.

  `ui-react`: add the shared `SectionHeader` component (title + description
  pair used to introduce a card's contents), extracted from the agent-platform
  form so it can be reused across plugins.

- 2b79a0c: The Agent Platform's Profile and settings page ends with the portal's release, the same line as at the bottom of the classic home page, linked to the repository and the release tag. `ui-react` exports it as `GSReleaseInfo`, which takes the version as a prop; inside the shell its new-tab links end in "↗".
- d6bec76: Add a session switcher rail to the session detail page: the operator's
  non-terminal sessions, grouped WAITING then RUNNING, so moving between live
  sessions no longer means going back to the list. Each card shows a compact age,
  the session title and the agent.

  Three groups: WAITING, RUNNING, and RECENTLY FINISHED. The prototype's own third
  group, Queued, has no kagent state behind it; this third one is ours. Its `team`
  line has no equivalent either, so the agent takes it, and its trigger icon has no
  backing data at all.

  **A finished session lingers for an hour** rather than vanishing the moment
  its turn completes — which is precisely when it is most worth reaching, since the
  reply you were waiting for has just landed. Its own neutral group, so the rail
  never claims a finished session is still working, and the header's "N
  non-terminal" count excludes it. A terminal session with no usable `changedAt` is
  dropped rather than graced: it cannot be placed in time, so it would linger for
  ever. Note this bound pulls the opposite way to `ACTIVE_MAX_AGE_MS` — that limits
  how long an _active_ state is believed, this how long a _terminal_ one is shown.

  **Scoped to the installation in the URL.** `SessionsDataProvider` is deliberately
  local to the list page, so the rail runs a single query on the shared
  `sessionsQueryKey` instead: arriving from the list costs nothing, and a deep link
  warms the cache for it. The Sessions tab stays the fleet-wide surface.

  **It deliberately does not apply `ACTIVE_MAX_AGE_MS`.** That five-minute bound
  stops the composer's "Working…" indicator promising progress after an agent dies
  mid-turn — a claim about _now_. A session stuck in `working` for three days is
  exactly what an operator needs to see, so it appears in RUNNING with `3d` on it.
  A session with no state at all is excluded: "created, never run" is not
  "non-terminal". Sorting differs per group, because each answers a different "what
  is most urgent": Waiting longest-blocked first, Running most-recently-active
  first.

  **The conversation keeps the document scroller**, which is the load-bearing
  layout decision rather than an aesthetic one — the composer docks with
  `position: sticky; bottom: 0`, and both `scrollToBottom()` and the streaming
  auto-follow measure `document.scrollingElement`. The rail is a sticky,
  internally-scrolling box instead, capped against the viewport. Below `sm` it is
  not rendered at all rather than hidden, so a narrow viewport pays for none of its
  polling. It renders on the loading, not-found and unreadable states too: a dead
  session is precisely when the switcher is wanted.

  **Cards are real anchors**, not bui `List` rows and not `Card` with `onPress`.
  Navigation between URLs is `aria-current="page"`, which a react-aria `GridList`
  cannot express — its rows are `aria-selected`, a different claim. Anchors are
  also cmd- and middle-clickable, where a bui `href` would full-page-reload because
  `BUIProvider` is not mounted in this app. Hand-rolling additionally means no new
  `.bui-*` overrides: `RecentConversations` needed five for a single-line row.

  The current card's accent is an **inset shadow**, not a thicker left border. A
  border would either shift the selected card's text or, reserved as transparent on
  every card, leave every _other_ card with no left edge at all. The rail also
  sticks 16px below the viewport top rather than flush against it, and does not
  override the flex parent's `stretch` — `align-self: flex-start` content-sizes a
  sticky child and silently stops it sticking.

  **"All caught up." is only said when the summary was complete.** The route
  reports `unreadable` (asked and failed) and `skipped` (should have been asked and
  was not — past the cap or the budget, _not_ the routine activity-window
  exclusion, which would make the state permanent) so the rail
  can tell "nothing is active" from "we cannot tell": with either non-zero it says
  so and offers a retry, footnotes the shortfall when it does have groups to show,
  and renders the header count as `N+` because it is then a floor. Both cases are
  reachable — every task read failing still answers 200, and a session blocked for
  days has an old `updated_at`, making it the first to fall past the cap.

  Collapsing is remembered under `gs-agent-platform-session-rail-collapsed` and
  leaves a 48px strip rather than nothing — the rail exists to answer "is anything
  waiting on me?", and the strip's dots and counts keep answering it without
  needing a floating re-open control on a page with no toolbar for one.

  **The detail page overrides the summary for its own session.** The backend caches
  that summary for 15s, which leaves it structurally behind the page — so appending
  a message to a finished session would otherwise leave it filed under RECENTLY
  FINISHED while the agent is visibly working beside it. The page passes its own
  reading down and it wins for that one session; every other entry is the
  summary's. The signal is the same `send.isSending || isAgentWorking` the
  "Working…" indicator uses, so the rail and the page cannot disagree — and the
  in-flight send matters on its own, because the conversation's verdict only lands
  once a poll has seen the new task, up to 10s later.

  **New in `ui-react`: `ArrowMenuOpenIcon` and `ArrowMenuCloseIcon`.** The rail's
  collapse control uses Material Symbols' dedicated pair for folding a side panel,
  hand-vendored because no icon package here ships them: `@material-ui/icons`
  4.11.3 is the _classic_ Material Icons set, which never had a
  collapse/expand-panel glyph at all — searching all 1120 of its icons for
  "collapse", "expand", "sidebar" or "drawer" returns nothing. Their
  `0 -960 960 960` viewBox is Symbols' own offset grid and has to travel with the
  paths, or the glyph renders off-canvas. Apache-2.0, outlined, weight 400.

  **Also new in `ui-react`: `PLUGIN_HEADER_HEIGHT`, `CONTENT_PADDING` and
  `PLUGIN_CONTENT_VIEWPORT_OFFSET`.** A full-height panel has to anchor to the
  viewport and subtract the chrome above it, and three plugins had each hardcoded
  the same 89. `ai-chat`'s `RecentConversations` now uses the shared constants.
  `docs/ui.md` gains a section on the three in-repo scroll-containment strategies,
  when each applies, and the `align-items: stretch` gotcha that silently stops a
  sticky flex child from sticking.

- c4f3eca: The Model configs, GPU node pools, model cache and GPU capacity tables leave
  out the Installation column when their rows can only come from one
  installation — one pinned in the header, or only one that answered — as the
  Agents and Sessions lists already do. All six tables now share one rule for it.
  In the Model configs table the name column gets most of the width, and Status,
  Provider and Installation are narrower.
  Tables that sort by Installation by default sort by name while the column is
  hidden, so the order always follows a visible header.

  ui-react adds `useVisibleSort`, a controlled sort for a bui `useTable` whose
  default sort column can be hidden.

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

- 9602074: Bot PRs: the Approve and merge dialog reads as a table. Its title matches the
  button that opens it, the intro is two sentences, and the preview is one row
  per PR in the page's own columns — Team (only when there is more than one),
  Repository, Pull request (without the shared `chore(deps):` prefix) and Result,
  where a green PR says the step the run takes and any other PR leads with its
  class and the reason. A PR that is no longer green is called out above the
  table and left out of the apply, so the button's count is what gets merged.
  Skeleton rows stand in while the preview runs, the dialog stays dismissable
  until Apply is pressed, and the preview stays readable while the apply runs. A
  repository marge could not read, a failure no rule matches and an unreadable
  rule catalogue are alerts after the table. Once it has run, Close is the only
  button. The sweep dialog shares the table.

  ui-react's `ConfirmDialog` takes `isDone`: the confirm button goes and Cancel
  becomes Close.

- 9e00143: Muster's server and workflow dialogs (confirm, edit as JSON/YAML, manifest) use
  bui instead of MUI. Confirm buttons are red only for deletes: saving an edit,
  activating, deactivating or reconnecting a server, stopping a served model and
  cancelling a download no longer get the destructive treatment.

  `ConfirmDialog` can no longer be closed with its header button while busy, and
  keeps line breaks in error messages. ui-react exports `useOnDialogOpen`, which
  resets a controlled dialog's state when it opens, and `ALERT_MESSAGE_STYLE`.

- 2b79a0c: Customize filters become one multi-select dropdown per field (T64).

  `CatalogFilterBar` draws each facet as a bui `Select` in multiple-selection
  mode instead of a row of chips: the trigger names the field ("Source All",
  "Source acme/skills", "Source 2 acme/skills and gs/skills"), the list shows each
  value with what it keeps under the search and the other picks ("acme/skills
  31"), and a facet with more than `SEARCH_MIN` values gets a search inside its
  list. Picks within one dropdown widen the list (any of them); dropdowns narrow
  each other. Every facet the catalog has a value on is drawn — a field with a
  single value is a dropdown of one option, so the Skills tab's Source filter no
  longer disappears on a one-repository installation. The row wraps at phone
  width, two dropdowns to a row.

  API changes in `@giantswarm/backstage-plugin-ui-react`:

  - `CatalogFilterSelection` holds a list of picked values per facet;
    `useCatalogFilters().select(facetId, values)` takes that list (empty picks
    the whole facet again).
  - `CatalogFilterDimension` has `selected: string[]` in place of `value` and
    `total`.
  - `CatalogFilterBar` takes an optional `onClear`, offering "Clear filters"
    while anything is picked.
  - `ALL_FILTER_VALUES`, `FILTER_CHIPS_MAX` and `FILTER_CHIPS_CLASS_NAME` are
    removed.

  The agent wizard's skill step (via `SkillsFilterBar`) and its tool step's
  "What it does" filter use the same dropdowns; on the tool step, picking both
  kinds is the same as picking none.

- 2b79a0c: Add `titleAs` to `InfoCard`, the heading level of its title (`h3` by default).
- f905068: Clusters show their worker capacity. The cluster About card gains a **Worker capacity** field ("12 nodes · 48 vCPUs · 192 GiB RAM"), and the Clusters table gains optional, sortable **Worker CPU** and **Worker memory** columns. Capacity is the ready worker nodes of each node pool times its machine size: the instance type on AWS and EKS, the VM size on Azure and AKS, the machine template's CPUs and memory on vSphere. Pools without a fixed size (Karpenter, VCD) take the capacity their ready nodes report in Mimir. A pool counted by neither is named in a hint next to the figure, with the reason.

  `kubernetes-react` adds the `VSphereMachineTemplate`, `AzureASOManagedMachinePool` and `AWSManagedMachinePool` resource classes. `AzureASOManagedClusterInterface` is now the generated `crds.capz.v1beta1.AzureASOManagedCluster` type from `@giantswarm/k8s-types` 0.11.0, so its `spec.resources` entries are untyped objects, as in the CRD; `AzureASOManagedClusterResource` still types the fields the plugins read. `ui-react` adds `numberCompareSort`, a table comparator that sorts items without a number last.

- 86eec55: Add a reusable `CodeBlock` component (`ui-react`) that renders a code block with
  a copy-to-clipboard button, and migrate the `gs` plugin's code blocks to it.

  The copy button is now correctly aligned to the top-right of its code field
  (removing the previous negative-margin workaround), uses a neutral bui
  `ButtonIcon` (`tertiary` variant) instead of the oversized primary-colored
  `CopyTextButton`, and shows a text-sized icon with a "Copy"/"Copied" tooltip and
  check-icon feedback. This fixes the displaced copy button in the "Kubernetes API
  access" and "SSH access" cluster detail boxes.

- 884bd42: A connector's page has a Details tab in place of its facts column: sign-in,
  health, calls this month and when it was added, then a Technical details
  fold-out, as on the agent and model pages, with the GitOps source and the
  release that applies the MCPServer, the configuration with its address, the
  auth chain and muster's health detail. The fold-out opens on arrival while the
  connector has failed. A turned-off connector's hint names the menu's "Turn
  on" instead of an "Activate" the page does not offer. `TechnicalDetailsFoldOut`
  and `Mono` move from the agent-platform plugin to `ui-react`.
- 23bfca0: Consolidate the duplicate `ContentRow` components onto the shared `ui-react`
  library.

  - `ui-react`: `ContentRow` now renders bui (`@backstage/ui` `Flex`/`Text`)
    instead of MUI v4, and adopts the proven stacked layout (bold title above its
    value). This fixes the previous inline variant, whose title and value touched
    because it had no gap/separator.
  - `gs`: the `components/UI/ContentRow` duplicate is removed; the `UI` barrel and
    its consumers now re-export/import `ContentRow` from
    `@giantswarm/backstage-plugin-ui-react`.

- 2b79a0c: A blocked Continue or submit in the create flows (new agent, add connector, add skill and edit skill, add model) now marks the fields that are wrong: a danger edge on the field, the reason right under it (tied to it with `aria-invalid` and `aria-describedby`), and the keyboard focus on the first one. The generic "Please fix the following" box is gone, except for the few problems no field on the step can show. Add skill no longer greys out its button while fields are missing; pressing it shows which ones.

  `ui-react` adds the shared mechanism: `useFieldValidation`, `fieldErrorProps` for bui text fields, `useSelectFieldError` for bui `Select`, `FieldErrorText` for hand-rolled fields, and an optional `describedBy` on `SelectableCardGrid`.

- 2b79a0c: The shell's Customize tabs (Agents, Skills, Connectors, Models, Workflows)
  always show their search, however short the list, and gain filters under it in
  the sessions list's chip idiom. Each filter shows only when it would change the
  list — skills from one repository get no Source chips — and each chip counts
  what picking it would leave, over the search and the other picks.

  - **Agents**: Model, and Favorites once something is starred. The environment
    stays the page's Environment select (shown with more than one installation).
  - **Skills**: Source repository, and Usage (used by an agent or not) once the
    agents are read.
  - **Connectors**: Sign-in (how a person signs in) and Connection (connected,
    partly connected, sign-in needed, not connected, deactivated).
  - **Models**: Provider.
  - **Workflows**: Last run (failed, running, succeeded, not run yet). One read
    of the installation's newest 500 runs answers it for every workflow; a
    workflow outside that window reads "No recent run" rather than "Not run yet".

  A list emptied by a filter says so and offers _Clear filters_; a new filter
  starts the windowed list again from its first page.

  ui-react adds `CatalogFilterBar`, `CatalogNoMatch` and `useCatalogFilters`
  (faceted single-choice filters: chips up to six values, a select beyond).
  Inside agent-platform, the skill catalog's Source and Usage filters are their
  own `SkillsFilterBar` and `useSkillFilters`, for the agent wizard's skill step
  to reuse.

- 3043a1d: Form fields in the Agent Platform are now checked when you leave them, not
  only when you press Continue or Submit: a field you typed in shows its
  problem as you move on, an empty field you only tabbed through stays quiet
  until you submit, and a shown error clears the moment you fix it. Submit still
  shows every remaining problem and moves the focus to the first.

  `useFieldValidation` tracks each field: `errorFor(field, problem)` takes the
  field's name; `blurProps(field, problem, value?)`, `textFieldProps(field,
problem)` and `fieldProps(field, problem)` check a field when it is left (a
  blur caused by pressing a button waits until the press is over); errors
  announce through a polite live region; and `shown` is renamed `submitted`.
  `TextAreaField` passes `onFocus` and `onBlur` through and announces its error
  live only past its character limit.

- 66ac70b: The frontend parses and compares versions with `@giantswarm/semver-ts` instead of npm `semver`, like the backend: `semverCompareSort`, the version filters on the Clusters and Deployments pages, the chart tag and release pickers, and the version label. Versions are read the way Flux reads them, so an incomplete version such as `1.3` now sorts as 1.3.0 instead of after every other version, and the cluster version filters no longer throw on a value that is no version. The version label shows a version as written, without a leading `v` and build metadata. The unused `compare` helper in `gs` is removed.

  `semverCompareSort` takes a `descending` option that sorts newest first and still puts items without a version last, and it parses each value once per comparator.

- 5c82125: Add a "Usage" tab to the Agent Platform section (`/agent-platform/usage`),
  showing your own agent usage over the last 30 days alongside the installation's
  MCP tool calls.

  - The personal section reports sessions, turns, input and output tokens and tool
    calls, two per-day token charts, breakdowns per agent and per model, and your
    top tools and MCP servers. The per-model breakdown is derived from each
    agent's ModelConfig, so it reflects the model an agent runs on _now_ — kagent
    records none per session — and the table says so. Every number is **your own**: kagent scopes its session list to
    the caller, and on an installation running kagent in `unsecure` mode — where
    the list is everyone's — the page's copy switches rather than claiming
    ownership it cannot support.
  - A new `GET /api/agent-platform/kagent/session-usage` derives it. kagent stores
    no usage summary of any kind, so the route reads each session's conversation
    and totals it server-side, bounded by `agentPlatform.kagent.sessionUsage.*`
    (window, session cap, concurrency, timeouts, budget, cache TTL). It answers a
    partial summary with `skipped`/`unreadable` set rather than failing, and the
    page says so.
  - The MCP usage view **moves** off muster's own tab strip into this page as a
    clearly-scoped second section, contributed as an extension so neither plugin
    depends on the other. `/agent-platform/muster/usage` redirects, and muster's
    Dashboard card retargets. Its 24h/7d/30d switcher is gone: one window for the
    whole page, so the two sections stay comparable.
  - `Stat` and the tone palette move to `ui-react` (three copies existed), and
    `StackedBarChart` gains optional `formatYAxisTick`, `yAxisWidth` and
    `formatValue` so it can carry seven-digit token values. The session detail
    page's stat labels therefore render uppercase, and its longest label shortens
    to "Input tokens (billed)".
  - No cost, tokens/second or context-window figures: kagent records none at any
    version, including v0.10.

- 4f6d765: Add `Gate`, the dashed-border auth gate with a lock icon and an optional action,
  moved here from the muster plugin so the gs installation-inventory gate can use
  the same box.
- 2b79a0c: Long lists of connector capabilities and environments stay readable. The new
  connector's Test step previews six tools and reveals more six at a time
  instead of all at once, and says how many tools the connector has when it
  lists more than were read. A connector's Resources and Prompts tabs show 20 at
  a time, with a search once there are more than 20, and still mark a list that
  is only muster's first page. Notes and alerts that name environments (the
  unreachable-environments warning, the not-reachable note, GPU capacity and GPU
  node pool notices) name the first five and count the rest, group environments
  that failed the same way, and keep the full list behind a disclosure. The
  Profile page shows the first 20 environment badges with _Show all_. ui-react
  adds `joinNames` and `groupNames` for these sentences.
- 4114dde: A page whose first read failed no longer says "No items" while the retry
  waits for the tab to come back to the foreground: it shows its loading state
  until the retry answers, then the data or the error. `isAwaitingData` in
  `ui-react` is the shared check (no data yet, fetching or waiting to retry),
  used in place of react-query's `isLoading`, which is false while a retry is
  paused.
- 731296e: A footnote reference in a template's description, a scaffolder step's note and
  an installation's non-standard access docs jumps to its footnote: they render
  through `GSMarkdownContent`. `GSMarkdownContent` takes a `linkTarget`, the
  target of links out of the document; a footnote's links stay in the page.
- ee2786b: `GSMarkdownContent` renders ` ```mermaid ` blocks as SVG diagrams in the
  theme's light or dark palette, so Hive > Knowledge shows a document's diagrams
  instead of their source. A diagram that cannot be rendered shows its source
  under a note saying why. The new `MermaidDiagram` export renders one diagram on
  its own; ai-chat uses it instead of its own copy.
- cfb83c6: The model page splits into Overview, Usage and Used by tabs, each its own
  address under the model's, in one column. Overview holds the serving status,
  the facts that sat beside the page (with a "Managed by" fact for a model a
  tool owns, in place of the banner), then the Technical details fold-out. Usage
  holds the gateway's 30-day figures and the spend per day. Used by, counted in
  the tab as on the skill page, lists the agents as the skill and connector pages
  do, each linking to its page with its spend on the model at the row's end. A
  model agents cannot use yet says why at the top of Overview, in plain words
  taken from the condition that actually failed: what is wrong and what to do,
  with kagent's reasons left to the Technical details, which open on arrival and
  which the alert's Show conditions reveals. Its status reads Incomplete when
  kagent accepts its settings but cannot find what they refer to, such as the key,
  and Not accepted only when kagent rejects the settings. For a Helm-rendered model,
  Technical details show the owning HelmRelease: its chart, version and state,
  linked to its deployment page.

  `ConditionsList` writes each condition's status, reason and message as a
  label/value list, as the rest of the technical details are.

  `FoldOutAlignedSection` insets a Details tab's facts as `TechnicalDetailsFoldOut`
  insets its title; the connector and workflow Details tabs and the model
  page's Overview share it.

  `TechnicalDetailsFoldOut` takes a ref with `reveal()`, which opens it, scrolls
  it into view and focuses its trigger.

  `ModelConfig.getFailedCondition()` returns the condition that failed, in the
  order kagent evaluates them.

- 94a61cb: Revamp the muster "Create workflow" / edit-ad-hoc-workflow modal and share its editor.

  - The `YamlEditorFormField` wrapper now lives in (and is exported from) `@giantswarm/backstage-plugin-ui-react`, next to the `YamlEditor` it wraps, so it can be reused outside the `gs` plugin.
  - The muster workflow modal now edits the definition as **YAML** (seeded via `yaml.dump`, parsed via `yaml.load`) using the shared `YamlEditorFormField` CodeMirror editor instead of a plain JSON textarea.
  - Closing the modal is now an X in the title bar (the footer "Close" button is removed), the Save button uses the standard primary color, and validation output renders in a fixed-height region so the modal no longer resizes when a message appears.

- 7b63a47: MCP server and workflow editing share one definition-editor dialog: the same dismiss lock while a validate or save is in flight, error display and seeding on open, with the server's JSON editor and the workflow's YAML editor. A definition that no longer parses clears the previous success message, and only a parse error marks the editor invalid (the server's JSON editor too), not a failed call. `ui-react` adds `dialogDismissLock`, the busy dismiss lock for a bui `Dialog`, used by `ConfirmDialog`, the definition-editor dialog and the session rename dialog, which also seeds through `useOnDialogOpen`.
- 6b3ac77: MCP server details: the expanded row opens with space between the server name and the first sub-heading instead of the two touching, every sub-heading gets room from its own body, and the Tools block separates its summary line from the tag rows. Every key/value block — configuration, auth/token chain, diagnostics, live runtime, GitOps provenance — is the shared `FactList` from `ui-react` rather than a grid of its own. The registration wizard's Verify step uses it too, so `DefRow` is gone.

  The GitOps footer now says what the rest of the portal says: a new `GitOpsManagedLabel` in `ui-react` carries the GitOps icon, "Managed through GitOps" and an optional link to the source in Git. It replaces the "GitOps-managed (read-only)" badge on the Servers and Workflows pages and the loose "Lifecycle is managed via GitOps" sentence on the standard-server rows, whose footer now matches the registered rows'. `flux-react`'s `GitOpsCard` renders the same label, keeping its own Kustomization/GitRepository lookups.

  The detail body and the action row are on bui: `Text` for the headings and notes, `Flex`/`Box` for the layout, `TagGroup` for the tool pills (each still a real link into the tool explorer, now undecorated) and bui `Button` for the lifecycle actions. The three dialogs behind those buttons stay on MUI for now.

- 4aa60ba: Tool Explorer: a tool's parsed result is shown in the read-only editor (the one
  the Workflow manifest dialog uses) with JSON highlighting and folding, and the
  Table, Parsed and Raw views grow with the window instead of stopping at 480 px.
  `YamlEditor` and `YamlEditorFormField` take a `language` prop (`'yaml'` by
  default, or `'json'`), and `YamlEditorFormField`'s `maxHeight` accepts a CSS
  length. A read-only editor no longer opens with a bracket highlighted, and
  parses long documents fully so their outer levels get fold markers.
- b8afa37: Muster workflow detail page cleanups and a shared chart component.

  - Add a theme-aware `StackedBarChart` component (built on recharts) to
    `@giantswarm/backstage-plugin-ui-react`. Colors, axis text, grid, and tooltip
    all read from the active MUI theme so it looks native in light and dark mode;
    recharts stays an implementation detail behind a small `series`-based API.
  - The workflow detail "Runs per day" chart now uses the shared `StackedBarChart`
    instead of a hand-rolled CSS bar. It spans at least 30 days, fills days with no
    runs with empty entries, and always ends on today so the right edge reads as
    "now".
  - Remove the breadcrumb from the workflow detail header.
  - Render the workflow description's Markdown paragraphs with the standard MUI
    `body1` typography (line height, spacing) so they match other paragraphs.
  - Remove the "Remove via GitOps" button from the GitOps-managed workflow
    actions, and rename "Edit via GitOps" to a plain "Show manifest" outline
    button (same manifest dialog).
  - Remove the redundant collapsible "Definition (YAML)" section from the workflow
    detail page.
  - Align the GitOps "Show manifest" dialog with the "Create workflow" modal: an X
    icon in the title bar (no footer Close button), a primary "Copy manifest"
    button, and the manifest rendered read-only in the shared YAML editor with
    syntax highlighting.
  - `YamlEditorFormField` (ui-react) now accepts a `readOnly` prop, forwarded to
    the underlying `YamlEditor`.
  - The workflow detail "Executions" panels now size to their content and cap at
    the viewport (scrolling internally) instead of always reserving a tall fixed
    height when empty.

- 12aaa8b: The Agent Platform shell gets a Notification inbox: a bell with an unread count
  on the rail's Profile row (on a phone, the count on the Profile item and a
  "Notifications" entry first in its menu), opening the sessions that need the
  person: waiting, failed, or with a finished turn at All activity. Clicking a
  row opens the session and marks it read; a row can mute its session, and "Mark
  all read" clears the count. Rows that arrive while the shell is open raise a
  toast, replacing the needs-input toast, and, once switched on in the overlay, a
  desktop notification. The unread count prefixes the tab's title.

  `agent-platform` exports `useNotifiableSessions` (the person's sessions and
  their states, read every 10 s while the tab is visible and every 60 s while it
  is hidden), `AgentAvatar`, `sessionsListSearch` and `PHONE_FULL_SCREEN_DIALOG`,
  and no longer exports `NeedsInputToasts`. `useFleetSessionStates` takes
  `refetchIntervalInBackground` and tells when every installation has answered
  (`isComplete`). `markSeen` and `markManySeen` take an optional reason, which
  reports a row the person opened (`AgentPlatform.notificationOpened`) or "Mark
  all read" (`AgentPlatform.notificationsMarkedRead`), the two new events in
  `analytics-react`.

  `ui-react` adds `useShellDocumentTitleCount`, which prefixes every shell page's
  document title with a count, "(2) Sessions · Agent Platform", and
  `usePageAttention`: whether the page is visible, and whether its window has
  the focus.

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

- fd7799f: Plans: the proposed plans read as a table, one column per fact. The open pull requests of a plan repository were a list whose facts were run together into one line (`#412 · marians · 7 files changed · updated Sep 18, 2026`); they are now a bui `Table` with PR, Author, Status, Last updated, Title and Epic as columns, sortable, newest first. Only a draft is marked — every row is an open pull request, so a badge on the others would say nothing. The changed-file count is gone, and with it the `GET /pulls/:n/files` request the list made per row.

  The author is the person, not their GitHub login: their photo and display name, linking to their catalog User entity. `UserEntityLink`, a new `ui-react` export, composes that from `EntityRefLink`, which resolves the name and degrades to the bare login for an author the catalog does not know (an outside contributor, a bot). The photo comes from a single batched catalog read for the whole table, because `DefaultEntityPresentationApi` fetches a fixed field list that `spec.profile.picture` is not part of and that cannot be extended. Entity refs are lower-cased, since the catalog indexes them that way — a mixed-case login like `QuentinBisson` otherwise matches nothing and renders with neither name nor photo.

  The epic cell is a plain link to the issue number, since the column heading already says Epic; the board status it used to spell out moves into the link's tooltip. `stopRowPress` moves from `agent-platform` to `ui-react` now that other plugins need it, and the epic link stops its own press from reaching the row behind it, so clicking it no longer opens the epic _and_ the plan.

- b9aff1b: Relative links in a chart's README card, and in a SOUL card, now point to the
  file in the source repository at the README's version, instead of to a
  Backstage page that does not exist. `GSMarkdownContent`, `CollapsibleMarkdown`
  and `CollapsibleMarkdownCard` take a new `sourceUrl` prop for this, and
  `createMarkdownLinkResolver` is exported.
- b4a3dee: `ShellPage` takes `compactHeader`: once everything above the content has
  scrolled out of view, the header turns into one compact row at the top of the
  view (a smaller title, the badges, the actions), without moving the content.
  `ShellPageExpandedOnly` marks what the compact row leaves out. The session
  detail page uses it, keeping the session's name, state, agent, "Show tool
  activity" (not at phone width), the pin and the actions menu in sight.
  Toggling "Show tool activity" keeps the place being read where it is on
  screen. `useScrolledPast` is a new hook (with a `hysteresis` option), and
  `ui-react/testUtils` adds `mockIntersectionObserver`.
- ebd7572: Session messages can carry images. The session page's composer, the home and
  Sessions composer and the New session dialog attach images pasted from the
  clipboard or dropped on the box, as removable thumbnails; they go to the agent
  as A2A file parts with the message, and the transcript shows them as thumbnails
  that open at full size. PNG, JPEG, GIF and WebP only, each drawn and encoded
  again before it is sent, which strips its metadata (a photo's location among it)
  and scales it to at most 2,000 px; at most 2 MiB each, 4 images and 3 MiB per
  message, and 50 images and 16 MiB per session, checked in the composer and again
  in the backend. An agent on the Claude Code or Codex runtime, or whose model's
  provider kagent sends no images (Ollama, Bedrock, Mistral, SAP AI Core), says it
  cannot take images. The backend's message routes take 5 MB bodies, and a
  conversation too large for one task listing is read in smaller pages. `ui-react`
  adds `ComposerAttachmentList`, and `ComposerFrame` gains an `attachments` slot
  and a drop state (`isDropTarget`, `dropLabel`). `kubernetes-react` adds
  `harnessRuntimeOf` and `Agent.getInlineHarnessRuntime`. The chart raises
  ingress-nginx's `proxy-body-size` to `6m`.
- eb7ed35: A long user message on the session page, and in the create-agent assist panel, is cut to 10 lines of its text, with _Show more_ centred in the bubble under the fade and _Show less_ at the end of the opened text — a continued session's opener, which carries the whole earlier conversation, or a pasted log no longer fills the page. A message only a line or two longer is shown whole, and find in page or keyboard focus past the cut opens the message. `ui-react` exports the pieces behind `CollapsibleMarkdown` (`useCollapsible`, `CollapsibleViewport`, `CollapsibleToggle` with `onSolid` for a filled surface, `collapseSlack`), and `mockCollapsibleLayout` from `testUtils`; `CollapsibleMarkdown` now also shows whole a document that would hide no more than a fifth of its cut.
- 2b79a0c: Detail pages in the agent-platform shell no longer flash a different page layout while they load. The agent, model, skill, session, connector and workflow pages render their final header (breadcrumbs, avatar or tile, title line, badge row, tabs, facts column) from the first paint, with skeletons where the data is still being read. An agent, model or session already in the query cache renders at once, instead of showing the loading state while the persisted cache is restored. Opening a detail page no longer shows the section's list header ("Agents", "Sessions", "Models") while the page's code loads, and the Agents and Sessions tabs wait for the agent-platform cookie only once per page load instead of on every visit. `ShellPage` gains `ShellPageTitleSkeleton`, `ShellPageBadgeSkeleton` and `ShellPageFactsSkeleton` for these loading states.
- 2b79a0c: Add `ShellPage`, the agent-platform shell's page frame (breadcrumbs, a title row with badges and actions, routed tabs, the content with an optional column beside it), `FullScreenWizardFrame`, a create flow over the whole viewport with a step strip, Close, Cancel and Back, `FactsColumn`, the facts column beside a detail page's content, and `StatusDot`, a state dot in the bui colour of its tone, or an app's custom property named by `colorVar`, with an optional label.

  `FactList` takes an optional `stacked` prop that puts each label above its value. Without it the list renders as before.

- 2b79a0c: `ShellPage` and `FullScreenWizardFrame` now claim the page header with the new `useOwnPageHeader` hook, and a layout reads `usePageHeaderOwned` to draw no header of its own. Under the `agent-platform-shell` flag, every Agent Platform page that renders a `ShellPage`, such as the Sessions list and a connector's page, shows one title and each header action once.
- 2b79a0c: Classic pages keep their pre-shell `InfoHint` and `FactList` behavior. The press-to-open popover, the larger hit area and the 600px stack point now apply only inside the agent-platform shell, which marks its pages with the new `ShellScopeProvider`. Markdown tables in `GSMarkdownContent` and the session timeline scroll instead of breaking words mid-word in their cells. The shell flag is read once per app load (`isAgentShellOn`), so the shell's pages and chrome always agree.
- 14e878c: Cut a skill card's description down to three lines, with _Show more_ for the rest.

  Skill descriptions vary from a few words to a paragraph, and the card grid sizes
  every card in a row to the tallest one — so a single long description left the
  Select skills step (and the Edit agent skill picker) with rows of mostly empty
  cards and far more scrolling than there were skills. Descriptions now clamp to
  three lines, and the full text is a click away on the cards whose text is
  actually cut off.

  That click is a small _Show more_ button in the card's bottom-right corner, faded
  in while the pointer is on the card or it has keyboard focus. It is positioned
  out of the card's flow, so a card that has one is exactly as tall as a card that
  does not and the grid keeps its rhythm either way.

  It sits outside the card's selection button: `SelectableCard` takes an optional
  `hoverAction` for a control of its own. A nested `<button>` would be invalid
  markup, and `role="checkbox"` makes its children presentational, so a control
  inside the card would have been hidden from assistive tech and pressing it would
  have selected the skill.

  That same rule is why a skill's description never reached a screen reader, whole
  or clamped: the card announced only its name. `SelectableCard` now takes a
  `describedById`, and the skill cards point it at their description, so the text
  is announced in full however the card is displayed.

  New `useIsTruncated` hook in `ui-react`: whether an element's own styling — a
  line clamp or an ellipsis — is cutting its content off, re-measured as the
  element resizes, so the same text can show a toggle in a narrow card and none in
  a wide one.

- 2b79a0c: A skill's page takes the Agent page's shape. Its actions — Edit, View source
  and Evaluate (now the primary button) — sit at the header's right as buttons,
  as on an agent, and the description moved from the header into the page. Three
  routed tabs: Overview (what the skill is for, its source, path, branch and
  pinned commit beside it), Instructions (`…/instructions`: the SKILL.md body
  rendered as Markdown — GFM, no raw HTML, images as links rather than remote
  loads, relative links resolved into the skill's folder at its pinned commit;
  offered only when the portal can read the file) and Used by (`…/used-by`, the
  windowed list of agents, with its count on the tab). Page views of the two tabs
  report `view: 'instructions' | 'used-by'`.

  `ShellPage` gains `tabsBasePath` and `RouteTabs` `basePath`, for a page whose
  own address is part of its route's splat.

- 14e878c: Show a progress bar while the skill catalogue is being discovered.

  Discovering skills means reading every configured skill repository, which takes a
  few seconds on a cold cache. The Select skills step of agent creation and the
  skill picker on the Edit agent page both showed a single line of grey text while
  that ran, so the page looked static. They now render an indeterminate progress
  bar above that line.

  New `LoadingIndicator` export in `ui-react`: a `Progress` bar plus a muted label,
  for a region that has nothing to show yet. The bar is held back for 250ms, so a
  query that resolves from cache — which the Select skills step arranges by warming
  the catalogue on step 1 — does not flash one.

- a2443de: `StackedRow` takes a `description`, cut to two lines, that a press opens the
  row's link through. `ShowMore` takes `initialShown` and `useCatalogFilters`
  takes `initialSelection`, to start a list where a person left it.
  `TechnicalDetailsFoldOut` takes a `title` for one piece of technical detail
  with a name of its own.
- 2b79a0c: `StackedRowList` draws `StackedRow` children after its `rows`, for rows that
  are components of their own (a row that calls a hook for its status and
  actions).
- 2b79a0c: New `StatusHint`: the explanation of a state in a list, behind an info icon
  named "About the state of <subject>", so a status cell keeps to a dot and a
  few words. It is the hint the Customize Connectors list introduced, made
  shared.
- b44a375: Tabs with a count no longer change width when the count arrives, so the tabs
  to their right stop moving under the pointer. `RouteTabs` (and `ShellPage`'s
  `tabs`) take `count: 'loading'`, drawn as a skeleton as wide as a two-digit
  count, and a loaded count always reserves two digits' width. Customize's tabs
  and Connectors sub-tabs, a connector's Tools tab and a skill's Used by tab pass
  it while their data loads, their loading frames included. `RouteTabCount` is
  exported; the Customize count types (`CustomizeCounts`,
  `MusterCustomizeCounts`) now say `'loading'` instead of leaving a loading count
  out. `MusterInstance` gains `isLoadingWorkflows`, so Customize's Workflows tab
  waits for the workflows' own read instead of showing 0 until it lands.
- 2b79a0c: `Breadcrumbs` (and so every `ShellPage` with breadcrumbs) leads with a back arrow: an icon link to the nearest ancestor that has an href, labelled "Back to <ancestor>" for assistive technology. A trail without a linked ancestor has no arrow. At phone width the arrow is a 44px target without making the row taller.
- 0bed874: Add `Breadcrumbs`, a bui-based trail of links to a page's ancestors with the current page last. `useDetailsPane().getRoute` takes `{ keepSearch: true }` to keep the current query string (minus any earlier pane's parameters), for a link that opens the pane over the page it is on.
- e807fa6: Add `CollapsibleMarkdown`: markdown cut to a fixed height behind a fade, with a
  bui toggle button (`aria-expanded`, `aria-controls`) that shows all of it; it
  expands when keyboard focus reaches a link past the cut.
  `CollapsibleMarkdownCard` moves here from the gs plugin and is built on it, and
  the copy button of `CodeBlock` is available on its own as `CopyButton`, with a
  `compact` size for card headers and code blocks.
- b097034: Add `ComposerFrame`, the box of a chat-style composer: a text field that grows
  with its content between `minRows` and `maxRows`, with leading and trailing
  controls inside the same border underneath it, and `useAutosizeTextarea`, the
  hook it grows the field with.
- 2e425c5: `ConditionsList`: new optional `order` prop. Given a list of condition types in the order the controller evaluates them, the list follows that order instead of the transition time, so the first failing condition, which starts expanded, is the root cause rather than a later stage it blocks.
- b9433d4: New `EmptyStateCard`: a full-width bordered panel with centred, larger-than-body
  copy and a call to action, for the first-run state of a page whose content is a
  list. An empty table with column headers says nothing about what its rows are or
  how to create one — this says both and offers the next step.

  `NotAvailable` remains the placeholder for a single missing value, and an `Alert`
  the right shape for a read that failed; this is for "there is nothing here yet".

- 2b79a0c: `useFieldValidation()` returns `reset()`, which puts the form back to quiet as before its first blocked attempt — for a form that stays mounted while closed, such as a dialog, so it does not reopen with the last attempt's errors showing. In a dialog, pass a ref inside the dialog's body as the `scope`.
- 2b79a0c: Two form building blocks for the create flows: `FormFieldGrid` puts fields side by side (two columns from bui's `sm` breakpoint) with their inputs on one line regardless of how long each label or description runs — each field's label, control and error sit on shared rows through CSS subgrid — and `MoreOptions` is the agent wizard's "More options" disclosure (a controlled native `<details>` with a one-line summary of what it holds), for a flow's technical knobs.
- 322e58c: `StructuredMetadataList` renders a description list (`dl`/`dt`/`dd`) on bui
  `Text` instead of MUI `Typography`, so its keys are no longer `h6` headings.
  `SimpleAccordion` and `ConditionsList` take a `headingLevel` prop (default 3)
  for the heading bui renders around each trigger.
- 2b79a0c: The full-screen wizard frame became an in-content one. `FullScreenWizardFrame`
  covered the whole viewport, hiding the shell's rail; its replacement,
  `WizardFrame`, renders in the page's content area instead — the header row
  with Close, the title and the step strip on top, the step's content in a
  centered column (`width`: narrow 640, medium 760 or wide 960), and a sticky
  footer with Cancel, Back and the step's registered actions. Steps keep
  publishing their primary buttons through `useProvidePageHeaderActions`, and
  the frame still claims the page header. The Escape-to-leave shortcut is gone
  with the overlay: an in-content page should not discard a form on Escape.

  The connector wizard's form language is now shared for every create flow:
  `WizardStepHeading` (the step's h2 with a muted intro), `SelectableCard` /
  `SelectableCardGrid` / `StaticCard` (the option cards the muster and
  agent-platform plugins each carried a copy of, merged — radio and checkbox
  flavours, optional `disabled`, hover action and extra class name), and
  `TextAreaField` (the bui-TextField-styled textarea with optional character
  counter and inline error).

- 2b79a0c: - `ShowMore` shows a remainder too small to be worth a click with the page
  before it, in both modes: up to a fifth of a page, never fewer than two
  (`showMoreSlack(pageSize)`: 4 at the default 20, 2 at `USED_BY_ROWS`). A
  list of 21 at a page of 20 renders all 21 with no button. A page that
  reaches such a remainder includes it, and its button says so ("Show 24 more
  agents").
  - `ShellPage` publishes its bottom padding as the CSS variable
    `--shell-page-padding-bottom` (exported as `SHELL_PAGE_PADDING_BOTTOM_VAR`),
    so content docked with `position: sticky` can rest where it sticks.
- 0d6360e: Add `liveRouterState`: the router state of the current history entry, for a replacing navigation that only rewrites the query string and must not drop a handoff a page reads on mount.
- d19ad0c: Add `ManifestDialog`: a controlled dialog that shows a manifest as syntax-highlighted, read-only YAML (the read-only `YamlEditorFormField`), with a **Copy manifest** button that confirms with "Copied". Add `useCopyWithFeedback`, the copy-and-confirm logic `CopyButton` and `ManifestDialog` share. `YamlEditorFormField` now gives the editor its `label` as accessible name.
- b990251: Export `MENU_WIDTH`, the definite width to give a bui `Menu`: without one the
  menu popover lays out twice and the browser reports "ResizeObserver loop
  completed with undelivered notifications", which trips the dev-server overlay.
- 2b79a0c: Mobile primitives for the agent shell at 375px (T22 wave 1A):

  - **Breakpoints, one set**: `PHONE_MAX_WIDTH` (599.95px, the width at which
    the shell swaps its rail for the bottom bar), `TWO_COLUMN_MIN_WIDTH` (768px)
    and touch input, as `matchMedia` queries (`PHONE_QUERY`, …) and JSS media
    keys (`PHONE_MEDIA`, …). `usePhoneLayout()` and `useTouchInput()` answer
    live. `mockPhoneLayout()` / `mockDesktopLayout()` (from the `testUtils`
    entry point, `@giantswarm/backstage-plugin-ui-react/testUtils`) install a
    `matchMedia` for jsdom tests, so a component's phone branch is tested and
    MUI's `useMediaQuery` agrees.
  - **`StackedRowList`**: the phone layout of a list a person opens or acts on —
    title (a link whose hit area is the row), status and actions on line 1,
    secondary facts joined by " · " on line 2. Actions are always reachable.
  - **`usePhoneColumns(columns, keepIds)`**: hides a bui table's other columns
    at phone width, keeping the name and the decisive numbers, instead of
    squeezing every column to a sliver.
  - **`InfoHint`** opens its explanation in a popover on a press (tap, click,
    Enter), so it can be read on a touch screen; hover and keyboard focus still
    show the tooltip on a desktop. Its hit area is 24px, 44px on a phone.
  - **`ShellPage`** switches to phone gutters at 599.95px instead of 600px, and
    at phone width puts its aside first, folded under "Details" (`asideLabel`).
  - **`SelectableCard`** shows its own control (a skill's _Show more_) where
    nothing hovers, under the card's content; long names wrap inside the card.
  - **`GSMarkdownContent`** (and `CollapsibleMarkdown`) breaks long URLs and
    tokens and scrolls a wide GFM table inside itself instead of widening the
    page.
  - **`ShowMore`**, **`Breadcrumbs`** and **`CatalogFilterBar`** wrap instead of
    overflowing at phone width; **`FactList`** stacks at the phone width rather
    than 520px.

- d9673e8: Add `MoreActionsMenu`, a page header's "More actions" ⋮ menu built from a list
  of items, rendering nothing for an empty list.
- 9e57736: Add a `PageHeaderActions` slot so routed page content can contribute action
  buttons to the surrounding page header instead of rendering a second header of
  its own: `PageHeaderActionsProvider`, `usePageHeaderActionsSlot` (for the page
  layout to read), and `useProvidePageHeaderActions` (for content to register
  actions, cleared automatically on unmount).
- 2b79a0c: `RouteTabs` (and so every `ShellPage` tab strip) scrolls sideways at phone
  width instead of wrapping or squeezing: one row of 44px-tall tabs, the
  selected tab scrolled to the middle of the strip on mount and on every tab
  change, a fade at each edge that has more tabs beyond it, and the active
  underline in the right place under any scroll. `ShellPage` lets the strip
  reach through the page gutter to the screen's edges. New `className` prop on
  `RouteTabs` for the strip. Desktop is unchanged.
- d95e52d: New `RouteTabs`: a page's tab strip whose tabs are routes below it, links that keep the page's query string, the index matched exactly, `Title (count)` labels. The muster server page's and workflow page's tab rows use it.
- ff8b3f1: Add `useScrollToTopOnNavigation`, which scrolls the window to the top when the pathname changes. The MCP Servers, Workflows and Agents routers use it.
- 2b79a0c: Move `ShowMore` (with `revealAll`) and the list-scale constants `INITIAL_ROWS`,
  `SEARCH_MIN` and `USED_BY_ROWS`, plus the `countNoun` helper, from the Agent
  Platform plugin into `@giantswarm/backstage-plugin-ui-react`, so the muster
  plugin can window its long lists too (it cannot import from agent-platform,
  which depends on it). agent-platform re-exports them for its existing imports;
  behaviour is unchanged.

  Also adds `searchableIf(options)`: whether a `Select` over these options should
  offer type-ahead (more than `SEARCH_MIN` options).

- 2b79a0c: - **`Stat`** takes `variant="tile"` for a headline figure in its own outlined
  card, with `beside` (e.g. a `StatDelta`) on the value's baseline and a `sub`
  line under it. `StatGrid` lays tiles out four across, two on a phone. The
  default `inline` look is unchanged.
  - **`ShellDocumentTitleProvider`** names the suffix shell document titles end
    with; ui-react no longer hard-codes "Agent Platform". Without a provider a
    title has no suffix.
  - **`testUtils` entry point**: the `matchMedia` test helpers
    (`mockPhoneLayout`, `mockDesktopLayout`, `mockViewport`, …) moved from the
    main entry to `@giantswarm/backstage-plugin-ui-react/testUtils`, so they no
    longer ship with the runtime code.
- a8bb5a6: `SyncMarkIcon`: one icon for how something a manager keeps to a definition
  stands -- the six marks `in sync`, `not in sync`, `not reconciled`, `not
installed`, `failed`, `unknown`, each its own glyph in the colour of a bui
  intent token -- with the words in the tooltip and the accessible name;
  `syncMarkLegend` builds a column header's legend from a page's glosses.
  `intentColor` gives a `StatusLabel` intent's colour as a CSS value.
- 1ec7387: `syncMarkIntent(mark)`: the `StatusLabel` intent of a `SyncMark`, for a
  label that names in words the state a table's `SyncMarkIcon` shows, so the
  two colour alike.
- 6ce4a71: Extract muster's client-side token-boundary search matching (`tokenize`/`matchesQuery`,
  previously a muster-local `lib/workflowSearch.ts`) into
  `@giantswarm/backstage-plugin-ui-react` so other plugins can reuse it for
  quick-search over an already-loaded list, without a backend ranking endpoint.
  The Workflows table's quick-search now imports it from `ui-react`; behavior is
  unchanged.
- 2b79a0c: `WizardFrame` fits a phone. At phone width the title sits over its context line instead of being cut to a few letters beside it, the step strip is one line ("Step 2 of 4 · Skills") over a thin progress bar (the labelled step list stays for assistive technology), Close is a 44px target, and Back is an icon so the footer keeps to one row. The scroll clearance that keeps a focused field clear of the docked footer now follows the footer's measured height, so a footer that wraps no longer covers the field. The frame's padding changes at the shared two-column tier (768px) instead of a 720px breakpoint of its own. New `useWizardFrameAside(width, active)`: a side panel fixed to the right edge reserves its width on the frame, so the step and its Continue stay beside it, and learns whether the frame is wide enough to dock it at all.
- 600a4c3: Highlight the installation name in the Usage tab's intro sentences.

  The Overview, Cost and Conversations views each open with a sentence naming the
  installation they report on ("Spend on gazelle over the last 30 days…"). That
  name is now bold, so the one word that says whose numbers these are stands out
  from the rest of the sentence.

  `SectionHeader`'s `description` accepts a `ReactNode` rather than a `string` to
  allow the inline markup. Every existing caller passes a string, which is still
  valid.

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

- b032f65: A workflow's page is one column of three tabs, each its own address. Overview
  says what the workflow is for under a "What it's for" heading, when it was
  created, what it needs and how it runs. Usage holds its run statistics. Details
  lists where it comes from, its tool name, the connectors it uses and the
  workflows that call it, then a Technical details fold-out listing the CR's
  namespace, labels and referenced tools a row each. The ⋮ menu's "View manifest" shows the
  Workflow CR as YAML with a copy button, for every workflow, beside "Edit in
  Git…" for one Flux reconciles. The facts column and the "Advanced" disclosure
  are gone, and so is muster-backend's unused `GET /workflows/:name` route.

  `ui-react` gains `PageSection`, the heading-and-content section of a detail
  page tab that the agent, skill and workflow pages now share, and a `compact`
  option on `SectionHeader`.

  Inside the agent-platform shell, `FactList` now sets its labels and values in
  the shell's body size (14px) by default; classic pages and stacked lists keep
  12px, and a new `size` prop overrides the default. `Mono` and the new
  `useFactTextVariant` hook follow the size of the list a value sits in, so the
  connector page's Details tab no longer lifts its text size itself.

- 0388b0e: A workflow's page has a Run it tab (`/agent-platform/workflows/<name>/run`),
  after Overview, that runs the workflow as a tool's page runs a tool: the input
  form from the workflow's input schema, the Run button with its note ("Runs as
  you.", "Nothing is changed."), and the result. Connectors its steps call that
  wait for the person's sign-in are named above the form. Without a muster
  session, on an installation without per-user muster sessions, or where muster
  lists no `workflow_<name>` tool for the person, the tab says why instead of
  showing a form. A run refreshes that workflow's run records. While a run is in
  flight, leaving the tab (another tab, a link, a reload) asks first and says
  that muster finishes the run anyway. The page's "Only reads" badge is now read
  off the tool catalogue the page already loads.

  The tool page and the Run it tab share `ToolRunPanel` and `useToolRun`, which
  reports the new `Muster.workflowRan` event for any run of a workflow's tool.
  `ShellPage` and `RouteTabs` take `onTabNavigate` / `onNavigate`, to hold a tab
  switch until the page agrees.

### Patch Changes

- ef01d42: Migrate `AsyncValue` from MUI v4 to bui (`@backstage/ui`). The loading state now
  renders a bui `Skeleton` instead of a MUI `Box` wrapping a
  `@backstage/core-components` `Progress` bar. The public props are unchanged; the
  `height` prop now sets the skeleton's height (default `24`).
- 2789f3d: `GSMarkdownContent`: a footnote reference links to its note and the note's back-reference to the reference, with one `user-content-` prefix on both ends.
- 0a05757: More Agent Platform forms check a field when you leave it and keep their
  buttons pressable: a tool's or workflow's run form, Edit as JSON, Create
  cluster, Delete cluster, Rename session, the agent wizard's Tools step and
  "Update the agents using …". Pressed with a problem, the button now says what
  is wrong on the field and moves the focus there instead of staying disabled
  or showing a banner, and an error clears as soon as it is fixed. Error
  messages for empty fields now say what to enter, for example "Enter a name
  for the agent." or "Enter a value for message.".

  `ui-react` exports `useGroupFieldError`, for a group of controls validated
  as one field.

- 56d8c05: Markdown rendered with `GSMarkdownContent` (README and SOUL cards, plans,
  workflow descriptions): a `#heading` link now jumps to its heading within the
  document. Headings are matched by their GitHub slug, so `#valuesyaml` finds
  `## values.yaml`, and footnotes, ids in raw HTML, `#` and `#top` work as on
  GitHub. A collapsed README or SOUL card expands when the target is past the
  cut.
- ad90805: The MCP server sign-in notice stands clear of what is docked at the bottom of
  the view: a wizard's footer (Continue, Create), the session page's composer and
  the shell's mobile bottom bar. It no longer covers those buttons or takes their
  clicks. `WizardFrame` publishes its footer's height on the document root while
  it is mounted (`WIZARD_FOOTER_HEIGHT_VAR`).
- 22b2ad6: Hive History: a card with a long unbroken title, link or command stays in its column at every width. `InfoCard` keeps to its grid or flex track (`min-width: 0`) and wraps its title anywhere beside the header actions; the History teasers and summary wrap inside long links and paths. The plans fixtures carry such a card.
- 582faca: **Enable** and **Apply changes** open a form seeded from the card's comparison, the person's
  choices only. The dialog took `installation.*` from the record and every other field from the
  schema's default, so Apply changes on a portal titled _Backstage_ opened with _Dev Portal_ in the
  Title field and would have renamed the portal on commit. Now the form holds what the comparison
  read back for every choice (`inputs.values`); a schema default is the empty field's placeholder,
  marked _(default)_, and never a submitted value; the registry's facts, generated and supplied
  values are not asked. Labels are the schema's titles, else the keys in words, qualified with the
  group where two share one (the five switches named `enabled` read Github, Grafana, Flux, Sentry,
  Tunnel); groups are `h3`/`h4` headings; a required choice without a value is marked on its field
  and named next to Review, each name leading to the field.

  `SectionHeader` takes an optional description: without one, the heading stands alone.

- ce9e155: Capabilities tab: the card is built from the portal's components. The state is a `StatusLabel` with the glyph the Installations page's cell shows for the same capability and the legend's gloss on its tooltip; the card is a bui `Card` with two labelled regions, _On record_ -- a definition list of the choices with what each is about under its value, the choices the record lacks marked in place -- and _Compared with the definition_; every file group and skipped-check note is an accordion, closed until opened; the diff's tints and every colour come from bui's tokens, so the card themes with the app. ui-react: `StatusLabel` lays out inline on request, `SectionHeader` takes an `id` for a region it names, `SyncMarkLabel` shows a mark with its words.
- 2b79a0c: `DateComponent` shows the browser's local time below a `DateTimeZoneProvider` set to `local`, with the full timestamp and its zone on hover; without a provider it stays UTC. The Agent Platform shell sets it, so its lists and detail pages show one clock. `DateComponent` no longer passes its `tooltip` prop to the DOM.

  Every Agent Platform page now sets a document title such as "Lab Helper · Agents · Agent Platform". `ShellPage` and `WizardFrame` set it from their breadcrumbs or title (`documentTitle` overrides), through the new `ShellDocumentTitle`, which an outer title template cannot suffix a second time.

- f205e33: `ShellPage` keeps its header actions at the top right beside the title: a long
  title wraps beside them instead of pushing them under its badge row, so the
  session page's pin and menu stay put, on a phone too. Only an action group too
  wide to leave the title its room (192px, 320px with a description; an avatar or
  tile comes on top) moves under it. The avatar or tile sits beside the title's
  first line, as the actions do. A header row with the Environment select lines
  up on its bottom edge, so the buttons beside the select align with its field
  rather than its label. Usage's select and time range are items of that row,
  8px apart, as every header's controls are.
- 2b79a0c: Remove model config on a running model asks first and names the agents that use the config. The agent page's "Update skills…" is now "Update all skills to latest…", and a skill pinned behind its catalog's newest commit shows "Update available". Add GPU node pool is disabled with its reason where no environment has a cluster, and Serve model no longer preselects a preset the nodes cannot serve. `DisabledAction` moves from muster to ui-react.
- 2b79a0c: Meta-agent hand-offs that start a session are named "Create with", "Edit with" or "Evaluate with" the agent, and their strips say a session starts. The skill hand-off also carries a rewritten description of a skill being edited. A hand-off's first message is captioned "Prepared by the portal" in the session it opens. The agent wizard asks before Close or Cancel discards entered input, through the new `confirmDiscard` prop of `WizardFrame`.
- 2b79a0c: `MoreOptions` draws a chevron at the end like the other fold-outs instead of the native disclosure triangle, and `EmptyStateCard` takes an optional `titleRef` to move focus to its heading.
- 2b79a0c: `matchesQuery` and `tokenize` ignore accents, so "cafe" matches "Café".
- 1893681: Show a progress bar while the Tools step reads the installation's presets.

  The Presets card on _Choose the agent's tools_ is filled from muster
  (`filter_tools({ include_presets: true })`), which takes a moment on a cold cache.
  Until the answer arrived the step not only looked static: it offered the three
  built-in presets with the notice _Only the built-in presets are known_, a claim
  that is not yet true while the read is in flight. The notice now waits for the
  read and a `LoadingIndicator` runs in its place. The cards do not wait — the
  built-in list stays valid whatever muster answers, so it is selectable from the
  first paint, including through the ~7s of retry backoff a failing read takes
  before it gives up.

  The catalogue below it reads the same way: its `Reading the catalogue…` line gets
  the progress bar too.

  `LoadingIndicator` in `ui-react` now holds its label back for the same 250ms
  `Progress` holds the bar back for. It used to render the label immediately, so a
  fetch that resolved in under 250ms flashed a bare line of grey text with no bar
  under it — the opposite of what the delay is for. Also affects the Select skills
  step and the skill picker on Edit agent, its two other call sites.

- 6e0bd9d: `ConfirmDialog` takes `isConfirmDisabled`: the confirm button locks while the
  caller's own precondition is not met (a dry run still running, a refusal,
  nothing that would change), while the dialog itself stays dismissable.
- 2b79a0c: `StackedBarChart`'s legend (`showLegend`) is now a list under the chart that wraps in the page's flow. Before, recharts' legend had a fixed 28px, so many long series names (eight models on Cost per day) ran over whatever followed the chart at phone width. The plot keeps its `height`.
- d63665c: `SyncMarkSkeleton`: a mark's placeholder while the manager has not answered
  yet, in the same box as `SyncMarkIcon` -- one icon's square laid out as a
  block, without a line box of its own -- so a table row keeps its height when
  the icon replaces the skeleton.
- 2b79a0c: Additive options for shared components: `CopyButton` takes a `tooltip`, `ManifestDialog` takes `children` and an optional `manifest`, `CatalogNoMatch` no longer requires `isFiltered`/`onClearFilters` for a search-only list, and `getRelativeDate` is exported.
- 2b79a0c: The create flows' Cancel / Back / Continue bar (`WizardFrame`) keeps one position: at the bottom of the view even when the step is short, and docked there while a long step scrolls behind it. At phone width it sits above the agent shell's bottom navigation instead of behind it.
- 2b79a0c: `WizardFrame` with `confirmDiscard` set also asks the browser to confirm a reload or a closed tab.
- 2b79a0c: `WizardFrame` takes a `rail`: a sticky panel docked to the right of the step at
  the two-column tier when the step keeps at least 400px beside it.
  `useWizardFrameRail()` tells the step whether it is docked, so it can show a
  narrow fallback instead.

## 0.8.5

### Patch Changes

- 3953b15: Re-observe element when ref target changes in `useContainerDimensions`.

## 0.8.4

### Patch Changes

- b928d80: Add `passwordManagerIgnoreProps` utility for suppressing password manager autofill on form fields. Add `height` and `maxHeight` options to the `YamlEditor` component.
- 8a1fbdc: Fix version truncation not working on deployment details page.

## 0.8.3

### Patch Changes

- 9d911b1: Migrate card components from Material-UI to @backstage/ui Card primitives.

## 0.8.2

### Patch Changes

- c06f5bf: Replace SelectedResourceDrawer with shared DetailsPane component from ui-react. Add prefix support and open() method to useDetailsPane hook. Rename installationName to cluster in DetailsPane params.
- c06f5bf: Move DetailsPane component and useDetailsPane hook from gs plugin to ui-react for reuse across plugins.

## 0.8.1

### Patch Changes

- 843fedf: Focus YamlEditor when clicking on the editor wrapper area.

## 0.8.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.7.3

### Patch Changes

- 24c279b: Improve link rendering in AI chat

## 0.7.2

### Patch Changes

- b1b1b7a: Move ExternalLink component from gs plugin to ui-react.
- b1b1b7a: Move `AsyncValue` component from `gs` plugin to `ui-react` shared library.
- b1b1b7a: Move ErrorStatus component from gs plugin to ui-react.

## 0.7.1

### Patch Changes

- f665c62: Fix AutocompleteOption to display label instead of value.

## 0.7.0

### Minor Changes

- 7f837a5: Add YamlEditor component.

## 0.6.1

### Patch Changes

- 1f347ff: Display items count in Autocomplete options.

## 0.6.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

## 0.5.1

### Patch Changes

- 3030f54: Fixed Flux resources table sorting.

## 0.5.0

### Minor Changes

- f206288: Added Flux status card.

## 0.4.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

## 0.3.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

## 0.2.0

### Minor Changes

- 8685deb: Added Flux overview UI.
