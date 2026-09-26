# @giantswarm/backstage-plugin-flux-react

## 0.15.0

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

- 573b34d: Show the condition that explains the failure on the Flux HelmRelease details
  card, instead of the rollback that hides it.

  - helm-controller summarizes a release into `Ready` by mirroring one of
    `Released`, `TestSuccess` or `Remediated` into it verbatim — same reason, same
    message. So a failed upgrade showed its real error only until the failure was
    remediated: the rollback then overwrote `Ready` with "Helm rollback to previous
    release … succeeded", and the card switched from the error to information about
    the previous, working release. The new
    `HelmRelease.findFailureCauseCondition()` returns the failing `Released` (or
    `TestSuccess`) condition, which keeps the error until the next release attempt,
    and the card takes its Status, Message and failure time from there. Where
    several release conditions are failing, the most recent transition wins — an
    upgrade that succeeded with failing Helm tests leaves `Released` true and
    `TestSuccess` false, and a failed upgrade can leave a stale failing
    `TestSuccess` from an earlier cycle behind.
  - The same substitution fixes a stalled release, observed live: helm-controller
    stops retrying, sets `Stalled`, and leaves `Ready` at `Unknown` with
    "reconciliation in progress" — so the card reported a release that failed two
    months ago as "Last reconciled". `Ready` is treated as uninformative when it is
    `Unknown` on a stalled release, which is safe because `Unknown` never reports a
    failure; a blocker always writes `False`.
  - Substitution otherwise requires `Ready` to be a verbatim mirror of `Remediated`
    (or of a `RetriesExceeded` `Stalled`), not an allow-list of remediation reasons.
    The mirror test keeps a newer, unrelated blocker visible: when the object fails
    again
    after the rollback for a reason that never reaches a release attempt
    (`ArtifactFailed`, `DependencyNotReady`, a missing `valuesFrom` Secret, a
    denied release), `Ready` carries that current blocker, no longer equals the
    remediation, and the older — now misleading — upgrade error is not shown. It
    also covers remediation flavours a reason list would miss: a failed _install_
    is remediated by an uninstall, and the rollback itself can fail (`Remediated`
    is then `False`, and still mirrored into `Ready`).
  - Nothing is substituted while the release is ready or a reconciliation is in
    flight. A HelmRelease with `spec.test.ignoreFailures` stays ready with
    `TestSuccess` failing, and a fresh reconcile of a previously failed object can
    be progressing with a stale failing `Released` left over from the previous
    generation — in neither case is that failure the current state.
  - The remediation is kept as a single line ("Rollback succeeded", "Uninstall
    succeeded", …) rather than dropped, since its full message only restates the
    chart version shown above it. The exception is a remediation that failed
    itself, where the message is the news and is shown in full. A new `Attempted`
    row names the revision the failed release tried, so the running `Chart Version`
    and the version the error talks about can be told apart. The Status line notes
    when the release stopped — "(retries exhausted)" only for a `RetriesExceeded`
    stall, "(stalled)" for a terminal one, since helm-controller also stalls on
    errors it never retried.
  - The card's AI chat prompt and the resource tree's search over failure messages
    use the same condition, so neither asks about — nor matches on — the rollback
    message any more. Both consult it before looking at the `Ready` status, which a
    stalled release leaves at `Unknown`: the button now offers to troubleshoot such
    a release rather than "show me basic details", and its error is searchable in
    the tree.

- 526dd01: Add "Reconcile" and "Suspend"/"Resume" buttons to the Flux resource cards in the
  details panel, so the two common Flux operations no longer require leaving
  Backstage for a terminal.

  - The buttons sit in the card footer and appear on every card in the panel — the
    selected resource as well as its source and dependency cards. Reconcile patches
    the `reconcile.fluxcd.io/requestedAt` annotation (equivalent to
    `flux reconcile <kind> <name>`); the suspend toggle patches `spec.suspend`, and
    its label follows the current state.
  - All eight kinds the panel renders get the buttons, `ImagePolicy` included.
    Note this is a wider set than the `flux` CLI covers: there is no
    `flux reconcile image policy` subcommand, but image-reflector-controller does
    honour the reconcile-request annotation and `spec.suspend` for ImagePolicy, so
    the UI can offer both.
  - Reconcile stays disabled until a requested reconciliation has been picked up,
    determined from the resource itself by comparing the annotation against
    `status.lastHandledReconcileAt` (new `FluxObject.isReconcileRequestPending()`).
    Because that is the resource's own record, the button is also disabled for a
    request someone else made — via the `flux` CLI, say — and the state survives a
    page reload. Reconcile is likewise disabled while a resource is suspended, since
    a suspended resource ignores the annotation.
  - A pending request also triggers the fast (3s) refetch interval so the button
    re-enables promptly, but only for requests that can actually converge:
    suspended objects are excluded (Flux returns early on `spec.suspend` without
    patching status, so the request would stay outstanding forever), and the
    acceleration is bounded in time so an object nothing reconciles — a CRD whose
    controller is not running, say — cannot pin every list on the Flux page at the
    fast interval indefinitely.
  - Buttons are only rendered to users whose cluster RBAC actually permits the
    write. `kubernetes-react` gains a `SelfSubjectAccessReview` probe
    (`useSelfSubjectAccessReview`) that checks `patch` per cluster, API group,
    resource and namespace, cached so one review covers every card of that kind in
    that namespace. It fails closed: while the review is in flight, or if it fails,
    no buttons appear. Note that omitting the resource name means a user granted
    access through an RBAC rule with `resourceNames` will not see the buttons.
  - The verdict is deliberately kept out of the persisted (localStorage) query
    cache, which outlives the session — a rehydrated `allowed: true` could belong
    to a previous user on a shared browser or to a since-revoked grant, and would
    render the buttons on first paint only for them to vanish. `kubernetes-react`
    exports `NON_PERSISTED_QUERY_META` and a `shouldDehydrateQuery` filter for this,
    now wired into the `flux`, `gs` and `agent-platform` QueryClientProviders.
  - The redundant `flux reconcile`, `flux suspend` and `flux resume` entries are
    removed from the card's copy-command menu; `kubectl get -o yaml` and
    `kubectl describe` remain.
  - `kubernetes-react`: new `patchResource` helper and `useFluxResourceActions`
    hook (the first Kubernetes write path from the browser — authorization is the
    signed-in user's own OIDC token against the cluster's RBAC, and a rejected
    patch is reported as a permission error), plus
    `KubeObject.getResolvedGVK()`, which reports the group and API version an
    object was actually read at so writes and cache invalidations target the same
    version discovery resolved (and reports an empty group for core resources,
    where `getGroup()` returns the version).

- 2c383a6: Detect when a Flux resource's `spec.suspend` is under declarative management, and
  disable the Suspend/Resume toggle rather than offering a change that would be
  silently undone.

  - Server-side apply is field-level, so what matters is not whether a resource is
    GitOps-managed but whether the _applied manifest asserts `spec.suspend`_. When it
    does, the applying controller force-takes the field back on its next apply
    (Flux's SSA always passes `ForceOwnership`) and an imperative suspend lasts only
    until then. `FluxObject.isSuspendFieldManaged()` reads this off
    `metadata.managedFields`, which the API already returns: any entry with
    operation `Apply` that owns `f:spec.f:suspend`. The toggle is disabled with a
    tooltip naming the owning manager(s) and pointing at the source that applies
    the field — deliberately not "change it in Git", since the applier may equally
    be a chart rendered by helm-controller or a human's
    `kubectl apply --server-side`.
  - Not restricted to `kustomize-controller`: a human `kubectl apply --server-side`,
    or helm-controller's drift correction when `spec.driftDetection` is enabled, has
    the same effect.
  - Stale ownership is accounted for. A `managedFields` entry is only rewritten by a
    write, so it outlives the applier: an object handed over for manual control with
    `kustomize.toolkit.fluxcd.io/reconcile: disabled` or
    `kustomize.toolkit.fluxcd.io/ssa: Ignore` keeps a stale `Apply` entry naming the
    field, and `ssa: IfNotPresent` objects carry one from creation onwards despite
    never being applied again. Those three annotations short-circuit the check, so
    such objects keep a working toggle instead of a permanently disabled one.
  - **Detection is limited to SSA appliers**, and is a best-effort signal rather
    than a guarantee. The two common non-SSA declarative writers are recorded as
    `operation: Update` and so are not detected, even though both keep a stored
    desired state and re-assert it: client-side `kubectl apply`
    (`kubectl-client-side-apply`), and a plain `helm upgrade`, whose three-way merge
    resets drift on chart-declared fields. A chart that ships a Kustomization with
    `spec.suspend` declared will therefore still show an enabled toggle whose change
    the next upgrade reverts. Documented on
    `KubeObject.getApplyFieldOwners` rather than guessed at from manager names.
  - **Reconcile is deliberately left enabled**, including on managed resources. The
    `reconcile.fluxcd.io/requestedAt` annotation is never part of an applied
    manifest, so no apply-owner asserts or prunes it, and the controller records the
    value into `status.lastHandledReconcileAt` rather than clearing it. There is no
    race to lose.
  - `kubernetes-react` gains a general `KubeObject.getApplyFieldOwners(path)` for
    this, handling `fieldsV1`'s `f:`-prefixed encoding and atomic parent fields.
  - Writes now set `?fieldManager=giantswarm-backstage` explicitly
    (`BACKSTAGE_FIELD_MANAGER`). The apiserver otherwise derives the manager name
    from the request's User-Agent, which for a write proxied through the Backstage
    backend is unpredictable and useless for auditing. A deliberate name makes our
    changes attributable in `--show-managed-fields`, and gives operators a value for
    a controller's `--override-manager`. We deliberately do not masquerade as
    `flux`: nothing in Flux keys off that name — the CLI never sets a field manager
    at all, and kustomize-controller's disallowed-manager list does not include it —
    so impersonation would buy nothing and destroy attribution.
  - Corrects the `ImagePolicy` justification in the actionable-kinds list. The claim
    that Flux offers neither operation for the kind was wrong: both `v1` and
    `v1beta2` declare `spec.suspend` and `status.lastHandledReconcileAt`, and the
    CLI covers it as well (`flux reconcile|suspend|resume image policy`). Including
    the kind was right; the stated reason was not.

- b431a04: Let users ask the AI chat to explain Flux error messages. ai-chat-react exports a new `buildExplainErrorMessage` prompt builder that embeds a resource's failing condition message plus context (kind, name, namespace, cluster, reason, revision). The Flux resource card's "Troubleshoot with AI" button now sends the actual error message instead of asking the AI to look the resource up, and the HelmRelease conditions card on the deployment details page gets an "Explain this error" button on failing conditions. The buttons render nothing on installations without ai-chat enabled.
- b2c5996: Roll up failing descendant status in the Flux resources tree and add a "Failing only" status filter. Parent nodes now show a warning indicator when any resource beneath them has `Ready=False` (visible while collapsed), and the new Status filter prunes the tree to only the paths that lead to failing resources — the UI equivalent of `flux get kustomizations --status-selector ready=false`.
- ca6ffd8: Flux tree search now also matches the Ready condition messages of failing resources. Flux embeds the names of resources it fails to apply in its build/apply error messages, so searching for a service that never got created leads straight to the Kustomization that is blocking it. Messages of healthy resources are not matched to avoid noise.
- e8c6d73: Show a warning banner on the deployment details page when an ancestor Flux Kustomization is suspended or failing and therefore blocking updates to the deployment. The banner names the topmost blocked Kustomization, shows its Ready condition message, and links to the Flux overview with the resource selected. flux-react exports the new `FluxBlockedByCard` component and the `findKustomizationAncestors`/`findBlockedAncestors` utilities.
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

### Patch Changes

- d87fd9d: Fix the Flux resources tree crashing with "TreeWalker must yield at least one root node". Root detection now matches inventory references by namespace and name instead of name only — previously any inventory entry disqualified unrelated Kustomizations sharing its name in other namespaces, which could collapse the tree to zero roots on multi-org clusters. An empty tree (also reachable via the "Failing only" filter on a cluster without failures) now renders an empty state instead of crashing.
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

- d29ac2a: Migrate the Flux details panel to bui (`@backstage/ui`)

  - Rebuild the details-panel frame (`Section`, `Details`, and the
    Kustomization/HelmRelease/Repository/ImageAutomation detail components) on bui
    `Flex`/`Box`/`Text`, replacing legacy `@material-ui/core` + `makeStyles`
    layout.
  - Migrate the full `ResourceCard` tree (`ResourceCard`/`ResourceWrapper`,
    `ResourceInfo`, `ResourceHeading`, `ResourceStatus`, `ResourceChips`,
    `ResourceMetadata`, `CopyCommandMenu`) to bui. `CopyCommandMenu` now uses the
    bui `MenuTrigger`/`Menu` with a `ButtonIcon` trigger. The card's custom
    theme-aware background colors are intentionally kept in a colocated
    `makeStyles`, as bui has no equivalent token.
  - Because `ResourceWrapper` and `ResourceInfo` are also used by the tree-view
    node (`ResourceNode`), the tree view's card appearance is updated to match.
  - Resource cards in the details panel are now collapsible bui `Accordion`s
    (expanded by default): the name/kind/status row is the trigger and the
    metadata/actions are the revealable panel. The card keeps its rounded corners
    and status-colored background (including the not-ready tint), the resource name
    is a bold heading, and the expand/collapse caret is aligned to the top-right of
    the header.
  - Add render tests for `Details`, `ResourceCard`, and `CopyCommandMenu`.

- 6b3ac77: MCP server details: the expanded row opens with space between the server name and the first sub-heading instead of the two touching, every sub-heading gets room from its own body, and the Tools block separates its summary line from the tag rows. Every key/value block — configuration, auth/token chain, diagnostics, live runtime, GitOps provenance — is the shared `FactList` from `ui-react` rather than a grid of its own. The registration wizard's Verify step uses it too, so `DefRow` is gone.

  The GitOps footer now says what the rest of the portal says: a new `GitOpsManagedLabel` in `ui-react` carries the GitOps icon, "Managed through GitOps" and an optional link to the source in Git. It replaces the "GitOps-managed (read-only)" badge on the Servers and Workflows pages and the loose "Lifecycle is managed via GitOps" sentence on the standard-server rows, whose footer now matches the registered rows'. `flux-react`'s `GitOpsCard` renders the same label, keeping its own Kustomization/GitRepository lookups.

  The detail body and the action row are on bui: `Text` for the headings and notes, `Flex`/`Box` for the layout, `TagGroup` for the tool pills (each still a real link into the tool explorer, now undecorated) and bui `Button` for the lifecycle actions. The three dialogs behind those buttons stay on MUI for now.

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
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [67a32ef]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [87b1c2e]
- Updated dependencies [6822ed1]
- Updated dependencies [573b34d]
- Updated dependencies [526dd01]
- Updated dependencies [2c383a6]
- Updated dependencies [b431a04]
- Updated dependencies [5c82125]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [322e58c]
- Updated dependencies [94a61cb]
- Updated dependencies [c604256]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [c81464c]
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
  - @giantswarm/backstage-plugin-ai-chat-react@0.6.0
  - @giantswarm/backstage-plugin-gs-react@0.1.0

## 0.14.2

### Patch Changes

- 2ed9ab4: Flux tree view now fills the available viewport height with its own internal scrolling, instead of collapsing to the height of the filter column. The tree also sits flush against the right and bottom page edges, and the gap above it is reduced.

## 0.14.1

### Patch Changes

- Updated dependencies [865790a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.16.0

## 0.14.0

### Minor Changes

- 6aea60f: Migrate the Clusters, Deployments, Installations, Catalog, and Flux pages to the new frontend system page header (rendered automatically from the page blueprint's title and icon), replacing the classic `Header`/`PageWithHeader` from `@backstage/core-components`.
  - The Flux page's "List view" and "Tree view" are now sub-pages, rendered as tabs in the page header. `/flux` redirects to `/flux/list`; the tree view remains at `/flux/tree`.
  - BREAKING (`@giantswarm/backstage-plugin-flux-react`): the `FluxPageLayout` component has been removed. `FluxListFilterBlueprint` and `FluxTreeFilterBlueprint` extensions now attach to `sub-page:flux/list` and `sub-page:flux/tree` (input `filters`) instead of `page:flux`.
  - The page subtitles on the Clusters and Deployments pages have been dropped, as the new header does not support subtitles.
  - The catalog page title no longer includes the organization name (`organization.name` config); it is now just "Catalog". Installations can override it via app-config: `app.extensions` → `page:catalog` → `config.title`.
  - The `SupportButton` on the Catalog and Installations pages has been removed, as the new header has no place for it.

## 0.13.3

### Patch Changes

- Updated dependencies [9cf3777]
  - @giantswarm/backstage-plugin-ai-chat-react@0.5.0

## 0.13.2

### Patch Changes

- Updated dependencies [b928d80]
- Updated dependencies [b928d80]
- Updated dependencies [8a1fbdc]
  - @giantswarm/backstage-plugin-ui-react@0.8.4
  - @giantswarm/backstage-plugin-kubernetes-react@0.15.0

## 0.13.1

### Patch Changes

- 9d911b1: Migrate card components from Material-UI to @backstage/ui Card primitives.
- Updated dependencies [9d911b1]
  - @giantswarm/backstage-plugin-ui-react@0.8.3

## 0.13.0

### Minor Changes

- 0860ea0: Update Backstage to 1.49.2. Migrate test utilities from @backstage/test-utils to @backstage/frontend-test-utils. Add @backstage/cli-defaults. Fix zod v3/v4 resolution, AiChatFab route crash, and TypeScript issues.

### Patch Changes

- c06f5bf: Use drawer mode for AI chat button in flux resource cards instead of page navigation.
- c06f5bf: Replace SelectedResourceDrawer with shared DetailsPane component from ui-react. Add prefix support and open() method to useDetailsPane hook. Rename installationName to cluster in DetailsPane params.
- Updated dependencies [c06f5bf]
- Updated dependencies [b5802af]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.1
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.1
  - @giantswarm/backstage-plugin-ui-react@0.8.2

## 0.12.2

### Patch Changes

- Updated dependencies [d7cd901]
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.0

## 0.12.1

### Patch Changes

- Updated dependencies [9997d4a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.0

## 0.12.0

### Minor Changes

- 668ab64: Migrate GS plugin to New Frontend System (NFS) with PageBlueprint, NavItemBlueprint, and ApiBlueprint. Scaffolder field extensions remain on a temporary legacy compat plugin.
- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- Updated dependencies [ebd466f]
  - @giantswarm/backstage-plugin-ai-chat-react@0.3.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.13.0
  - @giantswarm/backstage-plugin-ui-react@0.8.0

## 0.11.1

### Patch Changes

- Updated dependencies [cd72c54]
- Updated dependencies [dde73a8]
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.1
  - @giantswarm/backstage-plugin-kubernetes-react@0.12.0

## 0.11.0

### Minor Changes

- d3fd8a5: Add Inspect/Troubleshoot with AI button

### Patch Changes

- Updated dependencies [24c279b]
- Updated dependencies [d3fd8a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.3
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.0

## 0.10.0

### Minor Changes

- b1b1b7a: Add links to source repository in Kustomization, GitRepository
- 134df14: Add CLI command button to resource details

### Patch Changes

- b1b1b7a: Move ExternalLink component from gs plugin to ui-react.
- b1b1b7a: Move GitOpsCard and related utilities from gs plugin to flux-react.
- cd3f13e: Display more resource details, add some structure
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [cd3f13e]
  - @giantswarm/backstage-plugin-ui-react@0.7.2
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.1

## 0.9.0

### Minor Changes

- 8e3e4a4: Enhance Flux details panel with additional metadata
  - Add creation timestamp, interval, and resource-specific metadata to details panel and list view
  - Extract `findHelmReleaseChartName` utility into flux-react for shared use
  - Add convenience accessors to HelmRelease, GitRepository, OCIRepository, and HelmRepository resource classes

### Patch Changes

- Updated dependencies [23e9f63]
- Updated dependencies [8e3e4a4]
- Updated dependencies [8e3e4a4]
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.0

## 0.8.0

### Minor Changes

- 3e3dd4c: Add support for ImageRepository, ImagePolicy, and ImageUpdateAutomation

### Patch Changes

- Updated dependencies [b4b5fc2]
- Updated dependencies [3e3dd4c]
  - @giantswarm/backstage-plugin-kubernetes-react@0.10.0

## 0.7.1

### Patch Changes

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

## 0.7.0

### Minor Changes

- 009baf6: Add search widget to Flux Tree view

## 0.6.3

### Patch Changes

- 578b11d: Show details for GitRepository, OCIRepository, HelmRepository

## 0.6.2

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.1

## 0.6.1

### Patch Changes

- Updated dependencies [d6b1c2d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.0

## 0.6.0

### Minor Changes

- 644308d: Handle rejected cluster authentication.

### Patch Changes

- Updated dependencies [644308d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.7.0

## 0.5.6

### Patch Changes

- f740242: Added support for API version v2 of HelmRelease
- Updated dependencies [f740242]
  - @giantswarm/backstage-plugin-kubernetes-react@0.6.1

## 0.5.5

### Patch Changes

- 1f347ff: Aligned pagination size options between tables.
- 1f347ff: Change status picker in Flux UI to display static list of options.
- 1f347ff: Added source cluster column to the Flux UI resources table.
- Updated dependencies [1f347ff]
  - @giantswarm/backstage-plugin-ui-react@0.6.1

## 0.5.4

### Patch Changes

- c930bcf: Fixed Flux resources refetching when some clusters authentication is canceled by a user.
- Updated dependencies [3b06846]
  - @giantswarm/backstage-plugin-kubernetes-react@0.6.0
  - @giantswarm/backstage-plugin-ui-react@0.6.0

## 0.5.3

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.
- Updated dependencies [212cfcb]
- Updated dependencies [212cfcb]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.1

## 0.5.2

### Patch Changes

- 3030f54: Fixed Flux resources table sorting.
- Updated dependencies [3030f54]
  - @giantswarm/backstage-plugin-ui-react@0.5.1

## 0.5.1

### Patch Changes

- 34f5aba: Fixed version in the Flux status widget.

## 0.5.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.0
  - @giantswarm/backstage-plugin-ui-react@0.5.0

## 0.4.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-kubernetes-react@0.4.0
  - @giantswarm/backstage-plugin-ui-react@0.4.0

## 0.3.1

### Patch Changes

- 3ce1520: Changed ordering for resources in the Flux overview tree.
- c585a66: Reordered sections in the Flux resource details panel.

## 0.3.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.0
  - @giantswarm/backstage-plugin-ui-react@0.3.0

## 0.2.0

### Minor Changes

- 8685deb: Added Flux overview UI.
