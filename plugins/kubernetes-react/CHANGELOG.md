# @giantswarm/backstage-plugin-kubernetes-react

## 1.0.0

### Major Changes

- 1a05f26: The Agent Platform section reads kagent **API v2** (`kagent.dev/v1alpha3`), single
  version. An installation on kagent 0.10 has no `agenttemplates` resource and is shown
  as having no API v2 agents; nothing reads `v1alpha2` any more.

  **kubernetes-react.** `Agent` is now the `AgentTemplate` wrapper (`agenttemplates`):
  display name and icon from the `ui.giantswarm.io/*` annotations, `spec.systemPrompt`
  (or its ConfigMap source), `spec.modelConfig.name`, tool bindings (`getMcpBindings`,
  `getAgentRefs`), skills flattened with their pin (`getSkills`: git commit, OCI digest
  or object version), the admission label (`HARNESS_LABEL`,
  `agent-platform.giantswarm.io/harness`) and readiness derived from
  `status.harnesses[]` — per Harness `ready` / `progressing` / `failed` / `pending`
  (`deriveHarnessReadiness`), the agent's verdict from the platform Harness the label
  names (`decidingHarnessStatus`), and a new **`notAdmitted`** readiness with its
  reason for a template no Harness admits. `getType`, `getSkillRefs`,
  `getMcpServerRefs`, `getUnsupportedFeaturesWarning` and the `AgentTool` /
  `AgentMcpServerRef` types are gone; `getHarnesses`, `getDecidingHarness`,
  `getHarnessWarnings` and the `AgentHarness*` / `AgentMcpBinding` / `AgentSkill` types
  replace them. New `RemoteMCPServer` class (`getHeadersFrom`, `getHeaderValue` — a
  literal value only, never one sourced from a Secret). `ModelConfig` moves to
  `v1alpha3` and reads both `Accepted` and `ResolvedRefs`; `getAcceptedCondition` is
  replaced by `getReadinessMessage`. `@giantswarm/k8s-types` is bumped to the release
  that carries `crds.kagent.v1alpha3`.

  **agent-platform.** A roster row is the template joined with the `RemoteMCPServer`
  its gateway binding names — the per-agent carrier the Generic chart renders under the
  agent's own name — so the new **Toolset** column and the Toolset card read the
  `X-Muster-Toolset` header off that server (`toolsetOfAgent(agent, gatewayName,
carriers)`, `useAgentToolset`): declared, implicit full access, no gateway, or **not
  readable** while the carrier could not be read. The status column and the Status card
  show the admitting Harness and its verdict; the Status card lists every admitting
  Harness with the revision it is on and its compile warnings; the Configuration card
  shows the Harness label and the bindings (`tools` allowlist, `requireApproval`); the
  Skills card shows each skill's repository, path and short commit or digest. Provenance
  ("Deployed by", the GitOps card, delete) keeps working off the template's Flux labels.
  ModelConfigs created, edited and auto-wired from the Models tab are
  `kagent.dev/v1alpha3`. The persisted react-query cache is versioned
  (`AGENT_PLATFORM_CACHE_BUSTER`): a browser holding a previous release's blob starts
  empty instead of rehydrating rows written against another API.

  Requires an installation on the kagent API v2 line; ships as the `1.x` line of this
  repository.

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

- d7b570d: Add an agents list to the Agent Platform "Agents" tab
  (`/agent-platform/agents`), replacing the stub landing.

  - List kagent `Agent` resources across all reachable installations and
    namespaces in a bui table showing display name, description, installation,
    namespace, model, and skill count. The model column resolves each agent's
    `spec.declarative.modelConfig` reference to the referenced ModelConfig's
    friendly name.
  - Rows accumulate per installation and stay put as the reachable-installation
    set changes or a background refetch transiently fails, so agents don't flicker
    in and out; results are cached/persisted like the other fleet lists.
  - Show a progress bar until the first agents arrive, and report installations
    whose Agents couldn't be read in a warning card below the table (reusing the
    create flow's alert via the new shared `UnreachableInstallationsAlert`).
  - `kubernetes-react`: fix `Agent.getSkillRefs()` to read `spec.skills.gitRefs`
    (the real `v1alpha2` field; it previously read a non-existent
    `spec.skills.refs` and always returned `[]`), and add `getDisplayName()`,
    `getSkillCount()`, and `getType()`.

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

- 7a49e7f: Models: the serve flow and the KServe serving source follow the platform's one serving path — KServe's llm-d `LLMInferenceService` composed by model-manager — and the classic `InferenceService` path is removed.

  - **Serving a model is model-manager's `load_model` as the signed-in person, everywhere.** The Serve dialog that composed an `InferenceService` in the browser from the preset ConfigMaps and the discovery config's `runtime`, `deploymentStrategyType` and `timeoutSeconds`, wrote it with the person's RBAC and created the kagent ModelConfig once it was ready is gone, with the preset ConfigMap reads and the auto-wiring: the `Serve model` button and a row's _Serve…_ open the dialog with model-manager's presets, `check_fit`'s verdict and one `load_model` over muster, on every installation whose model-manager can load; model-manager composes the object and wires the model config. No serving object is written by the portal.
  - **The KServe serving source lists `LLMInferenceService`s** (`serving.kserve.io/v1alpha2`) and their workload pods by the llm-d controller's labels (`app.kubernetes.io/part-of=llminferenceservice`, `app.kubernetes.io/name=<object>`), reads the accelerator count under the installation's `gpuResourceName`, and folds a row onto model-manager's by namespace and name — never by host, since every routed model answers on the models Gateway's one host. A ModelConfig on the Gateway is linked to its model by the route's path (`/<namespace>/<name>`), and one whose path names no listed object, or that points at a workload Service (`<name>-kserve-workload-svc`) nobody serves, reads _Not serving_ with the object named. _Stop serving…_ deletes the `LLMInferenceService` where model-manager does not operate the row.
  - `@giantswarm/backstage-plugin-kubernetes-react`: `LLMInferenceService` (model, template, pinned node, accelerator request, readiness with reason and message, the route and the workload Service, endpoint hosts) replaces `InferenceService`; `urlHostname`, `isClusterLocalHostname` and `clusterLocalServiceUrl` are exported from their own module.

- a036f84: Add model management to the Agent Platform section: a **Models** tab that
  lists the kagent `ModelConfig`s agents can run on across the fleet, and lets a
  platform admin create, edit and delete them from the portal — parity with
  kagent's own UI. Until now the create flow could only _pick_ from models an
  admin had hand-applied with kubectl (or provisioned via agentlab's
  `platform.extraModels`); the picker's empty state now links to the new flow
  instead of dead-ending.

  **The form speaks four providers** — OpenAI (covering every OpenAI-compatible
  endpoint: vLLM, llama.cpp, OpenRouter, …), Anthropic, Gemini and Ollama — with
  a per-provider endpoint (`openAI.baseUrl` / `anthropic.baseUrl` /
  `ollama.host`) and `tls.disableVerify` for self-signed lab endpoints. CRs
  using the CRD's other providers (AzureOpenAI, Bedrock, VertexAI variants,
  SAPAICore) render read-only rather than being mangled by a form that has no
  fields for them. The list's status column is the controller's `Accepted`
  condition, with its message — typically which Secret is missing — as the
  tooltip.

  **Key Secrets follow the agentlab contract** (giantswarm/agentlab#44), so
  models provisioned by either tool look identical on the cluster: Secret
  `kagent-<name>` next to the ModelConfig, whose single key is the provider's
  canonical env-var name (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`)
  — not configurable, because the kagent controller injects it as an env var of
  that name and the ADK runtime looks up exactly those. A keyless endpoint still
  gets a placeholder-valued Secret (an agent pod without the env var crashloops
  even against an endpoint that never checks the value); Ollama alone gets none.

  **The API key is write-only.** The portal never reads Secret values back: on
  edit, an empty key field means "leave the Secret alone", and a new value
  replaces the Secret's contents in one merge patch (`data: null` +
  `stringData`), so a provider switch cannot leave the old canonical key behind
  — which is also why switching provider demands re-entering the key. The portal
  only writes Secrets named by its own convention; a CR referencing a
  hand-provisioned (possibly shared) Secret keeps that reference untouched, and
  such a Secret never rides along on delete.

  **Writes bypass the scaffolder on purpose.** Agent creation drives `kube:apply`
  through a scaffolder template, but a scaffolder task persists its `values` and
  echoes the applied manifest into the task output — routing a Secret through it
  would store the API key in plain text. Model writes instead go straight
  through the Kubernetes proxy with the caller's own OIDC token, which also
  surfaces apiserver errors inline (a taken name is a `ConflictError` on the
  form, not a failed task page). `SelfSubjectAccessReview` gates decide only
  what is shown; authorization stays the apiserver's.

  **Ownership and reference guards.** Edit/delete are withheld for tool-owned
  CRs — rendered by Helm (the chart's default model), applied by a Flux
  Kustomization, or `managed-by`-labeled by anything but the portal (agentlab
  re-asserts its models on every run) — each explained in place rather than
  silently absent. A marker-less, hand-applied CR _is_ editable: adopting those
  into portal management is the point, and portal-created ones are stamped
  `app.kubernetes.io/managed-by: giantswarm-backstage`. Deletion lists the
  namespace's `Agent`s fresh at mutation time and refuses while any still
  references the model; unlike the shared-chart-source check in agent deletion,
  a failed read refuses rather than proceeds, because here proceeding is the
  unsafe direction.

  **New in `kubernetes-react`: `createResource`** — the missing third mutating
  verb next to `patchResource`/`deleteResource`, same proxy, same error naming,
  plus `ConflictError` for a 409 across all three. The `ModelConfig` class gains
  the spec accessors (`getApiKeySecret`, provider blocks, `getTls`,
  `getEndpoint`) and an `Accepted`-condition readiness derivation
  (`deriveModelConfigReadiness`), mirroring the `Agent` readiness helpers.

- 5b5d408: Say what is wrong with a served model that is not Ready. model-manager 0.23.4
  reports a `reason` next to `status` and `message` for every served model of
  the kserve backend — the Ready condition's reason (`HTTPRoutesNotReady`), a
  failed load's, or the predictor pod's while it waits (`Unschedulable`,
  `ImagePullBackOff`) — and calls an object whose predictor pod is Pending
  `Pending`, whatever its conditions say. The portal now shows that word next to
  the status wherever the model's state appears: the Serving page's status cell
  reads **Pending · Unschedulable** with the scheduler's text (`0/3 nodes are
available: 3 Insufficient nvidia.com/gpu.`) under the label and on hover; the
  model detail card, the Model configs and the Agents tables' model column and
  the session composer's warning carry the same word. Said once: the reason is
  stripped from the front of model-manager's one-line message.

  - A model being deleted reads **Stopping** — a new `terminating` readiness,
    neutral — instead of a red **Not ready**; it still counts as a serving
    failure for the composer's warning, since the model is going away.
  - The CR-read InferenceService agrees with model-manager: the Ready
    condition's reason (else the last failure's, else the first failing
    component's) is the row's word, and a Pending predictor pod — a container
    waiting (`ImagePullBackOff`), else `PodScheduled=False` (`Unschedulable`) —
    makes the row `pending` with the pod's reason and message, whatever the
    object's conditions say. An InferenceService with a `deletionTimestamp` is
    `terminating`. A folded row keeps its base's status, reason and explanation
    together.
  - Nothing changes for a Ready model, or for the rows of a backend that names
    no reason (Ollama, LM Studio, Lemonade).
  - `kubernetes-react`: `InferenceService.getReadinessReason()`,
    `Pod.getPendingState()` (with `status.containerStatuses` /
    `initContainerStatuses` and the pod's own `reason` / `message` on
    `PodInterface`), `KubeObject.getDeletionTimestamp()`.

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

- c25dd0b: Add kagent `Agent` and `ModelConfig` resource classes.

  - New `Agent` and `ModelConfig` classes wrap the kagent `v1alpha2` CRDs
    (`kagent.dev`), usable with `useResources` for listing/reading on management
    clusters. `ModelConfig` exposes `getModel`/`getProvider`/`getDisplayName` (the
    latter prefers a `ui.giantswarm.io/display-name` annotation, falling back to
    the resource name); `Agent` exposes
    `getDescription`/`getModelConfigName`/`getSystemMessage`/`getSkillRefs`.
  - Bump `@giantswarm/k8s-types` to `v0.6.0`, which adds the kagent types.
  - Remove the orphaned `AppDeployment`, `GitHubApp`, and `GitHubRepo` resource
    classes: `v0.6.0` dropped the Kratix-derived `giantswarm/v1beta1` types they
    wrapped (org-wide Kratix removal), and nothing referenced these classes.

- c604256: MCP Servers tab: a muster on any installation other than the home one is now
  reached with **that installation's brokered token** — the token the cluster token
  broker mints for it, issued by the installation's own Dex — instead of the
  person's main-login token, which only the home installation's muster trusts.
  Switching the tab to another installation shows its tool count, Tool explorer
  and core families straight away; before, every non-home installation answered
  401 and showed a "Connect to muster" button that fetched the same rejected token
  again.

  - The home installation is the `gs.installations` entry whose
    `oidcTokenProvider` is `gs.authProvider` (the release itself on a standalone
    install). It keeps the main-login token path; so does an installation the
    kubernetes API does not know, and every installation on a portal without
    `gs.authProvider`. `isHomeInstallation()` is exported for callers that need
    the same answer.
  - `getInstallationOidcToken` moves to `@giantswarm/backstage-plugin-kubernetes-react`
    so the muster, kagent and model-manager clients mint identically; the
    agent-platform import path re-exports it unchanged.
  - `useMusterSession()` now says **why** there is no session: `failure.kind` is
    `session-expired` (the portal session is gone — the single main re-login fixes
    it), `mint-failed` (the broker or exchange failed; the cause is quoted) or
    `muster-rejected` (a token was sent and muster answered with an error; its
    message is quoted). A `pending` flag covers the first probe. The gates on the
    MCP Servers page, the dashboard and the register flow follow the class — "Sign
    in again" for an expired session, "Retry" otherwise, nothing while checking —
    and no longer claim a generic "not authenticated". A failed mint is not
    retried by react-query, so a declined re-login is one popup, not three.
  - `muster.installations[].authProvider` still marks an installation as
    requiring a token (`requiresAuth`), but for non-home installations it no
    longer decides which token is sent; the config docs say so.

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

### Patch Changes

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

- a776d8b: Wire served models to their predictor over `http` even when KServe publishes
  an `https` in-cluster address.

  In raw-deployment mode the KServe controller writes `status.address.url` with
  the ingress `urlScheme`, so a TLS-terminated installation reports
  `https://<name>-predictor.<ns>.svc.cluster.local` although the predictor
  Service speaks plain HTTP on port 80. `InferenceService.getInternalUrl()` — and
  with it the Serving section's endpoint and the `baseUrl` of the ModelConfig the
  serve flow auto-creates — inherited that scheme and pointed agents at a TLS
  port that does not exist. Cluster-local hosts without an explicit port now get
  `http`; external hosts and explicit ports are kept.

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

- 322e58c: `ModelConfig.getDisplayNameAnnotation()` returns the
  `ui.giantswarm.io/display-name` annotation, or `undefined` when it is missing
  or blank. `getDisplayName()` now falls back to the resource name for a blank
  annotation too, instead of returning an empty name.
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

## 0.16.0

### Minor Changes

- 865790a: Make broker-backed cluster auth broker-only and surface per-cluster access health in the sidebar.

  Broker-covered kubernetes providers no longer fall back to the cookie `/refresh` or open per-cluster login popups: `createSession`/`refreshSession` mint silently through the muster token broker and, on failure, throw a typed `ClusterTokenError` carrying the installation and a coarse `reason`. The auth backend's cluster-token route now returns that `reason` (`broker_unreachable`, `exchange_failed`, `subject_invalid`) alongside the error. When the main Dex session is gone the connector triggers the single main SSO login automatically (the only popup a broker-backed cluster ever causes).

  A new in-memory `ClusterAccessStatusApi` records per-installation access outcomes (healthy / degraded / session-expired), fed by both the broker token flow and the clusters list, and rendered by a `ClusterAccessStatusSidebarItem` connection-status element with a "Sign in again" action when the main session has expired.

  The clusters list now loads fleet-wide fail-fast: API discovery and list queries are enabled per cluster as each one settles, the k8s proxy bounds each request with a configurable timeout (`gs.kubernetes.proxyTimeoutMs`, default 10s), and the table renders as soon as the first installation resolves instead of freezing on a single unreachable management cluster.

## 0.15.0

### Minor Changes

- b928d80: Add `isValidDNSSubdomainName` utility for validating Kubernetes resource names against RFC 1123 DNS subdomain rules.

### Patch Changes

- Updated dependencies [b928d80]
- Updated dependencies [8a1fbdc]
  - @giantswarm/backstage-plugin-ui-react@0.8.4

## 0.14.2

### Patch Changes

- aa78ce4: Fix false API version incompatibility errors caused by transient server failures during discovery.
- d2feef2: Fix flaky generateUID uniqueness test by increasing minimum ID length.

## 0.14.1

### Patch Changes

- b5802af: Fix false "Client outdated" warning for resources that only exist in older API group versions. Refactor API discovery hooks: `usePreferredVersion` now delegates to `usePreferredVersions`, version resolution uses resource-level versions only, and API discovery errors are propagated through `useResources`.
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
  - @giantswarm/backstage-plugin-ui-react@0.8.2

## 0.14.0

### Minor Changes

- 9997d4a: Add ConfigMap and Secret resource classes, HelmRelease valuesFrom inspection methods, and core API resource path support.

## 0.13.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- Updated dependencies [ebd466f]
  - @giantswarm/backstage-plugin-error-reporter-react@0.3.0
  - @giantswarm/backstage-plugin-ui-react@0.8.0

## 0.12.0

### Minor Changes

- dde73a8: Add node pools table to cluster details

## 0.11.1

### Patch Changes

- cd3f13e: Add getters
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
  - @giantswarm/backstage-plugin-ui-react@0.7.2

## 0.11.0

### Minor Changes

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

### Patch Changes

- 8e3e4a4: Fix API version discovery for resources with different version support
  - Implement two-stage API discovery that queries available versions and then checks which version actually serves the specific resource
  - Extract shared query logic into `queryFactories.ts` for use by both `usePreferredVersion` and `usePreferredVersions`

- 8e3e4a4: Enhance Flux details panel with additional metadata
  - Add creation timestamp, interval, and resource-specific metadata to details panel and list view
  - Extract `findHelmReleaseChartName` utility into flux-react for shared use
  - Add convenience accessors to HelmRelease, GitRepository, OCIRepository, and HelmRepository resource classes

- Updated dependencies [23e9f63]
  - @giantswarm/backstage-plugin-error-reporter-react@0.2.0

## 0.10.0

### Minor Changes

- b4b5fc2: Add v1 version support to OCIRepository and HelmRepository resources
- 3e3dd4c: Add support for Flux ImagePolicy, ImageRepository, ImageUpdateAutomation

## 0.9.2

### Patch Changes

- 286d31a: Improve Helm chart name resolution with OCIRepository support.

## 0.9.1

### Patch Changes

- 81beb57: Fix HelmRelease.getChartName() to support chartRef pattern for OCIRepository-based charts.

## 0.9.0

### Minor Changes

- edee516: Add dynamic API version discovery for Kubernetes resources
  - Add useApiDiscovery hooks to automatically detect supported API versions
  - Support multi-version resources with `supportedVersions` array on KubeObject classes
  - Add version utilities for comparing and selecting preferred API versions
  - Improve resource fetching to use cluster-supported versions

### Patch Changes

- edee516: Move Sentry API version issue reporting into useResource and useResources hooks
  - Add automatic `useReportApiVersionIssues` call inside `useResource` and `useResources` hooks
  - Expose `clientOutdated` from `useResource` return value for consistency
  - Developers no longer need to manually call `useReportApiVersionIssues` when using these hooks

- edee516: Handle missing namespace in TypedLocalObjectReference for CAPI v1beta2
  - Update Cluster.getInfrastructureRef() and getControlPlaneRef() to handle both v1beta1 ObjectReference and v1beta2 TypedLocalObjectReference formats
  - Update ProviderCluster.getIdentityRef() with the same namespace fallback pattern
  - Include apiGroup in returned refs for proper resource matching with findResourceByRef()
  - When namespace is missing from a reference, fall back to the parent resource's namespace

- edee516: Integrate API version incompatibility errors into the error display system
  - Add IncompatibilityErrorInfo type and ErrorInfoUnion discriminated union
  - Update useShowErrors to handle both regular fetch errors and incompatibility errors
  - Include incompatibilities in errors array from useResource and useResources hooks
  - Add IncompatibilityPanel component for displaying incompatibility details
  - Move getIncompatibilityMessage and getErrorMessage helpers to kubernetes-react

## 0.8.2

### Patch Changes

- 40626f8: Fix the issue in the ErrorsProvider component that was causing constant re-renders.

## 0.8.1

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.0

## 0.8.0

### Minor Changes

- d6b1c2d: Use types from @giantswarm/k8s-types package.

## 0.7.1

### Patch Changes

- f4d5ed5: Fix MultipleClusterPicker to take disabled installations into account.

## 0.7.0

### Minor Changes

- 644308d: Handle rejected cluster authentication.

## 0.6.1

### Patch Changes

- f740242: Added support for API version v2 of HelmRelease

## 0.6.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

### Patch Changes

- Updated dependencies [3b06846]
  - @giantswarm/backstage-plugin-ui-react@0.6.0

## 0.5.1

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.

## 0.5.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-ui-react@0.5.0

## 0.4.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-ui-react@0.4.0

## 0.3.2

### Patch Changes

- 791a215: Fixed Cluster selectors when only one cluster is configured.

## 0.3.1

### Patch Changes

- fbc1589: Fallback to the old local storage key for selected Kubernetes clusters.

## 0.3.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-ui-react@0.3.0

## 0.2.0

### Minor Changes

- 8685deb: Added Flux overview UI.

### Patch Changes

- Updated dependencies [8685deb]
  - @giantswarm/backstage-plugin-ui-react@0.2.0
