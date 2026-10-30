# @giantswarm/backstage-plugin-agent-platform

## 1.1.0

### Minor Changes

- 689b152: A session that waits on an MCP server's sign-in link (kagent's HITL `url_elicitation_request`, sent by runtimes that relay MCP URL elicitations, such as muster's sign-in link from 5.53.0 on) shows a sign-in card instead of the composer's question card: the server that asked, its message, _Sign in_ and _Not now_. Muster returns the sign-in's tab to the session and the agent continues on its own (`url_elicitation_response` `accept`); _Not now_ declines. `readUrlElicitationRequest` reads the request off a status message.
- 97c84d4: A workspace setup notice from kagent's harness shows as a status of its turn,
  not as the agent's reply: an alert above the agent's answer with one summary
  line ("Workspace setup: 3 repositories not updated"), a warning when the setup
  failed, the directory was set up again or repositories stayed at the last sync,
  and information when they are up to date again, with git's reasons folded
  under Technical details. It renders the same live and after a reload, and no
  longer counts as a reply. kagent does not mark a notice, so it is recognised by
  its text on the message that opens the turn; `readKagentNotice` also reads a
  proposed mark (`kagent.dev/notice`) that kagent does not send yet.

### Patch Changes

- Updated dependencies [689b152]
- Updated dependencies [97c84d4]
  - @giantswarm/backstage-plugin-agent-platform-common@1.1.0

## 1.0.0

### Major Changes

- 343d4b2: The Agent Platform backend speaks **kagent API v2 over native gRPC**. Sessions
  are the person's `AgentInstance`s, chat is A2A v1 `SendStreamingMessage` routed
  by the instance header with the human-in-the-loop extension requested on every
  turn, history comes from `ListTasks`/`GetTask`, the identity probe from
  `SystemService.GetCurrentUser`, and the session-state and usage summaries are
  derived from `ListAgentInstances` and `ListTasks`. The browser keeps its
  JSON/SSE contract.

  **Breaking.** This release requires a kagent API v2 controller behind
  agentgateway's gRPC-capable controller route (agent-platform 4.0's connectivity
  chart). `agentPlatform.kagent.installations.<name>.apiBaseUrl` is now the
  **gRPC origin** of that route (`https://<host>[:port]`, no path); the derived
  default is `https://agentgateway.<baseDomain>`, the connectivity chart's
  controller route hostname. The kagent 0.10 REST door
  (`/api/sessions`, JSON-RPC A2A) is no longer spoken, and conversations from
  before an installation's migration are not available.

  - **Backend.** A Connect client generated from the line's protos
    (`plugins/agent-platform-backend/src/kagent/gen`, pinned by commit) over
    connect-node's HTTP/2 gRPC transport. Every call carries
    `authorization: Bearer <the person's per-installation Dex ID token>` and
    **no identity header**: agentgateway validates the token and derives the
    caller. Creating a session is `CreateAgentInstance` on the template's Ready
    Harness with the browser's `requestId`, so a retried create yields one
    instance; renaming is `UpdateAgentInstanceName`; the 0.9.x upsert fallback is
    gone. The new route `POST /kagent/sessions/:sessionId/tasks/:taskId/cancel`
    cancels a turn server-side (`CancelTask`). The reachability probe behind
    `GET /kagent/installations` is one unauthenticated `GetVersion` per origin.
  - **Common.** The A2A v1 and AgentInstance wire shapes join the 0.10 ones, with
    fixtures recorded on the pinned line (`kagent-4a91c273`), and are normalised
    into the one internal shape every reader already parses — including the HITL
    extension's typed request and reply. `KagentSession` gains `agentTemplate`,
    `state`, `contextId` and `failure`.
  - **Frontend.** A **Stop** control in the composer while a turn streams; the
    create carries an idempotency key per submission. Session names are capped at
    200 characters, the controller's limit.

- 0c2f870: The Agent Platform section follows the kagent line onto the `api.kagent.dev/v1alpha3`
  **Agent** object and the controller's **Session** records.

  **kubernetes-react.** `Agent` wraps the `Agent` kind (`agents`, group
  `api.kagent.dev`): the template readers (`getDescription`, `getModelConfigName`,
  `getSystemMessage`, `getSkills`, `getMcpBindings`, the new `getSubAgentBindings`)
  answer for the inline `spec.template`, `getTemplateRef` names a template run by
  reference, `getHarnessName` is `spec.harnessRef.name`, and readiness derives from
  `status.conditions` (`ready` / `notReady` / `failed` / `pending`; `notAdmitted` is
  gone with the admission label). `getHarnesses`, `getDecidingHarness`, `getAgentRefs`,
  `getHarnessLabel`, `HARNESS_LABEL`, `deriveHarnessReadiness`, `decidingHarnessStatus`
  and the `AgentHarness*` / `HarnessReadiness` types are removed. `Harness` loses
  `getAdmittedHarnessLabel` and `getAgentTemplateSelector` (`allowedAgentTemplates` no
  longer exists) and gains `getLimits` and `getEgress`. `ModelConfig` and
  `RemoteMCPServer` move to the `api.kagent.dev` group. The `api.kagent.dev` shapes are
  declared locally (`kagentApi.ts`) until `@giantswarm/k8s-types` publishes them.

  **agent-platform-common.** The session wire module reads `SessionService` responses
  (`{sessions: […]}`, `{session}`, `RUNTIME_STATE_*`) instead of
  `AgentInstanceService`; a session carries `agent` instead of `agentTemplate`.

  **agent-platform-backend.** The kagent client speaks `SessionService`; a create names
  the Agent and no longer picks a Harness, and an Agent without a ready revision is a
  409 naming it. The generated stubs are pinned to `giantswarm/kagent-upstream`
  `f7bf3dafd6a8c21e084015a9310f4692778ebaeb`.

  **agent-platform.** An agent's extra egress origins (`Agent.spec.egress`, kagent-dev/kagent#3019) are typed on
  the create form and the edit page, carried as agent-manager's `egress`, and listed on
  the agent's Configuration card; `Agent.getEgress()` reads them in kubernetes-react. The
  runtime picker offers every Harness of the namespace by name,
  the agent pages read the Agent's own status and the Harness it names, and
  agent-manager's responses are read in their Agent shape (`status.agent`, `harness`,
  `agentDeleted`). Installation inventory detects kagent by the `api.kagent.dev` group;
  cached kagent reads are keyed and busted by that group. The create and save progress
  and the System prompt card speak of the agent instead of its template.

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

- 5bdbb49: Agents: the Agent actions menu on an agent's page offers Change Harness. Its dialog lists the runtimes of the agent's namespace and the checks of the one you pick, blocks the change when a check fails, and links to the edit page to fix it. Running sessions stay on the runtime they started on until you delete them; on the agent's Sessions tab they are marked Earlier revision.
- 1778411: An agent with a connector that needs a sign-in can start that sign-in. The
  agent editor's Tools step adds `tool:core_auth_login` to the toolset while a
  selected connector is one muster signs in to per session or per person, and
  says why under "Added for sign-in". It is left out where a preset already
  includes it, and for a connector that comes with the portal sign-in. Removing
  it warns that the agent won't be able to sign in. An edited agent without it
  gets it, shown among the review's changes.

  In a session, a sign-in link muster issued to the agent shows as "Sign in to
  <connector>" instead of the URL, in messages and questions alike. Once the
  sign-in is done it reads "Signed in to <connector>", and a question that
  carried the link is answered with its "signed in" choice.

- 7dbd60e: An agent can carry a default workspace: the agent form's More options gain an
  optional Default workspace select, listing the environment's workspaces, and
  the agent's page shows it. A new session's workspace select presets to the
  workspace the person last chose with that agent, else to the agent's default,
  else to "No workspace"; a start in the default passes the same access check,
  sign-in and refusal as any picked workspace. Every start without a workspace
  now says so to agent-manager (`noWorkspace`), so it never lands in the
  agent's default by omission.
- 34f5fc9: The edit page and the Delete dialog of an agent applied from Git check up
  front whether agent-manager can open a pull request for it. An agent defined
  outside agent-manager's directory gets an explanation instead of the form (or
  only Close in the dialog) that says why in plain words and links the
  repository to change it in, with what agent-manager checked under Technical
  details; a missing GitHub authorization that a sign-in to agent-manager
  gives gets that sign-in before the person starts. Any other answer leaves the
  form and confirm as they were. The review step, Update skills and Change
  Harness explain the same refusal the same way, worded per action, and keep
  the release and the file agent-manager looked for under Technical details.

  The muster plugin exports `useServerNeedsSignIn`, whether muster reports a
  server as waiting for the person's sign-in.

- 1fba94a: An agent can pick EgressPolicies of its namespace: the agent form's More
  options list the shared sets of origins the tenant admins keep there (each
  with its origins and the header the gateway fills from its credential, never
  the Secret), beside the typed Extra egress origins, where agent-manager offers
  them (`get_info` capability `egressPolicies`) and never on a coding Harness.
  The picks are sent as `egressPolicyRefs` on create and edit, listed with their
  origins on the review and on the agent's Configuration card, and a pick the
  namespace no longer holds says so. `Agent.getEgressPolicyRefs()` reads
  `spec.egressPolicyRefs`.
- e95940e: The agent form's Extra egress origins take `tls://<host>:<port>` beside
  HTTP(S) origins: a service that speaks TLS, such as a database, by host and
  required port. An entry without a port is refused with the reason, as is a
  host and port listed over two protocols, in agent-manager's words. The
  Configuration card lists both forms.
- 2978657: Agents: the facts beside an agent's overview name its Runtime in the create
  form's words: the Harness's title, Platform default on the platform Harness,
  and its name and image beneath, with an info hint saying what the runtime is.
  A Harness you cannot read is shown by its name, and an agent whose runtime is
  not known reads Unknown runtime. The review steps of creating and editing an
  agent, and the More options summary, name the platform Harness by the same
  title and mark instead of "Standard". The cards under Customize → Agents'
  "Last used by you" open the agent's page, like every other item of the list,
  instead of starting a session, and keep an agent that cannot start one now;
  the page's Use this agent starts one. `Agent.hasInlineHarness()` tells an
  inline Harness apart from none.
- 2b79a0c: The home screen's agent picker lists all of the person's favorite agents in a
  "Favorites" group, second after "Recent". An agent that is both appears in both
  groups, and the picked row keeps its checkmark.
- b2a4e74: Models pages: **Add GPU node pool** on the GPU capacity page and on Serving, where an installation's muster lists cluster-manager. The dialog picks a cluster from `list_clusters` with the marks the tool reports (own cluster, GPU operator and serving with their providers, commit target), a pool name, accelerator, size and Teleport, calls `create_node_pool` with `dryRun` through muster as the signed-in person and shows the composed releases as manifests in one review with copy and download; **Deploy** applies as the person (`mode: apply`), **Commit** is disabled with "not available yet" until cluster-manager offers it. The GPU capacity page lists the pools from `list_node_pools` with the pool's Kubernetes version and the control plane's as two cells; **Remove pool** is a name-typing confirm that names the models served on that cluster, shows `delete_node_pool`'s replicas guard with the nodes it names and offers `force` only after it; any other refusal is shown verbatim. No proxy route: every cluster-manager call goes through muster.
- d93da36: The Serving page gains **Add model backend** and **Remove backend**.

  model-manager ships with every installation and starts with no backend. A
  backend the person already runs — an Ollama, LM Studio or Lemonade host, or a
  KServe cluster — is registered from the Serving page (and from its empty
  state) through model-manager's `add_backend` tool, called through muster as
  the signed-in person: the review shows the backend document model-manager's
  dry run renders (the ConfigMap of the runtime-registration contract), then
  **Deploy** writes it as the person; **Commit** is offered and shows
  model-manager's answer while a pull request is not available yet. Credentials
  are a Secret reference, never a token. The registered backend appears as a
  Serving group labelled with its source (registered from the portal, or by
  cluster-manager); **Remove backend** on the group header lists what
  `remove_backend`'s dry run reports — the ConfigMap and the model configs it
  unwires — next to the group's served models, and takes a typed confirm.
  Refusals (a static backend from the chart's values, a name clash) are shown in
  model-manager's words. LM Studio joins the backends the page has a vocabulary
  for. A registered backend that serves nothing
  yet — a KServe without a pool, an Ollama before its first pull — is listed
  under **Backends without models** with its source and Remove backend, so it
  never becomes unremovable for lack of a group.

- 2e425c5: Agent detail page: a failed agent reads **Failed** (no longer "Not accepted", which contradicted its `Accepted=True` condition), and a banner above the tabs says why sessions can't start, naming the root cause, with **Edit agent** for whoever may edit it. A cause in the platform (a missing WorkerPool) points to a platform admin instead. The field the cause is about (Model, Tools or System prompt) is marked. A not-ready agent says sessions can start once it is ready. The Overview's Tools row summarises the toolset in the Agents list's words with a link to the Tools tab, instead of naming the gateway `RemoteMCPServer`. Each fact appears once: the header shows the installation chip and `namespace/name`, and Configuration keeps Model, Tools, Created and Deployed by (Harness, Installation and Namespace rows removed). The Status card no longer repeats the readiness label: a ready agent shows where its sessions run and keeps its conditions and revision behind a closed disclosure, while a failing one lists its conditions in kagent's evaluation order, root cause first and expanded. Revision hashes are shortened and no longer overflow. With no skills, the Skills tab offers **Add skills** (to the edit page) to whoever may edit the agent; with no sessions, the Sessions tab shows **Start a session** instead of an empty table with search and paging.
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

- 60b2c76: The agent detail page is split into four tabs — **Overview**, **Tools**,
  **Skills** and **Sessions** — instead of one long scrolling page.

  The agent's header and, right after a write, its creation progress stay above the
  tab strip, so which agent this is and whether it has converged are visible from
  every tab. Overview keeps the GitOps card, the configuration, the status and the
  system prompt; the toolset, the skills grid and the sessions each get a tab of
  their own.

  Each tab is its own URL (`…/<name>/tools`, `/skills`, `/sessions`), so a deep link
  or a reload lands on the section it names. **Overview is the index**, not a
  redirect, so every existing link and bookmark to an agent keeps working unchanged
  — including the create flow's handoff to the page.

  The Sessions tab now lists all of your sessions with the agent, searchable and
  paged, rather than the five most recent with a "View all sessions" link — that
  link pointed at the section-level Sessions tab, which lists every agent's
  sessions, so it was a different list rather than the rest of this one.

  The toolset's muster reads (the tool catalogue, the server list and the toolset
  resolution) now happen only when the Tools tab is opened, instead of on every
  visit to the page.

- 2b79a0c: Agent page: the agent's tools are a **Tools** tab between Sessions and Usage, at the same `…/<name>/tools` address, instead of a page below the agent reached through "See which tools" on the Overview's Connectors section, which is gone. The tab is shown for an agent with tools: one bound to the muster gateway, which is how it reaches connectors and Platform tools, that does not declare `preset:none`. For an agent without tools, `…/tools` lands on the Overview, keeping the query string as the retired `…/skills` does. On the Tools tab the breadcrumbs and document title read as on the other tabs.
- 004bdfe: The Agents tab no longer splits the list into one section per installation
  under "All installations". Every installation in the inventory got a heading
  and a status line of its own — "no agents here" for the many that run none —
  so the agents themselves were pushed down the page and spread over several
  small tables that could not be sorted or scanned together.

  The tab is now one flat table under every scope, the same table a pinned
  installation and a single-installation portal already showed. The
  **Installation** column, the table's initial sort, tells the rows apart with
  the home installation first; an installation without agents simply has no
  row, and one that could not be read is still called out in the warning card
  below the table. The Sessions and Models tabs keep their per-installation
  groups.

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

- f3ab798: Agent avatars load through the agent-platform backend
  (`/api/agent-platform/avatars/<installation>/v1/...`) instead of from each
  installation's `avatars.<baseDomain>` host, so they are same-origin `<img>`
  loads and the Content-Security-Policy needs no per-installation `img-src`
  entry any more — that allowlist named every installation's base domain in a
  header sent with the unauthenticated page. `backend.csp.img-src` overrides
  that only existed to list avatar hosts can go.

  The Agents and Sessions tabs issue and refresh the backend's user cookie
  (`CookieAuthRefreshProvider`), which is what authenticates an `<img>` load.
  `useAgentAvatarUrl` builds the proxied URL; the canonical URL an agent's
  resource records as its `iconUrl` moves to `useAgentIconUrl` and is unchanged.

- 2b79a0c: The ⌘K command palette: a client-side search over what the shell already
  reads — session titles, agents (name and description), skills and
  connectors — grouped by kind with filter chips, capped per group with a
  "+N more" count, and a final row handing the query to the classic
  portal-wide search (`/search`). Opens on ⌘K / Ctrl+K (only inside the agent
  shell and never from inside an input), from the rail's Search item and from
  the mobile bar's. Arrow keys walk the results, Enter opens one, and ⌘↵ on an
  agent starts a new session with it through the usual composer — tracked as
  `AgentPlatform.sessionStarted` with the new `searchPalette` entry point.
  Session content is not searched (platform gap G6): titles and metadata only.
- b097034: Composers: starting a session and replying in one use the same box. The agent
  picker and the submit button sit inside the text field's border — the picker
  bottom-left, the button bottom-right as an arrow (pointing right to start a
  session, up to send a reply). The caption moves under the box, and the inline
  composer on the Sessions tab shows its picker and Start before it is focused.
- 2b79a0c: Adding a model is now **Connect a model** everywhere — the Models list's button, Customize → Models' create action, the flow's title and its primary button (Connect model). The flow leads with the plain fields: display name (required; the technical name is filled in from it), provider and model, and the API key, which is now simply optional — leaving it empty means the endpoint needs none (the separate "This endpoint requires no API key" switch is gone; the Secret still gets a placeholder value, as before). The technical name and "Skip TLS certificate verification" moved under **More options**, as in the agent wizard. Provider and Model line up side by side however long their descriptions run.

  A model's **Edit** no longer swaps a form into its page: it opens the same flow prefilled at `/agent-platform/models/edit/<installation>/<namespace>/<name>`, with **Save changes** as the primary button (enabled once something changed) and the environment and technical name fixed. Models asserted by Helm, Flux or another tool, on a provider the form does not speak, or without permission to update them still offer no Edit, and their edit address says why. On an edit that changes the provider, an empty key field now writes a placeholder key for the new provider instead of blocking the save.

- 2b79a0c: The shell's connector page gets a Used by tab: the agents on the connector's installation whose toolset reaches it, each with what it may use there ("All tools", "Look things up", "N tools"), each row opening the agent.
- dc97358: The Cost page's by-agent table tells a reader what a row is. A pair of
  gateway labels that matches no agent used to render as a bare
  `namespace/name`, which read like a system component with spend; under
  kagent API v2 that is what a removed agent looks like. Such a row is now
  shown by its technical name, marked **Removed** and unlinked, with its spend
  kept in the totals; an agent the portal knows is named and linked as before;
  the gateway's own `unknown` reads as Unattributed. `LlmAgentRow` carries the
  distinction as `kind`.

  The note under the table describes how a call is attributed after the runtime
  names the agent on it: the runtime sends the agent's name and namespace and
  the person on each model call, the gateway records them for a call arriving
  through the Substrate egress and attributes any other call to the
  ServiceAccount of the pod that made it.

- 2b79a0c: Add the create-agent assist: a side chat with the configured agent-management
  meta agent (the "Swarm Operator") on the create flow's first step.

  - A "Let <agent> help" affordance on `/agent-platform/agents/new`, gated on the
    `agentPlatform.metaAgents.agentManagement` role mapping (decision G13):
    hidden entirely while the role is unconfigured or names no existing agent.
  - The affordance opens a side panel (full-screen at phone width) hosting an
    ordinary kagent session with that agent — `NewSessionComposer` with the
    assistant preselected and a create-agent-context prompt prefilled and
    editable, then the conversation in place: polled timeline, streamed live
    turn, composer, the agent's `ask_user` questions answered in the panel, and
    a link to the full session page.
  - Accept-into-form: each fenced code block of the agent's newest reply gets a
    "Use as system prompt" button that copies it into the form's System prompt
    field, with a one-step Undo. This is deliberately the whole accept mechanism:
    kagent replies are plain markdown with no structured suggestion protocol, so
    the prototype's richer accept-to-apply (skills into the selection, per-field
    patches) stays out until the backend carries structure for it.
  - `analytics-react`: `AgentPlatform.sessionStarted` gains the
    `createAgentAssist` entry point.

- 74e4a0b: Clusters page: **Create cluster** and **Delete** through cluster-manager, as the signed-in person, where an installation's cluster-manager offers `create_cluster` and `delete_cluster`. Both show cluster-manager's dry runs and offer Commit (a pull request, preselected where git owns the organization) and Deploy/Delete, each disabled with cluster-manager's reason where it refuses; Delete sits behind typing the cluster's name, lists what goes with the cluster and offers the second call and the post-merge live step. The node-pool dialogs now show the pull request cluster-manager opened (its `commit` answer).
- 37c3eb0: Agent creation goes through agent-manager's tools over muster, as the signed-in
  person — and produces a Generic agent chart 1.x release on kagent API v2.

  **The portal composes nothing any more.** The review page is agent-manager's dry
  run: the form is sent as agent-manager's create contract
  (`x_agent-manager_validate_agent`) and the page renders what comes back — the Flux
  `HelmRelease` and the shared `OCIRepository` tracking the chart's **`1.x`** range,
  the composed values (as the manual `helm install` fallback), and every schema
  violation and precondition failure inline, in agent-manager's words. Deploy calls
  `x_agent-manager_create_agent` with the same spec; agent-manager applies it with the
  person's own credentials, so the release's `managedFields` name the person and the
  apiserver's RBAC decides. A viewer's Forbidden, a conflict for an existing name, a
  GitOps-owned namespace are shown on the review page as agent-manager reports them.
  The portal never passes `force`.

  **Skills are pinned at write time.** Skill discovery (gs-backend `/agent-skills`)
  now resolves the head commit of the ref and reads the tree and every `SKILL.md` at
  that commit, so each skill carries the commit it was read at; the skills step shows
  it as the short SHA next to the branch, and the create request carries
  `skills[].git.commit` — the commit the person saw, never a branch. There is no
  runtime field and no per-skill credential in the request.

  **The seam is the muster plugin's own client** (`musterApi.callTool`, tools
  `x_agent-manager_<tool>`): the person's token for the installation's muster, no
  agent-manager URL, no REST client. A muster session that is not connected to
  agent-manager yet gets the muster plugin's sign-in affordance; agent-manager's
  refusals are told apart from muster's answers by their code prefix.

  **Feature detection from the MCPServer presence.** The installation picker offers
  only installations whose muster lists `agent-manager` (`core_mcpserver_list`) and
  names the ones that have models but no agent-manager, with the reason; a portal
  without the muster plugin says nothing can be created from it. No fallback path.

  **After Deploy** the person lands on the agent's detail page, where a progress
  alert polls agent-manager's `get_agent_status` until the platform Harness reports the
  template ready (the alert names the Harness) or failed, with the reason. **Commit**
  (`create_agent` with `mode: commit`, a pull request instead of a live apply) is wired
  behind `get_info.capabilities.commit` and stays hidden until agent-manager reports it.

  **Removed:** `lib/composeManifests.ts`, `hooks/useDeployAgent.ts`,
  `hooks/useAgentChart.ts`, `lib/agentDefaults.ts`, the app-config keys
  `agentPlatform.chart.*`, `agentPlatform.fluxServiceAccountName` and
  `agentPlatform.deployTemplateRef`, the scaffolder detour (no scaffolder task on the
  create path, no OIDC token minted by the portal) and the default-prompt read from
  the chart (an empty prompt is sent as absent and the chart's default applies). The
  `kube:apply` action stays for the other templates; the hidden `agent-deployment`
  template in `giantswarm/backstage-catalogs` is unused after this release.

- 2b79a0c: Customize → Agents gets its personal layer:

  - A star on every agent row adds it to, or removes it from, your favorites
    (stored per person in user settings). Favorites are listed in a group of
    their own above the other agents; both groups render 25 rows at a time.
  - "Last used by you": up to three cards for the agents of your latest
    sessions, each opening a new session with that agent.
  - A helper banner pointing at the agent configured as
    `agentPlatform.metaAgents.generalInformation`, whose button opens a new
    session with it. Hidden when the role is unconfigured or its agent cannot
    be started; dismissible for good.

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

- 0395e2d: Add **Delete session…** to the session detail page's kebab menu. It calls kagent's
  `DELETE /api/sessions/:id` through the agent-platform proxy — the first write on the
  kagent REST side, so `agent-platform-backend` gains a `DELETE
/kagent/sessions/:sessionId` route and its client a method parameter. Everything
  else about the transport is the reads' machinery reused: same installation
  resolution, same forwarded per-installation Dex token, same status mapping.

  **There is no permission gate, because there is nothing to ask.** Unlike the agent
  delete's `SelfSubjectAccessReview`, a session is not a Kubernetes object: kagent
  derives the acting user from the forwarded token alone, so the item is simply offered
  on any session that loaded. The route makes that token **required** for the same
  reason — without one, a controller running in `unsecure` mode would delete the shared
  default user's session on behalf of nobody in particular.

  **The dialog states both halves of what "deleted" means**, because an earlier draft
  of the copy could only have been wrong in one direction or the other. kagent's delete
  is soft (`UPDATE session SET deleted_at = NOW()`, with every read filtering
  `deleted_at IS NULL`), so the conversation is gone as far as anything in Backstage
  can see and there is no undo anywhere in this UI — but the record is not erased from
  kagent's store. On a deployment the `/me` probe reports as **not user-scoped**, the
  dialog adds a line saying the session may have been started by somebody else. That
  warns rather than withholding the action: kagent authorizes the call either way, and
  the person reading is the one who knows whose session it is.

  **A delete that matched nothing still answers 200.** kagent's statement is an
  `:exec`, so zero affected rows is not an error — a session that never existed, was
  already deleted, or belongs to another user all succeed silently. Nothing tries to
  detect that: a resolved promise means "kagent accepted this", and the refreshed list
  is what shows the truth a moment later. It also means there is no 404 path and no
  "already gone" case on the write side.

  **One non-obvious piece of cache handling.** The sessions list key is invalidated
  normally, so the list the user lands back on is correct. That reaches the Sessions tab
  only — each tab's router mounts its own `QueryClientProvider`, so the agent page's
  recent-sessions card reads the same key from a different cache, and needs no help
  because a fresh client starts empty and these keys are never persisted. This
  session's own two reads are
  invalidated with `refetchType: 'none'`: the detail page is still mounted at that
  moment, so refetching would race the navigation with a request that now 404s and
  flash "Session not found" at someone who just deleted it deliberately. Marked stale
  without refetching, a later visit to the same URL revalidates and reaches the
  not-found state properly.

  The frontend client's write path also tolerates a body it does not need — a 2xx with
  an empty or non-JSON body is a success, since a future kagent answering 204 has still
  performed the delete — while still refusing an error reported in-band on a 200, the
  same rule the session readers already apply.

  **The kebab menu is given an explicit width, and that line is load-bearing.** bui
  leaves `.bui-MenuContent`'s width to its content above a `min-width: 150px` (its own
  `width` fallback is the string `"undefined"`, which the browser discards), and a
  `MenuItem` puts `gap: var(--bui-space-6)` — 24px — between label and trailing slot.
  "Delete session…" with its icon wants ~155px, just over the minimum, so the popover
  rendered at the natural width and then settled back to 150px. That second layout pass
  made react-aria's popover resize observer trip the browser's "ResizeObserver loop
  completed with undelivered notifications" — twice, on every open of the menu. Sentry
  filters that message by default and production has no error overlay, but the
  dev-server overlay covers the page with it, which makes the page miserable to work on.
  Sizing the menu up front means one layout pass and no warning. The agent kebab escapes
  this only because its items happen to measure just under 150px.

  Verified against the kagent source at both `v0.9.9` (what the fleet runs) and
  `v0.10.0-rc1`: the handler, the SQL and the 200-with-envelope response are identical
  in both. Deleting from a list row is deliberately not offered, since a destructive
  action on a row someone is scanning past is easy to hit by accident.

- 86f7998: Download rows on the Serving view carry the pull's node and preset as
  model-manager reports them on the job (model-manager 0.9: what the request
  named, or the node it picked itself after the fit check), so a KServe download
  sits in its node's place of the group's placement column and its description
  says which preset it is for. Retry re-issues the pull with that preset and node,
  so the retry lands in the same cache directory on the same node instead of
  falling back to a directory named after the model on whichever node
  model-manager picks; Ollama retries are unchanged.
- 1f3fb8f: Downloads are rows of the served-models table on the Serving view instead of
  the "Model downloads" card under it. A pull in flight renders where its model
  will land — the pulled reference as the name, `Downloading` with the backend's
  progress message and figures (`pulling 6f7f… · 31 % · 114 MiB / 381 MiB`) and a
  progress bar as the status, Cancel in its actions menu — sorted among its
  future neighbours in the installation's group; a failed pull stays as a
  `Not ready` row with the failure in the status cell and Retry / Dismiss in its
  menu until dismissed (remembered per tab); a finished or cancelled pull leaves
  the table at once, its model appearing as the row it is. On KServe
  installations the row carries the download's node once model-manager reports
  it on the job. `PullJobsPanel` is removed.
- 2b79a0c: Editing an agent opens the new-agent wizard, prefilled from the agent, instead
  of the old edit form: the same Details, Skills, Tools and Review steps at
  `/agent-platform/agents/edit/<installation>/<namespace>/<name>`, More options
  showing the agent's own model (only its namespace's are offered), its fixed
  technical name and runtime, the skills step selecting its skills at their pins
  (and listing skills from elsewhere, removable), and a review that lists what
  changes, dry-runs exactly that and saves it with "Save changes" (or proposes it
  as a pull request for an agent applied from git). The former `…/<name>/edit`
  address redirects to the wizard. Saved edits and skill updates are reported as
  the `AgentPlatform.agentUpdated` event.
- 69979f8: Edit agent: an agent applied from git is edited through a pull request where agent-manager reports the `commit` capability. The page dry-runs the change with `validate_agent` in mode `commit`, shows the composed values and every violation as for a live edit, and offers **Commit** (`update_agent` in mode `commit`, a pull request as the signed-in person) in place of Save; once the pull request is open, Commit is locked for that change, so a second click opens none. An agent written live keeps only Save. Every agent write in mode `commit` (create, edit, delete, add model backend) now reads the pull request from agent-manager's `commit` answer and shows it with its repository and number; a commit refused with `auth_required` is shown as the write's refusal.
- 6e0bd9d: Agents are edited, have their skills updated and are deleted through
  agent-manager's tools over muster, as the signed-in person — the portal keeps no
  copy of the ownership logic and performs no direct Kubernetes write for agents.

  **Delete** calls `x_agent-manager_delete_agent`. agent-manager deletes the owning
  HelmRelease (helm-controller uninstalls the `AgentTemplate` and the agent's
  `RemoteMCPServer` with it) and the namespace's shared `OCIRepository` only when
  nothing else references it; the success toast names who the delete ran as and,
  when the chart source stays, agent-manager's reason (`ociRepositoryKept`). A
  GitOps-owned or suspended release is agent-manager's refusal, shown verbatim in
  the dialog; a viewer's confirm shows the apiserver's Forbidden. The portal never
  passes `force`. `useDeleteAgent` (owner resolution, the Kustomization and
  suspended guards, the sibling list, the `SelfSubjectAccessReview` gate) is gone.

  **Edit** (`Edit agent…` → `/agent-platform/agents/<installation>/<namespace>/<name>/edit`) is
  a form pre-filled from `x_agent-manager_get_agent` — display name, description,
  system prompt, model (from `list_model_configs`), toolset, skills with their
  pins; no runtime. The review is `validate_agent` with `update: true` for exactly
  the change Save sends: the changed fields, the values the release would carry,
  every violation. Save calls `update_agent` with the changed fields only (an
  emptied field as `""`, back to the chart default; `toolset`/`skills` replace
  their list), then the detail page polls `get_agent_status` until the platform
  Harness compiled the new revision. Adding a skill pins it to the head commit its
  card shows.

  **Update skills** (Skills card and kebab): the dry run (`validate_agent` with
  `update: true` and `refreshSkills`) shows, per git skill, the pinned commit next
  to its repository's default-branch head and which entries would move;
  digest-pinned skills are listed and left alone. Confirming calls `update_agent`
  with `refreshSkills` and nothing else. An unreachable repository is
  agent-manager's message and nothing is written.

  **Feature detection replaces the access review.** The three actions are offered
  when the installation's muster lists `agent-manager` (`core_mcpserver_list`);
  otherwise a disabled menu item says why. **Commit** (`mode: commit`,
  giantswarm/agent-manager#24) is wired on delete and on the edit review behind
  `get_info.capabilities.commit` and stays hidden until agent-manager reports it.

  Shared with the create flow: the `AgentManagerClient` seam (`get_agent`,
  `list_model_configs`, `validate_agent` as an update, `update_agent`,
  `delete_agent` added), the post-write progress element (now for create, save
  and skills update), `ConnectAgentManagerAlert` and `CommitOutcome` as shared
  components, `SkillPicker` for the skills grid.

- 1c1f579: Offer Edit for an agent applied from git when agent-manager can commit: the agent detail page's actions menu, the Skills tab's Add skills and the failure blocker open the Edit agent page, which opens a pull request in the GitOps repository instead of saving.
- 2b79a0c: **Evaluate** on a skill's page is now a direct action rather than a dialog. It starts a session with the agent configured as `metaAgents.skillEvaluation` and opens it, like every other session entry point. The session's first message names the skill, its repository, its SKILL.md path, its commit and its branch. It asks for an evaluation report in the chat and a pull request with the proposed improvements. The button still appears only where the role resolves. If the session cannot start, the page says why and stays put. The evaluate dialog is removed.
- b9433d4: The Agents and Sessions tabs now invite the first agent and the first session
  instead of showing an empty table. On a fleet with no agents, both tabs drop the
  table and show a card explaining what an agent is, with a **Create your first
  agent** button — previously the Agents tab showed column headers over the words
  "No agents found." and left the only create affordance in the page header, and
  the Sessions tab explained the absence in one grey sentence with no way to act
  on it.

  With agents but no sessions, the Sessions tab drops its empty table and search
  field and puts the new-session composer, expanded, in that same card under
  "Start your first session" — so the prompt box is the invitation rather than a
  collapsed strip above nothing.

  An empty list alone is not enough to make either claim. Neither tab invites
  creation when the agents could not be _read_ — an empty list because every
  installation failed is not an empty fleet, and pointing the user at the create
  flow would send them down the wrong path. The agent invitation additionally
  requires an installation in scope that runs kagent, so pinning to one without it
  keeps the table rather than offering a create flow with no target right below a
  note saying kagent is not installed there. And the session invitation requires
  that at least one installation was actually queried, so a portal that cannot
  reach any kagent endpoint no longer reports "you have never started a session".

  Those cases still get the "couldn't read" warning, and a fleet whose agents are
  all deployed-but-not-ready still gets the sentence pointing at the Agents tab.

- b6f72fb: The GPU capacity view lists only accelerator nodes, and says which of them the
  serving layer will actually place a model on.

  - **CPU-only nodes are gone.** A kserve model-manager (before 0.11) reports
    every cluster node it budgets, CPU boxes included; they rendered as
    "62.4 GiB free" rows with GPUs "—". The merge now keeps a node only with
    accelerator evidence — a device plugin advertising one, a discovery label, or
    the serving layer's own verdict — or when it is a backend host (the Ollama
    row, `budgetSource: host-meminfo`), and drops the rest.
  - **Not NVIDIA-only.** The cluster read recognises a node by the resource the
    installation's discovery ConfigMap names (`gpuResourceName`, read by the
    KServe source now) or any known accelerator resource (`nvidia.com/gpu`,
    `amd.com/gpu`, `intel.com/gpu`, `google.com/tpu`, `habana.ai/gaudi`,
    `<vendor>/npu`), besides the gpu-feature-discovery labels — and counts
    capacity, allocatable and requests in that resource. Without a product label
    the GPU column names the resource.
  - **Serving targets.** model-manager 0.11 reports `eligible` /
    `eligibilityReason` per node. A node it will not place a model on — outside
    the serving node selector, or unable to mount the model cache — is dimmed
    with "Not a serving target" under its name and the reason on hover (in the
    budget tooltip too), and the Serve dialog lists it disabled with the reason
    instead of offering it as a target, so a pin there no longer yields a
    predictor stuck Pending on a volume node-affinity conflict. Where the serving
    layer gives no verdict, a GPU node without a cache next to a node of the
    same installation that holds a node-local one gets the softer hint "no model
    cache on this node".

- 1698bc1: Add GPU node pool: the review shows **What this pool can serve** before Deploy — cluster-manager's `sizes` as the picker of the instance sizes Karpenter may choose from, each with what it leaves a predictor (vCPU, memory, GPUs); the serving presets published on the cluster with the smallest size hosting each or why none does (`presetFit`); and `warnings` for presets the accelerator could serve but no size of the pool hosts, naming the size that would, with **Add _size_** and **Choose sizes** at hand. Changing the sizes re-runs the dry run. An optional **I want to serve** picks one preset: the sizes hosting it are marked, and a preset this pool cannot host blocks Deploy with the reason; other presets' warnings stand out and do not block. A cluster without presets shows cluster-manager's note instead of an empty table. A Deploy cluster-manager cut short (`partial`) lists the pending objects and `nextStep` with **Continue**, which re-runs the same call; `PartialWriteOutcome` is one piece for every node-pool write.
- 91c421b: **Add GPU node pool** stands still and asks less (giantswarm/backstage#2501). Every section of the form is in place from the first paint — Cluster, Pool name, Accelerator, Node size, I want to serve, Zones, Model cache, Maximum GPUs — and a section whose content is still being read holds its place with a placeholder, so cluster-manager's answer fills the form in instead of moving it; an installation with one cluster has it picked as the form opens, its marks in one line under the picker. **Zones** starts with every zone of the cluster chosen and sends them as chosen (none chosen holds Review); the review says when every zone is chosen. **Keep a model cache** is off by default, and switched on its monthly price — cluster-manager's, from the dry run — is the switch's own line, with what the claim saves and that it is billed after the pool is removed too; off, the line says what a cold start costs and that switching on creates a billed claim. The **Teleport** field is gone: nodes join Teleport with the cluster's join token and no other way, and the form sends no `teleport` argument. The "N presets fit no size of this pool" alert is gone: the **I want to serve** list marks each preset with the smallest chosen size that hosts it, the size that would (to add under Node size), or that no size of the pool does; the preset chosen still blocks Deploy with the reason while no size hosts it. The GPU capacity page renders its cards and the header's button in place while their contents are read, and decides between the list and the empty state once, after everything is read.
- 2d333a6: GPU node pools: a lifecycle panel per pool shows what happens underneath after **Deploy** — pool release Ready, Karpenter pool ready (`0 nodes, launches on demand` at scale-to-zero), GPU operator operational, serving stack operational, backend registered with model-manager — each with its state, when it began or how long it took, what it usually takes and the manager's message, ending in **Serve your first model** (a link to the Serving page with the pool preselected). Deploy closes into the panel; a chevron on the row opens it later. The row reads the pool's phase (`creating`, `ready · 0 nodes`, `scaling`, `removing`, `failed · <reason>`) instead of `0 / 0`. The pools are re-read every 10 s while a pool is unsettled and every minute otherwise. The data is `list_node_pools` (`phase`, `steps[]`) and `list_clusters` (`readiness`) of cluster-manager 0.8; an older cluster-manager gets the panel with fewer steps from `poolReleases[].ready` and the components' `status`. The step list is the new shared `LifecycleSteps` component.
- 32f943c: GPU node pools: after **Remove** the row reads _removing…_ and the lifecycle panel shows the teardown — the serving controllers, the well-known configs, the GPU operator release, the backend registration, the serving slice release and the pool release going, from `delete_node_pool`'s answer and the pending objects `list_node_pools` still lists — until cluster-manager no longer lists the pool. A refused Remove is rendered from cluster-manager 0.8.1's structured `refused` block: the nodes the pool still runs, the models to unload first (links to the Serving page) and the hint that explains the wait (Karpenter removes an empty node about 10 minutes after its last pod), with **Check again** re-running the same call without force; **Remove anyway** (`force`) is a second, deliberate choice. An answer without the block (an older cluster-manager) is shown as it is, with Check again. A Remove cut short (`partial: true`) stays in the dialog with the pending objects and **Continue**. The replicas-guard regex on the refusal text is gone.
- f335a7f: Add GPU node pool: the preset chosen under **I want to serve** is the pool's serve intent, carried past Deploy. The lifecycle panel's last step reads **Serving <preset>**; once cluster-manager's readiness says the serving stack is ready and the kserve backend is registered, the portal calls model-manager as the person — `check_fit`, then `load_model {backend: kserve, model: <preset>}` through muster, the calls the Serve dialog makes — exactly once, and the step shows the served model's own timeline (node, weights, runtime image, vLLM, route, endpoint) beneath it until the model answers. A preset the pool as deployed cannot host shows `check_fit`'s reason verbatim with **Serve another model** as the way out; a load model-manager threw on offers **Try serving again** and the Serve dialog with the preset preselected. The intent is kept per installation/cluster/pool in the browser with the outcome of the one load, so a reload or a walk-away keeps the step and its state and never repeats the load; a served model of that preset on the cluster marks it done; Remove clears it. **Serve your first model** and the pool's Serve dialog carry the preset (`?preset=`), so the person never picks it twice. A Deploy without a preset behaves as before. The pools poll keeps going in an unfocused tab, so the intent is served when the stack is ready, not when the person looks again.
- 19d8e11: Add GPU node pool: the **node size** and its hourly price are chosen on the form, next to the accelerator, with the presets that fit — not discovered behind Review. As soon as the cluster, the pool name and the accelerator are set, the form runs cluster-manager's dry run with the chart's defaults and offers **Node size**: every size cluster-manager composes for the accelerator with its instance type, what it leaves a predictor (vCPU / memory), its GPU memory and its on-demand price per hour (`$1.01/h`, with the price list and its date as fine print; the tool's note where no price is listed), the chart's defaults preselected and the cheapest chosen size as "from $x.xx/h per node — the pool scales to zero". **I want to serve** offers the presets cluster-manager judged — published on the cluster or, before a serving slice exists, shipped by the chart — by display name with the model as secondary text; choosing one preselects the smallest size that hosts it and marks the others; a preset no chosen size hosts blocks Deploy with the reason, other presets' warnings stand out and do not block. Every change re-runs the dry run. The review shows the same sizes and preset, the fit table with each preset's hosting size and price, and the manifests; Deploy sends the sizes as chosen. An older cluster-manager without prices or display names is shown as before.
- 55b2dd9: Add GPU node pool: where the pool runs and whether it keeps a model cache are the person's choices on the form. **Zones** lists the cluster's node-subnet zones as cluster-manager's `list_clusters` names them, any combination, none chosen leaving the choice to the platform (Karpenter searches every zone for capacity); **Keep a model cache** is on by default — the installation's behaviour until now — with its consequence in one line each way: on, a cache claim per zone, about $27 a month at the platform's defaults, saving the download and the compile of every later start of the same model in that zone; off, nothing stands, the weights land on the node's disk, a cold start costs about 90 s more. The review repeats both with what cluster-manager's dry run makes of them — the pin (`zonesNote`) and the claim the slice mounts (`cache.note`) — so what Deploy would write is read before it is written; Deploy sends `zones` (only when named) and `cache` to `create_node_pool`, and the lifecycle panel shows the answer's two notes beneath the applied objects. A structured refusal about the zones and the cache (`refused.cacheZone`, `refused.cacheClaims`: the claim at fault with where it stands, and the ways out) renders as the form's error with its remedies, nothing parsed from prose. Both choices are offered only where the installation's `create_node_pool` declares the arguments (its schema, read once per installation as the accelerators are), so an older cluster-manager shows the form as before rather than a failing call.
- 247709d: Host memory budget and GPU share for Ollama installations on the Models tab.
  The GPU capacity view renders the host node an Ollama-backed model-manager
  reports (`budgetSource: host-meminfo`, model-manager 0.7+): the host's memory
  as the model-manager pod sees it as the budget, what the loaded models take of
  it as reserved, what is free, and an `accelerated` marker when a loaded model
  sits on the GPU — with no GPU product, count or device-plugin figure, which
  Ollama's API does not expose (a fleet of such hosts shows no GPU columns at
  all; next to a KServe node the host row reads "—" with what it is on hover,
  never "unknown"). The memory budget cell now shows the reservation in text
  for every node. On the Serving view a loaded model's memory line carries the
  share of its footprint on the accelerator, from `running.vramBytes` —
  `5.4 GiB in memory · 100 % GPU · evicts 22:58`, `CPU` when none of it is
  there, a percentage in between — and explains on hover that the footprint is
  the weights plus the KV cache for the loaded context length. An older
  model-manager (no `vramBytes`, no Ollama node inventory) keeps today's line
  and the view's empty state; Ollama rows still show no Node or GPUs column.
- b0a1bd2: The agent creation wizard lists the Harnesses of the model's namespace as runtime cards and creates the agent on the one picked, passing `harness` to agent-manager's `validate_agent` and `create_agent`. The platform Harness stays the default and is sent as no `harness` at all; a namespace with a single Harness shows it as a read-only card. The review names the chosen Harness and its runtime. A Harness is offered only when every requirement of its selector holds for the labels the Generic chart puts on the template; a list read only in part says it may be incomplete. `kubernetes-react` exports a `Harness` resource class.
- a59b04c: - Agents list: a Harness column (the Harness's display name or runtime, its name beneath) and a Harness filter beside the search box (kept in the URL), shown once agents run on more than one Harness. Search also matches the Harness. A search that finds nothing offers "Show all agents".
  - The agent's Status card and the create wizard show the per-turn limits a Claude Code Harness sets (budget and max steps), read-only.
  - The usage tab shows "Reported cost" next to "Est. cost", in the totals strip and the By agent table, when an agent's runtime reported one.
- 2b79a0c: The new-session home's composer now leads with the agent: the picker is the
  box's first row ("First choose an agent", then "Agent"), with the message
  field under it. A `?agent=<installation>/<namespace>/<name>` link preselects
  that agent when it can be started. `NewSessionComposer` gains
  `pickerPlacement` and `pickerLabel`; the Slack promo stays under the composer.
- 2b79a0c: Implement the home and sidebar product feedback.

  - **New-session view centered, agent-first.** The home screen's greeting and
    composer now sit vertically and horizontally centered in the content area
    (clearing the mobile bottom bar via `--agent-shell-mobile-bar-height`). The
    model chip is gone from the composer — the model stays the agent detail
    page's information. Choosing the agent is unmistakably the first step, as
    in the prototype: until one is chosen the picker carries an accent ring and
    "Required to start", while the prompt field ("Then type your message
    here.") and Start are disabled. `NewSessionComposer` grew an opt-in
    `agentFirst` prop for this; every preselected path — a `defaultAgent`, a
    sole agent, the dialogs, the palette, Evaluate and the assist panel — is
    unaffected.
  - **Sidebar picks up new sessions immediately.** Starting a session now
    invalidates the installation's sessions list and session states with an
    active refetch (from `useCreateSession`'s `onSuccess`), so the shell rail's
    history — which stays mounted through the navigation — shows the new
    session at once instead of waiting out its poll interval.
  - **Status dots instead of the "Needs you" pill.** The rail's session rows
    mark state the way Claude does: a small orange dot for a session waiting on
    the person ("Needs your input" as tooltip and accessible name), the blue
    dot for a working agent ("Working"). The pill is gone; a waiting session's
    title stays bold.

- 551e5d5: One installation scope for the Agent Platform section. A selector in the page header lists "All installations" (the default) and every installation whose inventory has kagent, muster or KServe, home first, each with its state (signed out, not reachable from this portal, no kagent/muster here); it scopes Agents, Sessions, Models and MCP Servers alike, is kept in `?installation=` and in localStorage under the key the muster picker always used, and is not rendered on a portal that knows one installation. Under "All installations" the three fleet-wide lists query the home installation first and render its rows before any other installation is asked; the others stream in as groups below, each headed by installation name, pipeline and a status line (loading, N items, none here, could not be read, not reachable from this portal). The MCP Servers tab shows the home installation under "All installations" and follows a pinned installation otherwise; its picker pins the shared scope instead of owning one, and no default is written back any more. Detail pages (agent, session, model) carry an installation chip in the header; the New-session composer names the installation in every picker row and in the selected value when the offered agents span more than one installation. The gs plugin exports `useInstallationScope`, `useInstallationScopeUrlSync`, `InstallationScopeSelect`, `applyInstallationScope` and the store (`setInstallationScope`, `INSTALLATION_SCOPE_STORAGE_KEY`, `INSTALLATION_SCOPE_SEARCH_PARAM`, `ALL_INSTALLATIONS`). The agent-platform tabs share one live react-query client. The Model configs list and the Add-model form take their installations from the inventory's kagent installations, home first, instead of every reachable installation.
- 7654695: Add a version-tolerant kagent API client, the data layer behind the upcoming
  Agent Platform "Sessions" list. No visible change yet.

  kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is already on
  v0.10.0-beta9, and each installation is an independent deployment — so the fleet
  can run several kagent versions at once. Everything here is therefore keyed per
  installation and defensive by default:

  - **Tolerant wire → domain boundary** (`lib/kagentSchema.ts`,
    `lib/kagentSessions.ts`). Responses are parsed with permissive zod schemas
    (unknown fields pass through, every field may be absent or retyped) and
    normalized into a stable `KagentSession` the UI consumes, so a schema change is
    absorbed in one function. Rows are validated individually: one malformed entry
    is skipped rather than costing the whole list. Envelope drift is tolerated too —
    `data` absent (Go's `omitempty` on an empty slice), `data: null`, or a bare
    top-level array. `Date.parse`-hostile values and Go zero time
    (`0001-01-01T00:00:00Z`, which browsers render as "Dec 31, 0000") are dropped so
    callers can show a dash. An in-band failure (`{error: true}` on a 200, which the
    backend passes through verbatim by design) is reported as drift rather than
    silently becoming an empty list. Drift carries a stable `kind` alongside its
    message, so callers can deduplicate logging without keying on a formatted string
    that embeds a varying row count.
  - **Per-installation capabilities** (`lib/kagentCapabilities.ts`,
    `hooks/useKagentCapabilities.ts`), keyed per installation because each is an
    independent deployment. Currently one observable capability: `isUserScoped`,
    from a cached `/me` probe. kagent's `unsecure` auth mode ignores the forwarded
    token and resolves every caller to a shared built-in user, so the list would
    silently not be "your sessions" — worth detecting rather than mislabelling. The
    probe is non-fatal and never gates the sessions query. It is **tri-state**:
    `undefined` means "we don't know", which is distinct from a confirmed shared
    user and is reachable on a healthy deployment, since `/api/me` returns the
    token's claims verbatim and an IdP need not emit `sub`. Callers must stay silent
    on `undefined` rather than treating it as either answer.

    Capabilities are deliberately **not** derived from a kagent version number.
    kagent serves `/version` at its server root, which neither door we reach it
    through routes to the controller (the derived door's nginx sends `/` to the
    kagent UI; the agentgateway override matches only `/kagent`), and nothing under
    `/api` reports the controller version. Version _tolerance_ does not depend on
    it — that lives in the parsing layer above, which is where it does the real
    work. If version gating is ever needed, probe by behaviour (call a
    version-specific endpoint, treat 404 as "absent") instead.

  - **`KagentApiClient`** (`apis/`), registered as `kagentApiRef`. Mints each
    installation's Dex ID token lazily per request so a mint failure degrades one
    installation (the user may be signed in to some and not others), and never
    caches tokens — the plugin's query cache is persisted to `localStorage`, which
    is no place for a credential. For the optional-token `/me` probe the mint is
    best-effort: the request still goes out without the header, so a broker failure
    does not cost the diagnostic on the installation that most needs it. Status
    codes map to the error names the plugin's retry predicate and the sessions
    provider classify on — including `400`, which the backend returns for an
    installation outside its kagent allowlist and which therefore belongs on the
    same silent "not available here" path as a `404`.
  - **`lib/installationOidcToken.ts`** extracts the token-minting sequence
    previously inline in `useDeployAgent`, so the deploy flow and the kagent client
    mint identically.

  Backed by version-matrix fixtures — including a captured live v0.9.9 response —
  asserting that v0.9.9 and v0.10 payloads normalize to identical output and that a
  synthetic future version with unknown fields changes nothing.

- f088683: Export `parseSkillDetailPath`, `parseServeSeed`, `serveSeedSearch`,
  `isLegacyServeLink` and the `ServeSeed` type, so the app's mapping of old Agent
  Platform addresses reads a skill's path and Serve model's seed the way the
  pages do.
- 4cdc2c0: The Agent Platform's tabs read **Sessions · Agents · Models · MCP Servers · Workflows · Usage**: the page orders its tabs itself, by a declared list, whatever order the plugins attach them in or a deployment's `app.extensions` names them. An agent's toolset links each tool to its page beneath the MCP server offering it (falling back to the servers list searched for the tool), and the gateway binding and the "Sign in to muster" note link to muster's MCP Servers tab. The `musterToolExplorer` external route is replaced by `musterServers` and `musterServerTool`.
- e06dec9: Every link into the Agent Platform shell resolves through a route ref, an
  external route ref the app binds, or a helper built on one, instead of a
  hand-written `/agent-platform/…` or `/customize/…` path. No address changes.

  agent-platform adds a `newSession` external route (the shell's home, bound by
  the app like `customize`) and a `musterServer` external route (a connector's
  page), and exports the route refs it kept private:
  `agentEdit`, `modelEdit`, `serveModel`, `importModel`, `pullModel`,
  `addModelBackend` and `addGpuNodePool`, and the Usage views `usageOverview`,
  `usageCost`, `usageConversations` and `usageConnectors`. muster exports
  `newMcpServerVerify` and `withInstallationQuery`, which builds the query of a
  connector, tool or workflow link: `?installation=` first, then any further
  parameters.

- 7a49e7f: Models: the serve flow and the KServe serving source follow the platform's one serving path — KServe's llm-d `LLMInferenceService` composed by model-manager — and the classic `InferenceService` path is removed.

  - **Serving a model is model-manager's `load_model` as the signed-in person, everywhere.** The Serve dialog that composed an `InferenceService` in the browser from the preset ConfigMaps and the discovery config's `runtime`, `deploymentStrategyType` and `timeoutSeconds`, wrote it with the person's RBAC and created the kagent ModelConfig once it was ready is gone, with the preset ConfigMap reads and the auto-wiring: the `Serve model` button and a row's _Serve…_ open the dialog with model-manager's presets, `check_fit`'s verdict and one `load_model` over muster, on every installation whose model-manager can load; model-manager composes the object and wires the model config. No serving object is written by the portal.
  - **The KServe serving source lists `LLMInferenceService`s** (`serving.kserve.io/v1alpha2`) and their workload pods by the llm-d controller's labels (`app.kubernetes.io/part-of=llminferenceservice`, `app.kubernetes.io/name=<object>`), reads the accelerator count under the installation's `gpuResourceName`, and folds a row onto model-manager's by namespace and name — never by host, since every routed model answers on the models Gateway's one host. A ModelConfig on the Gateway is linked to its model by the route's path (`/<namespace>/<name>`), and one whose path names no listed object, or that points at a workload Service (`<name>-kserve-workload-svc`) nobody serves, reads _Not serving_ with the object named. _Stop serving…_ deletes the `LLMInferenceService` where model-manager does not operate the row.
  - `@giantswarm/backstage-plugin-kubernetes-react`: `LLMInferenceService` (model, template, pinned node, accelerator request, readiness with reason and message, the route and the workload Service, endpoint hosts) replaces `InferenceService`; `urlHostname`, `isClusterLocalHostname` and `clusterLocalServiceUrl` are exported from their own module.

- bff30cb: Models pages: the model cache is shown for what it is — the cluster's, and billed while it stands (giantswarm/backstage#2493). **Add GPU node pool**'s _Keep a model cache_ switch reads its figures from cluster-manager's dry run: the claim the slice would mount, its size and tier, its monthly list price in the cluster's region (existing, or as the connectivity chart would create it) and its source, and says the volume is billed while the claim exists — after the pool is removed too — until the cache is removed on the GPU capacity page; with the switch off and a claim standing, the line names it as staying and costing. Where the picked cluster's serving slice runs with the cache on, the switch is on and locked: every pool of the cluster serves from it, the kept claim is named with its price and since when, and the way to serve without one is the new **Model cache** card. That card, on the GPU capacity page and on Serving, lists every `hf-cache*` claim `list_clusters` reports — clusters without a pool included — with its zone, size, cost, since when and what uses it, the standing total, and **Remove cache**: a confirm naming what goes (the cached weights and compiled graphs, the volume), what stops (the monthly price) and what follows (the slice serves from the node's disk, every model downloads again at its next start), calling `remove_model_cache` as the person; the structured refusal names the models to unload first, each a link to Serving, with _Check again_. Offered where the installation's cluster-manager lists the tool (0.17+); an older one shows the claims read-only. A `cache: false` refusal from cluster-manager (`refused.cacheOn`) is rendered with the claim, its price and the ways out.
- 9c53996: **Connect a model** offers **Claude on Vertex AI** and **Gemini on Vertex AI**
  (`AnthropicVertexAI`, `GeminiVertexAI`). For these, the form asks for the
  **Location** (`global`, `us`, `eu` or a region) and the **Service account
  key** file, chosen or dropped on the field. The key is never shown: the field
  says which service account and project the file names, and the model runs in
  that project. The form writes the model's `anthropicVertexAI` or
  `geminiVertexAI` block, and stores the key in the model's Secret under
  `GOOGLE_APPLICATION_CREDENTIALS`. As soon as a file is chosen, the form checks
  it the way kagent does: it must be a service account key naming a project,
  and its token endpoint must be `https://oauth2.googleapis.com`. An edit keeps
  the stored key until another file is chosen.

  The form's "Provider & model" section is now two: **Provider** (with the
  endpoint or location) and **Model**. Location is checked when the person
  leaves the field, like the form's other fields.

  Existing Vertex AI models can now be edited in the portal. The model page's
  Overview says that the LLM gateway does not meter Vertex AI models, so their
  spend and tokens are not on the Usage tab. `ModelConfig` gains
  `getAnthropicVertexAI()` and `getGeminiVertexAI()`.

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

- 2b79a0c: A model's page moves to `/customize/models/<installation>/<namespace>/<name>`,
  beside Customize → Models; the former `/agent-platform/models/…` address
  redirects there. The page gains the agent page's **Technical details**
  fold-out (GitOps source, the ModelConfig's name and key Secret, and the
  controller's conditions with reason and message), open on arrival while the
  model is not accepted; the technical name moves there from beside the title.
  Customize → Models shows why a model is **Not accepted** or **Pending** in a
  hint beside its status (for an unreconciled change, that it is not reconciled
  yet). The agent page links the ModelConfig to the model's page where it could
  be read. The model page's spend-per-day chart draws no legend
  (`CostPerDayCard` gains `showLegend`). The plugin gains a `customize` external
  route, which the app binds to its Customize page. `ModelConfig` gains
  `getConditions()` and `isStale()`, and `isModelConfigStatusStale` and
  `MODEL_CONFIG_CONDITION_ORDER` are exported.
- 335f7fe: The Models tab's "Model configs" view no longer splits the list into one
  section per installation under "All installations". Every kagent
  installation in scope got a heading and a status line of its own — "no models
  here" for the ones with none — so the models themselves were pushed down the
  page and spread over several small tables that could not be sorted or scanned
  together.

  The view is now one flat table under every scope, the same table a pinned
  installation and a single-installation portal already showed. The
  **Installation** column, the table's initial sort, tells the rows apart; an
  installation without a ModelConfig simply has no row, and one that could not
  be read is still called out in the warning card below the table.

  With this the Agents, Sessions and Models lists all read the same way.

- 335f7fe: The model configs list is now the Models tab's own page, at
  `/agent-platform/models`, and the second-level tab row appears only where
  there is more than one view to switch between.

  The list used to sit behind a "Model configs" tab at
  `/agent-platform/models/configs`. On a portal whose installations have no
  serving layer — which is most of them — that row held a single tab, leading
  back to the page it was already on, and the extra path segment said nothing
  the tab above it had not already said.

  Where a reachable installation does have a serving layer, the row is back to
  three tabs: **Model configs** (now pointing at the tab root), Serving and GPU
  capacity.

  The create and detail flows move up with the list, to
  `/agent-platform/models/new` and
  `/agent-platform/models/<installation>/<namespace>/<name>` — where they lived
  before the tab row existed. Every `…/models/configs/…` link still resolves:
  those paths redirect, as the pre-tab-row ones already did.

- ab3560e: Models pages call model-manager through muster as the signed-in person. Every read and write behind the Serving view, the GPU capacity panel and the Serve dialog — `list_backends`, `list_models`, `list_presets`, `check_fit`, `load_model`, `unload_model`, `list_nodes`, the pull jobs, wiring and deletion — is one `x_model-manager_<tool>` call over the installation's muster; whether an installation has a model-manager is the presence of the `model-manager` MCPServer in its muster, so no portal configuration says where model-manager is. A GPU node pool's **Serve your first model** therefore reaches the kserve backend the pool registered — its presets, the fit verdict against the pool's sizes, the `load_model` as the person — wherever muster lists model-manager, and the browser-composed InferenceService of the CR view is withheld there, even while model-manager reports no backend yet. A model-manager with no backend registered is listed as a serving layer with nothing registered, not as unreachable. model-manager's refusals keep their meaning (`not_found`, `unsupported`, `conflict`, `does_not_fit`, `backend_error`).

  The backend's `/model-manager/...` REST pass-through and its `agentPlatform.modelManager` configuration (`installations`, `timeoutMs`, `loadTimeoutMs`) are removed; the block is ignored where a config still carries it. The one model-related call the backend still makes is **Try it** on a served model, now `POST /served-models/try` with the endpoint model-manager reported, held to the installation's own base domain.

- 7273a37: Start a new kagent session. The Sessions tab now carries a composer above the list —
  collapsed to a single line, expanding on focus — with a prompt, an agent picker and
  "Start"; the agent detail page offers the same composer in a dialog with that agent
  preselected. Cmd/Ctrl+Enter starts, Enter inserts a newline.

  **Create, navigate, then send, in that order.** Backing this is a new
  `POST /kagent/sessions` route over kagent's `POST /api/sessions`. Only the create
  happens before navigating: `message/send` blocks for the whole turn, so awaiting it
  first would leave the user on the list for up to half a minute, and firing it
  un-awaited would lose the optimistic echo along with the component holding it. The
  prompt travels with the navigation instead and is sent by the session detail page, so
  the message, the "Working…" indicator and the failure path are all the ones that
  already existed for a reply. The router state is consumed once and cleared — it
  survives a reload and a Back navigation, and re-reading it would start a second paid
  turn with the same prompt.

  **Titles are derived from the prompt**, because kagent does not auto-title: a create
  with no `name` comes back with no `name` at all. Whitespace collapses, the title is cut
  to 60 characters at a word boundary, and it stays renameable.

  **Only ready agents can be chosen.** Non-ready ones are listed but disabled, with their
  readiness message as the reason — offering them would create a session whose first turn
  then fails with nothing on screen explaining why, and hiding them would make a broken
  agent indistinguishable from one that never existed. Picking an agent picks its
  installation, since that is part of an agent's identity, and the picker groups by
  installation once the fleet has more than one.

  The default agent is the **last one used**, remembered per browser and re-resolved
  against the live fleet, so a deleted or no-longer-ready agent falls back to asking for a
  choice. Nothing is preselected on first use: unlike the prototype we have no canonical
  "general purpose" agent, and guessing costs money against something that can act on a
  cluster.

  The prototype's visibility/team selector is dropped — kagent has no sharing model for it
  to map onto.

  Also: **answer an agent's question**. When an agent stops and asks — kagent's
  `input-required` — the session detail page now replaces the reply composer with an
  answer panel: radio buttons for a single choice, checkboxes for a multi-select, and a
  free-text box on every question — a choice list is not exhaustive, and typed words do
  reach the agent because they go inside `ask_user_answers` rather than the message's text
  part. A tool the agent wants permission to run gets Approve/Decline instead. The reply
  composer stays on screen, disabled and saying why: a plain message cannot answer a
  confirmation, but a box that disappears reads as the feature being missing rather than
  blocked. kagent's own UI makes both of these calls.

  The important part is that the answer **names the task it resumes**
  (`params.message.taskId`). Without that, kagent opens a new task: the agent reads the
  words, but its suspended tool call never receives a response, so the task stays
  `input-required` for ever and the model history holds a `tool_use` with no
  `tool_result`. Verified on an internal installation — a session with three questions
  answered from Slack holds seven tasks, three of them stranded; the same question
  answered here resumed a single task in place and the agent continued where it stopped.
  (klaus-gateway sends the id as `params.taskId`, which no A2A version defines and the v0
  conversion drops. That is a one-line fix on their side.)

  Three further details of the format, each verified against kagent's source and against
  live traffic: `decision_type` is mandatory even for a question, because both executors
  read it before they look at the answers; `ask_user_answers` is positional with one
  array per question, and kagent treats a short array as "unanswered" rather than an
  error — so the panel will not submit until every question has something; and an answer
  carries the choice's own text, not its index.

- 2b79a0c: Add a minimal in-shell "Profile and settings" page at `/agent-platform/profile`:
  who is signed in (name, email, avatar), the installations the portal talks to,
  and Sign out. The shell rail's profile menu now links here in the same tab
  instead of jumping into the classic `/settings` chrome, and its "Feature flags"
  item is gone — not relevant inside the Agent Platform. The classic settings
  stay reachable through the page's explicit "All portal settings" link, which
  opens the Platform Portal in a new tab per the shell's cross-link convention.
- 2b79a0c: The Agent Platform's Profile and settings page ends with the portal's release, the same line as at the bottom of the classic home page, linked to the repository and the release tag. `ui-react` exports it as `GSReleaseInfo`, which takes the version as a prop; inside the shell its new-tab links end in "↗".
- 55e9be1: The workspace provider sign-in is one `ProviderConnectPrompt`, used inline by
  the workspace editor and by the composer's workspace start: it starts the
  grant of each provider instance's own App in muster (`core_auth_login
app=<instance>`), or the server the workspace-manager is pinned to, in a new
  tab, reads `list_providers` again when the person comes back, and tells its
  host once the instance reads connected, with the host's draft or prompt kept.
  Several provider instances, of any kind, connect independently; the composer
  starts the session once every one it asked for is connected. muster's
  `/auth/login` and `/auth/logout` take `{ app }` in place of `{ server }`, and
  `useServerSignIn` signs in to a provider App with `{ app: true }`.
- 03a24b1: The session page shows the cost the agent's runtime reported beside the estimated cost. The claude Harness reports `costUsd` in each turn's `kagent.dev/a2a/usage`; `TokenUsage` carries it as `costUsd`, summed like the tokens and absent when no turn reported one. A session whose runtime reports no cost shows no reported figure.
- bf367f1: A session whose runtime kagent cannot bring back explains itself and offers a
  way on, instead of `actor "ai-…" request timed out` and the same retry forever.

  A session that ends a turn by asking the person something is paused to a
  snapshot on the worker's node; when that node goes away (a spot interruption,
  a node roll) the next message fails after kagent's 60 s with the runtime's
  words, and so does every retry. The page now reads that failure — off the
  newest turn, off the send's own error, and off the `RUNTIME_LOST` failure
  kagent will record on the instance — and says in its own words that the
  runtime could not be brought back, that the conversation stays readable and
  nothing is missing from the transcript, and offers **Start a new session with
  &lt;agent&gt;** beside Send, carrying the box's text or the message that never
  got its answer. The failed-turn entry says whose failure it is and keeps the
  runtime's text as the evidence. Once kagent reports the loss, the header, the
  Sessions list and the switcher rail mark the session, the new session takes
  Send's place (and Enter), and the answer panel yields to it. A delete that
  fails on such a session says why (kagent suspends the runtime before removing
  the instance, and that runtime cannot be reached) and what fixes it.

  The common package gains `readRuntimeLoss` and its readers, so every surface
  agrees on what it is looking at.

- 5804cd2: Let a session be carried on: a message box at the foot of the session detail page,
  which until now could read a conversation but not add to it.

  **Sessions cannot send messages, which is what shapes this.** kagent's session
  endpoints hold history only; talking to an agent means A2A JSON-RPC `message/send` to
  `POST /api/a2a/{namespace}/{name}` with `contextId` set to the session id — the only
  thing tying a turn to a session. So this is a different endpoint family from
  everything the proxy did before, and the new route
  (`POST /kagent/sessions/:sessionId/messages`) is session-shaped rather than
  agent-shaped because the session is what the user is looking at. The JSON-RPC envelope
  is built in the backend client, so the frontend never learns A2A.

  **The agent's namespace and name travel in the request, and are never decoded from
  the session's `agent_id`.** That id is kagent's "python identifier" encoding, which
  rewrites every `-` to `_`; decoding cannot tell an original underscore from a
  rewritten hyphen, so an agent whose name legitimately contains one would resolve to an
  agent that does not exist. They come from the matched `Agent` resource instead —
  `SessionRow` now carries `agentNamespace` alongside the technical name — and a session
  with no matching `Agent` has no addressable agent at all, which is one of the cases
  where the composer is withheld rather than offered.

  **`message/send` answers only once the agent has finished**, verified against kagent
  0.9.9 on an internal installation: the reply is the whole finished task, `result.kind
=== 'task'`, with `status.state` and full `history`.

  **That wait can neither be completed nor is needed.** That installation's
  `agent-platform-connectivity-ui` HTTPRoute carries an Envoy `BackendTrafficPolicy` with
  `requestTimeout: 60s`, so any turn of substance is cut off with a 502 well before it
  ends — and **the turn survives the cut**, observed live where an agent answered a
  message whose request had already died with a 502.

  Since it survives, waiting buys nothing but a held-open socket, and
  `agentPlatform.kagent.turnTimeoutMs` defaults to a deliberately short **30 seconds**.
  That value is chosen to lose a race rather than to bound a turn: the browser's request
  traverses a door of its own in front of Backstage, and if that fires first the frontend
  gets a 502/504 nothing here can reinterpret, because this service never got to answer.
  30 s always beats a 60 s door. (That installation's Backstage route sets
  `requestTimeout: 0s`, disabling it — but the send path must not rely on that holding
  everywhere.)

  So a lost connection is not a failed message, and the client does not guess: on a
  502/504, its own timeout, **or a socket that simply died**, it re-reads
  `GET /sessions/{id}/tasks` and checks whether the `messageId` it generated is in the
  history. Present means dispatched-and-running, which answers **202**; absent — or
  unreadable — keeps the original failure, because "cannot tell" must not be read as "it
  worked".

  That last case needs care: `request` maps any non-timeout fetch rejection to a 404,
  since on a fleet where most installations run no kagent that is the normal outcome and
  must stay off the 5xx path — but the same branch catches an Envoy drain or a TLS reset
  mid-turn. Those are marked transport-borne so a send verifies them, while kagent's own
  JSON 404 for a missing agent stays a decision. Decisions are never verified: not a 401,
  a 403, a rejected request, nor a JSON-RPC error.

  **A JSON-RPC failure arrives inside a 200, and would otherwise pass for a sent
  message.** A2A is JSON-RPC, so invalid params, an unsupported operation, a task-store
  failure or an agent whose server is not ready come back as
  `{"jsonrpc":"2.0","error":{…}}` with a 200 — an `error` _object_, where kagent's REST
  envelope uses the boolean `true`. Checking only the boolean let all of them through, and
  the consequence was specific: the caller drops its optimistic copy, the invalidated read
  returns no new task, and the message vanishes from the page with no error shown
  anywhere. Both shapes are now read, outside the verification path so a rejection cannot
  come back as a turn still in flight.

  202 rather than a 5xx also keeps this off the path `MiddlewareFactory.error()` forwards
  to Sentry, which would otherwise mean one issue per long turn, for the thing an agent
  is supposed to do.

  **A failed turn is still a 200.** The reason lands on `status.message` — an agent that
  cannot reach its MCP server says so there — so the HTTP status says only whether the
  turn was accepted, and what became of it is read from the task like any other
  progress. Nothing in the client inspects the result.

  **Output appears by polling, deliberately not by streaming.** The conversation already
  polls at 10 s while the newest task is active, so a send needs no new transport: it
  invalidates and the existing tier follows the turn. A relayed A2A SSE stream would
  have needed a streaming pass-through in `KagentClient.request` (a one-shot `fetch` +
  `.json()` today) plus flush-wrapping to defeat Backstage's global `compression()`
  middleware, which buffers `res.write()` until `res.end()` — the trap
  `ai-chat-backend`'s router already documents — plus reconnect handling. None of that
  buys anything the poll does not already do for a turn measured in tens of seconds.

  **The message shows immediately, and disappears by recognition rather than by
  timing.** The composer generates the `messageId` before sending, so the optimistically
  rendered copy can be matched to kagent's stored one and dropped the moment a poll
  returns it — which can happen long before the turn ends, and would otherwise show the
  message twice for the rest of it. `TimelineItem` gains a `messageId` for this: its
  existing `id` is positional and stable only for React. It is also cleared on failure,
  where nothing was recorded.

  **The conversation ends with a "Working…" spinner while the agent is mid-turn**, where
  the reply will appear. It takes two signals, because neither spans a turn: the
  conversation's own verdict arrives up to 10 s late, and the in-flight send covers
  precisely that gap while being unable to carry the rest, since the gateway cuts the
  request off first.

  `isActive` is not the same question, and three things narrow it into a new
  `isAgentWorking` (in `lib/kagentSessionState.ts`, which the composer also closes on):
  the newest task must be active; its state must not be one of
  `AWAITING_INPUT_STATES`, since `input-required` is active but blocked on a human and a
  spinner there promises progress that cannot come; and the state must have moved within
  `ACTIVE_MAX_AGE_MS`, because an agent that dies mid-turn never writes a terminal state
  and a stalled turn would otherwise look like a slow one indefinitely. The badge still
  reads "Working" in that last case — `state` is what kagent says, this is what we are
  willing to claim about it — and the composer is freed, since a turn that will never end
  must not hold it shut.

  It is judged as of the last successful read (`dataUpdatedAt`) rather than `Date.now()`,
  which is what makes it expire at all: with a render-time clock the answer would only
  change when something re-rendered, and a stalled turn is exactly when the data stops
  changing.

  `ACTIVE_MAX_AGE_MS` and the backwards walk resolving the age basis move to
  `kagentSessionState` as `readNewestTaskState`, so the indicator and the poll tier
  cannot drift apart — and the duplicated walk the polling code previously apologised for
  is gone. They disagree on one point deliberately: a state with no usable timestamp
  anywhere counts as working but polls on the baseline, since an unbounded fast poll
  costs every reader bandwidth while an indicator that cannot expire misleads only the
  person looking at it.

  The composer is **withheld, with a reason, rather than offered and left to fail**:

  - on a read-only shared session, which rejects every non-GET under `/api/sessions`
    with a 403;
  - when the session's agent cannot be found, so there is nowhere to send;
  - while a task is `input-required` or `auth-required`. This one is the opposite of
    "busy" and worth stating: the agent asked something, and a plain message does **not**
    answer it — kagent opens a _new_ task and leaves the question pending forever. So
    offering the box there would quietly strand the conversation. Answering a question is
    a structured reply and remains unbuilt; the page now says so and points at kagent's
    own UI.

  And it is closed while the agent is mid-turn, since kagent has no notion of a queued
  follow-up — a second message during a turn competes with the first rather than waiting
  behind it.

  Smaller decisions:

  - Enter inserts a newline, **Cmd/Ctrl+Enter sends**. Prompts are often multi-line, so
    Enter-to-send would truncate more messages than it saved.
  - The field clears on submit, not on success. The message is in the transcript from
    that moment, and a turn is far too long to hold someone's text in a disabled box. **On
    failure the text is handed back into the box**: the optimistic copy is dropped at the
    same time — nothing was recorded, so the transcript must not keep showing it — which
    would otherwise leave a pasted manifest nowhere at all. Handed back by attempt id, so
    resubmitting identical text and failing again restores it again, and a re-render never
    overwrites an edit in progress.
  - `SessionState` gains `key`, the normalised state, and the two places that ask "is the
    agent waiting on a human?" compare against it. `describeSessionState` matches
    case-insensitively but keeps `raw` verbatim, so comparing against `raw` would miss an
    `Input-Required` — and then both promise progress and offer the composer on the one
    session a plain message strands.
  - Messages are capped at 32,000 UTF-16 code units — ours, not kagent's, which
    validates nothing. Generous because pasting logs or a manifest into a prompt is
    normal; the backend enforces it too, and its JSON body limit is raised to 256 kB so
    that cap is the bound a caller actually meets: 32,000 code units of CJK is ~96 kB,
    which clears the 100 kB default by too little to rely on, and a 413 from the body
    parser explains nothing.
  - A 400 from the new route is **not** mapped to `NotFoundError`, the same opt-out the
    rename takes: that mapping means "no kagent on this installation" and is silent,
    which a refused message must not borrow.
  - `AWAITING_INPUT_STATES` moves to `kagentSessionState`, now that the timeline and the
    composer both need it.
  - Sandbox agents are out of scope: they need `/api/a2a-sandboxes/…`, require
    `contextId`, and 409 on a second session. Confirmed that the internal installation
    this was verified on runs none.

- cf61946: Serve dialog: serve a model as **copies on several nodes**. The Node field becomes a **Nodes** checklist. Tick one node for one copy there, several for one copy on each behind the same endpoint, or use "All N nodes that fit". With none ticked, one copy goes on a node that fits. Nodes a copy cannot land on stay listed, disabled, with the reason. Several ticked nodes are judged together by one `check_fit` ("Fits as 2 copies on A and B", or which node refuses and why), and Serve sends `placement: copies` with the `nodes`. The Serving list shows a model served as copies with every node in the Node column, marked "N copies". Needs model-manager with copies on several nodes (giantswarm/model-manager#194); an older one refuses several nodes with its reason.
- cb06b6c: The Serve dialog starts from the model. Its first field lists what can be
  served on the installation: every curated preset — "cached on <node>" when a
  cache directory holds its weights (model-manager's attribution, or the same
  Hugging Face repository), else "downloads from Hugging Face" — and the cache
  directories no preset claims. The preset is derived from the model; a cached
  entry serves from the cache under the directory's name, pinned to its node,
  with the directory's own source (`hf://<repository>` under the cache redirect
  policy, `pvc://<claim>/<dir>` otherwise or when the repository is not
  recorded) — never another model's `hf://`. A directory without a preset asks
  for one explicitly, warns that the recipe was written for another model and
  requires that to be acknowledged before serving, like the does-not-fit
  verdict. The separate Preset and Weights fields are gone.
- e80ae14: The Serve dialog's network notice follows the installation: when the chart's
  discovery document says it renders the serving namespace's network policies
  (`networkPolicy.enabled`, chart ≥ 0.13.0 with `global.networkPolicy`), the
  dialog says so and names the flavor instead of sending operators to write
  policies by hand that already exist; without the field, or with it disabled,
  it keeps the hand-written-policy guidance, no longer claiming the platform
  cannot ship them.
- 2c2d773: Serve dialog: a **Placement** choice where model-manager recommends one (model-manager's split placement) — "Split across A and B", one model tensor parallel over the nodes' fast link, or "One copy on A". The recommendation is preselected and marked; split is disabled with model-manager's reason when no fast-linked nodes host the model; the fit verdict is the chosen placement's ("Fits — split across A and B (fast link sparks)"), and Serve sends `placement` and `nodes` with `load_model`. The Serving list shows a split model's nodes in the Node column, marked "split". Nothing changes against a model-manager without placements.
- fe372f7: **Serve model** on an installation with model-manager goes through model-manager as the signed-in person. The dialog lists the presets model-manager publishes for the cluster (or, on a host backend, the cached models), shows `check_fit`'s verdict for the chosen preset before the button — whether it fits, the instance type the node comes as, whether the weights are cached, or the reason a preset no size of the pool hosts cannot be served — and serves with one `load_model` over muster: model-manager composes the serving object (an `LLMInferenceService` on a GPU pool), and the toast names it, the fit it was judged by and the first step of the timeline. The client-side `InferenceService` composition remains only for installations without model-manager. The Serving page opens the dialog on a pool when the route carries `serve=1&installation=…&cluster=…&pool=…`, installation, cluster and pool preselected.
- 2e38e0b: Models pages: a served model shows the APIs it answers. With model-manager
  1.1.0 or later, a Ready KServe model gets an **API** column with one chip per
  interface its server registered (Chat completions, Responses, Messages,
  count_tokens, Embeddings; the route on hover), and the runtime version appears
  next to the runtime name. On an installation with the platform's LLM endpoint
  (model-manager 1.2.0), the row shows the model's public name, and the copy
  action yields the endpoint's URL. The step timeline offers one copy-able
  request per interface, filled with the URL, the model name and the auth the
  endpoint checks.
- 6b1e119: Serving page: a served model's row opens its **step timeline** — model-manager 0.24.0's seven steps (predictor pod scheduled, GPU node started, weights in the cache, runtime image pulled, model loaded by vLLM, route ready, endpoint answers) with their state, when each began or how long it took, and what each usually takes; the weights step shows the bytes downloaded so far, then _cached_ or the size once done; a failure is a failed step with the reason (`ImagePullBackOff`, a stalled download, `Unschedulable`), never a bare _Pending_. The panel opens by itself after **Serve** and from a chevron on the row. At Ready it shows the endpoint, the wired ModelConfig and **Try it**, which sends one chat completion through the portal's backend twice — without a token and as the signed-in person — and shows both answers (401 without, 200 with). The inventory polls at 10 s while a served model is on its way or being deleted; **Unload** shows _Stopping_ until model-manager no longer lists the model, and the panel says so.
- 573c689: Compact per-backend layout for the served-models table on the Serving view.
  The table is grouped by installation (and backend), each group under a header
  carrying what every row of it shares — backend and runtime version, and the
  endpoint they all answer on with a copy action — and each group's columns
  follow its own rows: Node and GPUs appear only where a row is placed on a
  node (never from an installation's `nodeInventory` capability), Model only
  where the weights come from somewhere other than the served name, Runtime
  only where a group's rows run on more than one. Memory merged into the status
  cell (`Ready` / `5.4 GiB in memory · evicts 22:58`, `Available` / `Not
loaded`), size and model details moved under the name, features became chips
  for what matters to agents (tools, vision, thinking, embedding) with the
  tool-calling gap as a warning icon, and the Endpoint and Installation columns
  left the grid. An Ollama installation next to a KServe one now shows what it
  knows and no dashes for what it does not; KServe rows keep node, GPUs, preset
  and cache.
- 42f645b: The Serving page lists the running models first, then the ones that need
  attention, then the ones not running. Each backend's table opens sorted by
  Status in that order — Ready; Not serving, Not ready, Pending and Stopping;
  Idle (an agent on it still works, the first request loads it), Downloading
  and Available — with the name as the tiebreaker. It opened sorted by name,
  and a sort by Status followed the alphabet of the state words, so a broken
  model could sit between two available ones. A person opening the page now
  reads what works, then what to fix, then what could be served, and a host's
  many idle models never push the broken ones down; sorting by Status
  descending turns the order around.
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

- 27e64aa: Render files attached to a session's messages. A file part was dropped while the
  timeline was built, so an attachment showed nothing at all — not the image, not
  even a hint that something had been attached.

  An allowlisted raster image (PNG, JPEG, GIF, WebP) renders inline, scaled to fit,
  with its file name, the type its bytes carry and its size; pressing it opens the
  image at natural size in an in-page dialog. Anything else renders
  an inert chip: the name, the declared type, the size, and why there is no
  preview. An attachment is conversation rather than the agent's working, so the
  timeline's Hidden setting does not remove it, and a file the user attached sits
  on the user's side of the turn.

  **The bytes are untrusted input rendered in our own origin**, so the declared
  `mimeType` is never acted on. The checks run in order — no payload, a location
  rather than bytes, over the 8 MB cap by length alone, invalid base64 — and only
  then are the first 30 bytes decoded to derive the type from the magic bytes and
  read the dimensions, so a large image is never fully decoded just to classify
  it. An image declaring more than 50 megapixels is not previewed: the byte cap
  does not bound what the browser allocates to decode it. Unpadded, URL-safe and
  line-wrapped base64 are read as the same bytes. The `data:` URL carries the
  **sniffed** type, never the declared one.

  **An SVG is never previewed**, including one that declares itself `image/png`. It
  would not run script in an `<img src="data:…">` — browsers load it in a
  non-scripting mode — so this is defence in depth against a later switch to inline
  `<svg>`, `<object>` or open-in-a-new-tab, and it keeps SVG's XML-entity and
  filter denial-of-service surface out of the page. There is no download link for a
  file with no preview: handing untrusted bytes to disk moves the risk to wherever
  they are opened next. The bytes never pass through the markdown renderer.

  A file that arrives on the live stream re-reads the conversation at once, so it
  shows up mid-turn rather than with the next poll.

  A file kagent only linked to is described, not fetched — the portal would
  otherwise make a request on the reader's behalf to a host named by whoever sent
  the message.

  No CSP change is needed: `img-src` already carries `data:`. A deployment that
  overrides `img-src` must re-list it, since Backstage replaces config arrays
  rather than merging them.

- 2b79a0c: The session view's chat works like a chat app's. The composer, its caption and
  the cost chip are docked to the bottom of the view — at the bottom from the
  first message on, staying put while the conversation scrolls behind them, and
  above the shell's bottom bar at phone width. An agent's question or permission
  request is answered in a compact card attached to the composer, directly above
  the box: it prints the question, pages several questions one at a time
  ("Question 1 of N", sent together from the last page), and keeps its height to
  about half the view; the conversation keeps the record of what was asked and
  answered. Every run of tool calls now folds under its summary, a single call
  included — "Used 1 tool", "Loaded 1 skill" or "Asked 1 agent" opens onto a list
  of one, and a row onto its details, exactly as the multi-call case does.
- befc0c2: Add the session detail page. Clicking a row in the Sessions list now opens
  `/agent-platform/sessions/<installation>/<id>`, showing what the session was, how it
  ended, and what the agent actually did.

  **Read-only.** kagent can rename, delete and continue a session, and the prototype
  offers all three — none are wired up, so this ships without a write path.

  The page has three parts:

  - **Header** — title, status badge, agent (name and avatar, resolved through the
    same `Agent` CR join the list uses), installation, and started/last-activity. The
    session id is deliberately not shown: it is a 64-character opaque string that
    told the reader nothing, and it is already in the URL for anyone who needs it.
  - **Stats** — turns, wall-clock duration, and input/output tokens.
  - **Timeline** — the conversation, with the agent's internal work collapsible behind
    a Details control. Collapsed by default: the working is the point of the screen,
    but a wall of tool payloads is unreadable.

  Timeline entries cover user and agent messages (as markdown), reasoning, tool calls
  with their arguments and results folded into one entry, delegations to other agents
  with the child's own token usage, and approval requests with the user's verdict.
  Approvals are deliberately not governed by the activity control — an approval records
  the _user's_ decision, so hiding it would erase the trace of their own action rather
  than the agent's working.

  Decisions worth knowing:

  - **Timestamps are per turn, not per item.** A2A messages carry no time of their own
    and kagent's stored events cannot be correlated with them (they are ADK events with
    no `messageId`), so a task's timestamp is the finest granularity that exists. The
    timeline shows it once per turn rather than repeating it on every entry, which
    would imply precision we do not have.
  - **Input tokens are labelled "billed, cumulative"** because the raw number is
    startling: every model call re-sends the whole context, so a 4-turn session with a
    large tool catalogue reached 1.4M prompt tokens across 14 calls. Genuine billed
    usage — kagent's own UI sums it identically — but unlabelled it reads as a bug.
    There is deliberately **no combined total**: input and output are priced
    differently, so their sum is not a number anyone acts on.
  - **Duration is wall-clock** (`updated_at − created_at`), since kagent records no
    per-turn durations — it includes however long the user was away between turns.
  - **Timestamps here are absolute** (`28 Jul 2026, 10:07 UTC`), unlike the list.
    Both ends of a session usually fall on the same day, so the relative form read
    "Started 1 day ago · last activity 1 day ago" for a session that took three
    minutes, and printed "1 day ago" identically on every turn marker — hiding the
    progression the timeline exists to show.
  - **Calls through Muster are unwrapped.** Agents reach most MCP tools via muster's
    `call_tool`, so untreated every row reads `call_tool` with the real tool buried in
    the arguments (giantswarm/klaus-gateway#163). Rows now name the tool actually
    invoked and carry a `via Muster` badge; on a real session that unwrapped 7 of 17
    calls. A `call_tool` payload that stops matching the wrapper shape degrades to
    showing the proxy rather than being lost.
  - **A missing session is a not-found state, not an error.** kagent answers 404 for
    deleted, never-existed and belonging-to-someone-else alike, and none of those is a
    fault worth an error alert.
  - **Rows link with a real anchor** in the title cell as well as a whole-row click, so
    cmd- and middle-click open a new tab and keyboard users have something focusable.
    Not `rowConfig.getHref`: `BUIProvider` is not mounted in this app, so react-aria's
    `RouterProvider` is inactive and a bui `href` would trigger a full page reload.
  - **`session` and `session-tasks` queries are excluded from `localStorage`**, for two
    independent reasons — a conversation is user-scoped data that must not outlive
    sign-out on disk, and at ~500 KB per session it would evict the fleet lists the
    persistence exists for.

  What the page cannot show, because kagent stores none of it: cost, tokens/second,
  context-window usage, the owning team, the trigger that started the session, a linked
  work item, produced results, and evaluation. Delegation entries are inert, since the
  response does not reliably carry the child session's id.

  The Sessions tab's content is now a `SessionsRouter`, which hoists the query client
  and the fleet-wide `Agent` list above both screens so opening a session reuses what
  the list already loaded.

- aa77803: Make the session detail page refresh itself. It read the session and its
  conversation once at mount and never again, so someone watching an agent work saw a
  frozen page until they navigated away and back. Both reads now poll, on the two-tier
  shape the agent views already use — but with different constants, and each deviation
  is deliberate.

  **The two reads poll at different cadences.** The conversation goes to 10 s while the
  newest task is in an active A2A state and recent, and 60 s otherwise. The session
  object stays on a flat 60 s: it is title, agent and timestamps, none of which move
  while an agent works, so it polls only so a session renamed or deleted elsewhere
  stops looking current. The visible cost is that "last activity" and the duration stat
  can trail the timeline by a minute during an active run; both render as absolute
  timestamps, so that reads as older rather than as wrong.

  **A terminal session relaxes to the baseline rather than stopping.** The tempting
  alternative — return `false` and stop, as muster's workflow page does for a finished
  execution — is wrong here, because a kagent session is not finished in the same
  sense: it can be continued, renamed or deleted from another client. Stopping would
  freeze the page for exactly the case this change exists to fix. 60 s equals the query
  client's `staleTime`, so nothing is refetched that the client still considers fresh.

  **The fast tier is 10 s, not the agents' 5 s, and the age bound is 5 minutes against
  their 3.** The agents' constants move a small Kubernetes object on a controller
  reconcile cadence. This one moves the whole conversation — a real four-turn session
  measured ~500 KB, re-parsed row by row through `a2aTaskWireSchema` and then
  deep-compared, all on the main thread — and it tracks an agent _turn_, which
  routinely runs minutes when there are many tool calls. A 3-minute bound would have
  backed off in the middle of exactly the run someone opened the page to watch.

  **`input-required` and `auth-required` are handled by that bound, not by a special
  case.** They are active states, but they wait on a human and this page offers no way
  to reply. They start fast, relax once nobody answers inside the window, and re-engage
  on their own when someone answers elsewhere and the newest task's timestamp advances.

  **There is no cheaper probe, which is why the interval carries the whole cost.**
  kagent's API serves no `HEAD` — every route is registered for one method on a
  gorilla/mux router, which matches methods exactly — and sets no `ETag` or
  `Last-Modified`, so there is no conditional GET and a full re-read is the only way to
  ask whether anything changed. The session object's `updated_at` tracks task-status
  writes to the millisecond and could gate the expensive read later, but only once
  somebody confirms kagent bumps it per appended event rather than only on state
  transitions; if it is the latter, a gated design would show nothing for the whole
  duration of a turn.

  **One non-obvious thing that made the simple design viable.** An unchanged poll costs
  no re-render at all: react-query's structural sharing returns the previous reference
  when the refetched payload is deep-equal, and `normalizeTaskList` yields plain
  objects out of zod, so the `useMemo`s that rebuild the timeline never re-run. No
  `select`, memoisation or content hashing was needed.

  **The age bound applies on every path, including the one where it is most needed.**
  `status.timestamp` is optional at the parse boundary, and `normalizeTimestamp` also
  rejects Go zero time and anything unparseable — so an active task can carry no usable
  time of its own. Treating that as "just changed" (which is what `isAgentConverging`
  does, safely, because a Kubernetes object always has `lastTransitionTime`) would make
  the fast tier _unbounded_ on exactly the case the bound exists for: an agent that died
  mid-turn. The interval falls back to the newest usable timestamp anywhere in the
  conversation, and drops to the baseline when nothing in it carries one — losing the
  "state and timestamp from the same task" property on purpose, because an age basis
  that exists beats a fast tier nothing can stop.

  **Polling also made an existing condition wrong, so that is fixed here too.** The
  page treated any error as fatal. react-query keeps `data` and sets `error` on a
  failed _refetch_, and the query client deliberately does not retry
  `ServiceUnavailable`/`Unauthorized`/`Forbidden` — so with polling, one proxy hiccup
  would have replaced a fully rendered conversation with a danger alert until the next
  successful poll. The fatal branch is now gated on having no session at all, and an
  error with one in hand shows a warning notice above the page instead. A local `Alert`
  rather than the shared `ErrorsProvider` notice the agent detail page uses, because
  the sessions router mounts no `ErrorsProvider` and adding one would mean splitting
  this page into wrapper and content for a one-line message.

  Keeping the page up needed three further distinctions, because the two reads fail
  independently. A tasks read that fails on **first** load leaves the timeline, turns
  and tokens at zero while the session read succeeds, so the hook now reports
  `hasConversation` and the page keeps the fatal branch when the conversation is
  _absent_ rather than empty. A poll answering 200 with no readable session no longer
  claims the session was deleted once one has already been read — and the query function
  coerces that case to `null`, because react-query rejects an `undefined` resolve, which
  was surfacing `[…query key…] data is undefined` to the user and had quietly made the
  `isSuccess && !data` branch unreachable. And a delete in flight now disables both
  reads (`enabled: !isDeleting && !isDeleted`): `refetchType: 'none'` governs
  invalidation-driven refetches only, so it never held off a scheduled interval tick
  landing mid-navigation.

  Manual refresh is deliberately still absent. Staleness is capped at 60 s now, and the
  control would have to live in the page header, which renders outside this plugin's
  `QueryClientProvider` — so it needs new fields on `SessionDetailView` threaded
  through the memo whose whole purpose is to stop the header slot re-registering on
  every poll. That is a bigger change than the polling it would accompany.

- 57df63e: The session page's actions menu has **Export session**: it saves the session
  and all of its tasks, as kagent stores them, as one JSON file, also mid-turn
  and while the session waits on the person. A session the portal
  cannot read whole (up to 1,000 turns, fewer with large messages) saves no file
  and points to agent-manager's `get_session`. The format is described in
  `docs/agent-platform-session-export.md`; a saved export is counted as
  `AgentPlatform.sessionExported`.

  The backend's session tasks route keeps the `nextPageToken` it did not follow
  when its read was cut short. `ui-react` exports `saveFile`, which the manifest
  Download and muster's tool-result download now share; it keeps the file's URL
  until the browser has taken it.

- 2aaf08d: Let a session be renamed from its detail page. Two ways in: a `Rename session…` item
  in the kebab, and the page title itself — a real button stripped of its chrome rather
  than a click handler on the heading, so it is keyboard-reachable and announced as
  operable. Both open the same dialog, which is why its open state sits on the page and
  not inside the actions menu the way the delete's does.

  Worth having because kagent derives session titles from the first message and
  truncates them to 20 characters, so a session that mattered ends up filed under half a
  sentence.

  **kagent's rename endpoint does not rename on the version the fleet runs**, and this
  is what shapes the implementation. `PUT /api/sessions/{session_id}` is registered on
  v0.9.x, but its handler requires both `name` and `agent_ref`, looks the session up by
  `*sessionRequest.Name` — treating the new name as the id — and assigns only
  `session.AgentID`. `session.Name` is never written. It was fixed in v0.10.0-rc1; GS
  pins 0.9.9, so on every installation we run today the correct endpoint is inert.

  The write therefore falls back to `POST /api/sessions` with the existing `id`, whose
  `StoreSession` is an upsert on `(id, user_id)` that does write `name` — identical SQL
  in v0.9.9 and v0.10.0-rc1. Echoing the session's own `agent_id` back as `agent_ref`
  round-trips exactly, since kagent's `ConvertToPythonIdentifier` only rewrites `-` and
  `/`, neither of which survives in an already-encoded id.

  **Only a 400 enters that fallback, and it means "this kagent predates the fix" —
  nothing more.** The PUT's status says nothing about whether the session exists:
  v0.9.x rejects the missing `agent_ref` _before_ it looks anything up, so a live
  session and a deleted one both answer 400, and the 404 that would separate them is
  reachable only on v0.10+. Everything else (401, 403, 404, 5xx) is surfaced as the
  failure it is.

  **A read-back, not the status, is what enforces "never create".** Before writing, the
  fallback fetches the session and gives up if it is gone — otherwise the upsert, which
  inserts when nothing conflicts, would resurrect a session someone had just deleted
  under its old id. That read also makes the echoed `agent_id`/`source` authoritative:
  they are overwritten by the write, so they come from kagent rather than from the
  browser, where a stale or unparsed value would blank a column nobody asked to touch.

  Every remaining way the fallback can fail, it fails before writing, and each is a
  **4xx** rather than a server error: the session is gone (404), it has no agent (409),
  kagent cannot resolve that agent (409), or a sandbox-workload agent already holds a
  session (409). None is actionable, and on a fleet where every installation takes this
  branch a 5xx would mean a standing Sentry issue per case.

  All of the fallback is marked `TODO(kagent-0.9)` and comes out when no installation
  runs kagent v0.9.x, leaving the plain PUT.

  Smaller decisions:

  - The title carries a "Rename session" tooltip: the hover underline says "this does
    something" but not what, and everything else on the page is inert text.
  - The invalidations **refetch**, unlike the delete's `refetchType: 'none'` — nothing
    navigates away, so the page has to show the new name. Both are awaited inside the
    mutation, so the dialog closes onto data that has caught up rather than onto the old
    title.
  - The name is trimmed, required, and capped at 255 characters. That bound is ours, not
    kagent's (`session.name` is unbounded `TEXT`), and the backend route enforces it as
    well as the dialog — a `maxLength` on an input is a courtesy, not a guard.
  - Confirming does not close the dialog: a rename can fail, and closing on submit would
    throw away the only surface left to report it. Nor can it be dismissed while the
    request is in flight — including via the close button bui's `DialogHeader` always
    renders, which `isDismissable` does not reach. Closing there would leave the mutation
    running with nowhere to report a failure.
  - The dialog seeds its field on the open transition only, never on a `title` change:
    the session read polls, so re-seeding would wipe an edit in progress when the
    session is renamed in another tab.
  - `updated_at` does move, so a renamed session rises to the top of the list — correct
    for an edit.

  `agent-platform-backend` gains a `PUT /kagent/sessions/:sessionId` route (user token
  required, same reasoning as the delete: without one an `unsecure` controller would
  rename the shared default user's session), and its kagent client learns to send
  request bodies. The route takes only the name — the workaround's inputs come from
  kagent, not from the caller.

  On the frontend, `throwIfNotOk`'s 400 → `NotFoundError` mapping is now opt-out. That
  mapping exists because a 400 from this proxy meant "no kagent endpoint for this
  installation", which the reads treat as silent; the rename route also answers 400 for
  a name it refuses, which must not borrow the one name the plugin reads as "kagent is
  absent".

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

- e5a5106: Parse kagent session tasks into a renderable timeline. Groundwork for the session
  detail page — no visible change yet.

  A session is a list of A2A **tasks** (turns), each holding a `history` of
  **messages**, each holding **parts**. kagent discriminates a part's meaning via
  prefixed keys in its `metadata` rather than by wire type, so the new
  `lib/kagentParts.ts` holds those predicates and `lib/kagentTimeline.ts` turns the
  nesting into a flat list of items: user and agent messages, reasoning, tool calls,
  delegations to other agents, and approval requests.

  Decisions worth knowing:

  - **Metadata is read `adk_<key>` first, then `kagent_<key>`.** That is kagent's
    own interop mechanism (`getMetadataValue` in its UI), not a guess: upstream ADK
    writes one prefix, kagent writes the other, and a single session can contain
    both. One helper spells the prefixes out; nothing else does.
  - **A tool call and its result are one item.** The `function_response` is folded
    into the `function_call` it answers, matched on the call id — collapsed shows
    the tool and arguments, expanded adds the result. Open calls are scoped per
    task, so a repeated tool can't have a result attached to the wrong call. An
    orphan response still renders rather than being dropped.
  - **Delegations are their own kind.** They look like tool calls on the wire (the
    tell is `__NS__` in the tool name), but a subagent runs in its own session, so
    its messages never appear here and the response is the only place its token
    usage shows up. That usage is counted once toward the session total, keyed on the
    call rather than the response, since responses don't always repeat the name.
  - **Text parts are walked in order and merged only within a run of the same
    kind.** kagent can put reasoning, prose and tool calls in one message, and the
    order is the only record of what happened when.
  - **An unrecognised approval verdict leaves the verdict unset** rather than
    defaulting to "approved" — the message is still recognised as a decision, but
    guessing would claim consent to an action the user may have refused.
  - **Session state comes from the _last_ task** (kagent returns them
    `ORDER BY created_at ASC`), since an earlier turn having completed says nothing
    about whether the session is working now. An unknown A2A state renders as
    itself and is treated as inactive, so it can't produce a spinner that never
    resolves. No tasks at all is its own condition, not flattened into a state.
  - **Every item takes its task's timestamp**, so items within a turn deliberately
    share one. A2A messages carry no time of their own, and there is no finer
    source — see below.

  Nothing in this layer throws. Malformed tasks, messages and parts are skipped
  individually and counted, so one bad row costs that row rather than the page.

  ### Validated against a real payload

  The parsers were run against a live session on an internal installation (4 tasks, 32
  messages, 12 tool calls) before this landed. It produced 29 items with no drift and no
  skipped rows, and corrected three things:

  - **Per-message timestamps are not obtainable, so that code is gone.** kagent's
    Go type says `Data string // JSON-serialized protocol.Message`, which implied
    the session's stored events could supply them. They cannot: the decoded value is
    an **ADK event** (`author`, `content`, `invocation_id`, `partial`, `timestamp`,
    …) with no `messageId` anywhere, so there is nothing to join task history
    against — 36 events yielded zero usable ids. `invocation_id` does correlate, but
    only per turn, which the task's own timestamp already gives.
  - **kagent repeats each user message verbatim under the same `messageId`**, on
    every turn. The session-wide dedupe turns out to be load-bearing on real data
    rather than defensive: without it every turn would open by saying the same thing
    twice.
  - **One message can carry prose and several tool calls**, always text first
    (observed `text -> data(function_call) -> data(function_call)`). Walking parts in
    order and merging only runs of same-kind text is what keeps the agent's
    narration ahead of the calls it introduces.

  Fixtures are hand-authored but now structurally faithful to the above. The real
  payload is deliberately **not** committed: a `/tasks` body is the full
  conversation, including tool arguments and results, which is not ours to put in
  this repo. `tasks.adk-prefixed.json` is generated from `tasks.v0-9-9.json` by
  swapping only the metadata key prefix, so the two cannot drift apart in any other
  dimension — which is precisely what the prefix test asserts.

- 2b79a0c: Rework the session view per product feedback.

  - **Platform-standard header.** Inside the agent-platform shell the session
    page now uses the same `ShellPage` frame as All Sessions and Customize: a
    breadcrumb reading "Sessions / Session" and the session's name as the h1 at
    the standard title scale, with the state badge, agent and installation
    beside it. The in-content title (which doubled the shell's "Sessions"
    header at an odd size and position) is gone; classic chrome keeps its own
    layout.
  - **Cost chip in the composer.** The cost/memory chip moved from the page
    header into the composer's controls, next to Send — always on screen with
    the docked box, as in the design. Its popover opens upward, drops the
    Agent row (the page is already that agent's session) and keeps a single
    explanatory sentence: the estimate's basis.
  - **Share UI removed for now.** The portal has no way to open a shared
    session, so the Share button, dialog, hooks and client surface are gone,
    along with the `AgentPlatform.sessionShared` telemetry event. The backend's
    share routes stay for kagent-compatible clients and a future UI.

- 2b79a0c: Bring the active chat session view to the Agent Platform prototype:

  - The tool-call trace now defaults to a plain, readable register — each tool
    call as what it did, via which connector, and its status — with a single
    "Show technical details" toggle (remembered per user) that reveals the exact
    tool names, arguments and results as collapsible payloads.
  - The HITL pending confirmation is restyled as the prototype's in-chat
    permission card: who asks, which tool would run (proxied calls unwrapped to
    the real tool and connector), the exact arguments Allow would run, the
    "Changes things" accent, and Allow/Decline buttons.
  - The stats strip is replaced by a cost + memory chip in the session header,
    opening a popover with the estimated cost (labeled, with its basis),
    the runtime-reported cost where present, token totals, turns, and
    context-window usage. Window sizes come from the new app-config table
    `agentPlatform.models.contextWindows` ({ modelPattern: tokens }); a model the
    table does not name shows its raw token count. Costs show in the
    installation's configured currency, USD otherwise.

- b5f7aa4: A session started in a workspace shows it: the session's header has a chip
  with the workspace's name, its last sync and how many repositories were
  fetched fresh at the start. The chip opens a drawer with a link to the
  workspace, the repositories fetched before the first turn, the workspace's
  repositories, this session's directory with its size and cleanup date, and
  the provider you act as in it. The Sessions list gains a Workspace column and
  the session rail names the workspace beside the agent. A workspace you can no
  longer see shows unnamed; a session without one looks as before. The backend
  relays a Session's workspace volume, fetched repositories and providers from
  kagent, whose API it now speaks at kagent-upstream v1.22.2.
- 335f7fe: The Sessions tab no longer splits the list into one section per installation
  under "All installations". Every installation in scope got a heading and a
  status line of its own — "no sessions here" for the many that have none — so
  the sessions themselves were pushed down the page and spread over several
  small tables that could not be sorted or scanned together.

  The tab is now one flat table under every scope, the same table a pinned
  installation and a single-installation portal already showed. The
  **Installation** column tells the rows apart, and the table's own sort —
  last activity, newest first — puts the conversation you were just in at the
  top whichever installation it ran on. An installation without sessions
  simply has no row, and one that could not be read is still called out in the
  warning card below the table. The per-page search field is gone with the
  groups: the table's own field is the one place to type.

  This is the same flattening the Agents tab already had. The Models tab keeps
  its per-installation groups.

- 328ebcb: Show each session's state in the sessions list, as a sortable **State** column on
  the Sessions tab and on an agent's sessions card.

  It reads the backend's existing `GET /kagent/session-states` summary — the one
  the session switcher rail already groups by — under the same query key, so a list
  and a session page open together share one read per installation. The summary is
  asked only of the installations the list actually shows a row from, and on the
  baseline 60 s tier rather than the rail's 10 s: the rail watches one installation
  for a turn moving, while the list spans the fleet and nobody reads a list column
  for progress.

  The wording and the tone come from `describeSessionState`, the map the session
  page's badge and the rail's groups already use, so one session cannot be called
  two things on two screens.

  **A cell is never blank.** The three ways a state can be missing are different
  facts and a person acts differently on each: `No activity yet` for a session that
  reported no state at all, `Unknown` for one the backend could not read — and for
  every row of an installation whose whole summary failed — and a dash whose
  tooltip says nothing asked, because the session is past the summary's activity
  window or its per-pass cap. Collapsing them would let "we could not tell" read as
  "nothing is waiting on you".

  Sorting the column is by urgency, not by label: waiting, running, failed,
  finished, then the kinds of no-answer, each newest first. Alphabetically
  `Completed` sorts above `Waiting for input`, which inverts the only reason to
  sort by state.

- 2b79a0c: Sessions grow pinning and a notification bell in the agent-platform shell.

  **Rail session history**: the rail's recent-sessions list now leads with a
  "Pinned" group (pin/unpin on each row's hover affordance, persisted per user
  via the storage API, so pins roam with the user-settings backend), groups the
  rest under "Today" / "Previous 7 days" / "Earlier" like the prototype, and
  polls the derived session states on the fast tier so the "Needs you" pill and
  the "Working" dot move within ~10 s while the tab is visible.

  **Sessions page (shell layout)**: each row gets a pin toggle beside its
  actions menu; pinned sessions surface in a leading "Pinned" group ahead of the
  day groups, and a "Pinned" filter chip appears beside the state chips once
  something is pinned.

  **Notification bell** (`SessionNotificationsBell`, mounted in the shell rail's
  footer and the mobile bar): an unread badge counting the sessions waiting for
  input, and a ~400 px panel (responsive at 375 px) listing them — each row
  links to its session, with per-session mute and mark-read/unread and a "Mark
  all read". Mute and read markers persist per user in the `agent-platform`
  storage bucket under `sessionNotifications` (new hook
  `useSessionNotifications`). Poll-based only — the platform has no push path
  yet (gap G5), so desktop/web-push notifications are deliberately absent.

- 335f7fe: Sessions is now the first tab of the Agent Platform section, ahead of Agents.

  The section is opened to pick a conversation back up far more often than to
  look over the fleet's agents, so Sessions is what it now opens on: the first
  tab is also what a bare `/agent-platform` lands on.

- 7715042: Add a "Sessions" tab to the Agent Platform section
  (`/agent-platform/sessions`), listing the signed-in user's kagent chat sessions
  across the fleet.

  - Read-only bui table — Session, Agent (display name + avatar), Installation,
    Started, Last activity — with client-side search across title, agent and
    installation, sortable columns, and pagination. Timestamps render as relative
    dates via `ui-react`'s `DateComponent`, with a dash where kagent reports none.
  - Agent names and avatars are resolved by matching kagent's `agent_id` against the
    `Agent` CRs the plugin already loads. The match is done on the **encode** side
    (`ns/name` → `ns__NS__name` with `-` → `_`), because kagent's encoding is
    lossless while decoding is not; a decoded label is only a display fallback, and
    a genuine encode collision resolves deterministically.
  - **Fleet-aware**, like the Agents tab: reachable installations are narrowed
    first, then intersected with the backend's kagent allowlist — and the session
    queries **wait** for that allowlist, since kagent runs on only a couple of
    installations and querying the rest would fire a doomed request per
    installation, each minting that installation's Dex token first. One cached call
    is cheaper than N wasted ones. If the allowlist itself fails we fall back to the
    reachable set, so a backend hiccup doesn't look like an empty list.
  - Each installation loads independently: rows appear as soon as the first
    installation answers, further loading shows as a thin bar rather than blanking
    the table, and `404`/`503` ("kagent isn't deployed here" — the common case
    fleet-wide) stays silent while anything else is surfaced.
  - Warns when an installation's kagent is **not scoped to the signed-in user**
    (`unsecure` auth mode resolves every caller to a shared built-in user, so the
    list would silently not be the user's own). Only an explicit negative triggers
    the warning: an unresolved or subject-less probe means "unknown" and stays
    quiet, so a healthy installation whose IdP omits `sub` isn't flagged.
  - Reports as its own page in telemetry, ahead of the generic `/agent-platform`
    cases which would otherwise label it "Agents".

  Scope is deliberately reduced against the prototype: a kagent `Session` has 7
  fields, so status, trigger, duration, cost, tokens, team, linked task, results and
  evaluation — plus the summary stat band derived from them — have no backing data.
  kagent also lists sessions with `WHERE user_id = <sub>` and exposes no cross-user
  endpoint, so the prototype's Mine/Watched/All scopes reduce to one implicit scope.
  Session detail, delete and rename are deferred.

- 2b79a0c: `page:agent-platform` is enabled by default. Its `if: AGENT_SHELL_ON` already
  mounts it only where the agent shell is on, so `app.portals.agentPlatform`
  alone switches the Agent Platform on; `page:agent-platform: false` in
  `app.extensions` still turns it off. Classic-only deployments are unchanged.

  The classic-chrome variants the shell-only Agent Platform left unreachable are
  removed:

  - **agent-platform:** the classic Agents and Model configs lists, the
    classic agent page's header, Tools/Skills tabs and cards, the session
    switcher rail, the classic sessions table and its chips, the
    `installation-scope` header action (`InstallationScopeHeaderControl`) and
    `ShellAwareContent`. The internal `useAgentShell` hook is gone;
    `AGENT_SHELL_FLAG` is still exported.
  - **muster:** the classic MCP servers list, server page, workflow list and
    detail pages, the four-step registration wizard and the classic tool page
    body. **Removed export:** `useAgentShell`, which was always true wherever
    muster renders; read `isAgentShellOn` from
    `@giantswarm/backstage-plugin-agent-platform-common` instead.

- 2b79a0c: The Agent Platform lives in the agent shell only. Its pages (`page:agent-platform`
  with its sections, muster's Connectors and Workflows among them,
  `page:agent-platform/skills`, `page:agent-platform/profile` and muster's
  `/agent-platform/mcp-servers` redirect) carry the new `AGENT_SHELL_ON`
  extension predicate from `agent-platform-common`, so they are mounted only
  where the shell is available (`app.portals.agentPlatform`, or a person's
  `agent-platform-shell` opt-in).

  - **Agent Platform off** (`app.portals.agentPlatform` unset or `false`): the
    classic portal has nothing of the Agent Platform — no sidebar item, no
    `/agent-platform/**` route, no classic-chrome Agent Platform page — even
    where `app.extensions` lists `page:agent-platform`. Deployments that used
    the classic-chrome Agent Platform section lose it by design.
  - **Agent Platform on**: `/agent-platform/**` always renders in the shell; the
    classic sidebar carries only an **Agent Platform** link to `/agent-platform`
    (a new tab while the classic portal is served), and the shell's **Platform
    Portal** item links back.

  The classic-chrome rendering of `page:agent-platform` (its header and tab
  strip) is gone. Create cluster and Delete cluster on the classic Clusters
  pages are unchanged.

- 2b79a0c: Add the `skillCreation` meta-agent role (`agentPlatform.metaAgents.skillCreation`) for the skill creator agent, which writes complex, nested skills in conversation.

  - Add Skill and Edit Skill show a strip above the form where the role resolves to an agent that can take a session: "Use this form for simple skills", the skill creator agent for more complex, nested skills, and **Let <agent> help**. The strip is the one the create-agent flow's "Let Swarm Operator help" uses, now a shared `MetaAgentBanner`. Pressing it starts a session with the agent and opens it. The first message names the target repository and what was typed so far, or the skill being edited (repository, SKILL.md path, commit, branch). It asks the agent to ask about the skill's purpose before writing and to propose the skill as a pull request. Where the role is unconfigured or names no startable agent, nothing shows. The forms themselves stay SKILL.md-only.
  - `agent-platform-common`: `skillCreation` joins `META_AGENT_ROLES`.
  - `analytics-react`: `AgentPlatform.sessionStarted` gains the `skillCreationAssist` entry point.

- 2b79a0c: Skills can be edited through the same pull-request flow that adds them. A skill's page gains **Edit**, which opens the add-skill form at `/agent-platform/skills/edit/<owner>/<repo>[/<skill dir>]`. The form is prefilled with the skill's current SKILL.md, read at the commit the catalog pinned it to. The repository and name are fixed, and submitting waits for an actual change. It opens a pull request that rewrites `<dir>/SKILL.md` on `update-skill/<name>`, authored as the signed-in person. The success screen matches adding a skill: the opened pull request, its link, and that a teammate approves it.

  gs-backend: the new `GET /agent-skills/content` returns a skill's frontmatter `name`/`description` and its body at a commit, for configured `agentPlatform.skills.repositories` only. github.com repositories are read through the contents API. Any other git repository is read from the depth-1 clone that discovery makes, and answers 409 when its branch moved on from that commit. `POST /agent-skills/pull-request` accepts `kind: 'update'` with the skill's `path` (and optionally `baseCommit`). An update writes the existing file with its blob sha and keeps the frontmatter keys the form does not show. It refuses with 404 when the file is gone, 422 when the edit changes nothing, and 409 only when the branch already exists.

  The portal event `AgentPlatform.skillProposed` gains the attribute `kind` (`created`, `updated`).

- 2b79a0c: A skill's detail page shows all of its files, not only SKILL.md. On the Instructions tab, a skill with more files than its SKILL.md gets a file tree next to a viewer. On a phone, the tree folds into a "Files (N)" section above the viewer. The viewer renders Markdown with the same sanitising renderer as the instructions, shows code, YAML, JSON and scripts in monospace, and previews CSV/TSV files as a table capped at 50 rows. Binary files and files over 512 KB link to the file on GitHub at the pinned commit; outside github.com the viewer gives their path and size. The selected file is part of the page address (`?file=`). Relative links in a rendered file, and backticked paths that exactly name one of the skill's files, open that file in the viewer. Paths outside the skill keep their GitHub links. A listing cut at 200 files says so. The header adds "· N more files". Single-file skills look the same as before.
- 2b79a0c: Skill detail: **Update agents** moves the agents that pin a skill at an older commit than the catalog's head to the newest one. The secondary header action appears only while some agent is behind. It opens a dialog listing those agents with their old → new commits, all selected by default; the person can update all of them or only some. Each selected agent runs Agent detail's "Update skills" (`update_agent` with `refreshSkills`, reported as `AgentPlatform.agentUpdated` with `change: skillsRefreshed`). An agent applied from git gets a pull request in its GitOps repository where agent-manager can commit, and the dialog says so. An agent the person cannot update (no agent-manager, a muster session to connect, no pull-request capability, or no permission to update its HelmRelease) is listed disabled with the reason. The dialog says that the refresh re-pins every git skill of an agent, and after confirming it shows each agent's outcome, linking any pull request it opened. The Used by tab marks the agents on an older version and, with none behind, says "All agents use the newest version".
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

- 6ce4a71: Move skill selection out of the "Create an agent" form and into its own step
  (`/agent-platform/agents/new/skills`, between Details and Review). As
  configured skill repositories grow — one already holds 100+ skills across many
  plugins — a single flat grid of cards on the create form no longer scales.

  The new step groups skills by repository, then by subfolder (e.g. `claude-code`'s
  per-plugin `skills/` directories), and adds a search field that matches on
  name, description, and path. Repos or skills with no meaningful subfolder
  render flush, without a synthetic "General" heading.

  Search filters _within_ the grouping rather than replacing it with a flat list:
  which repo and subfolder a skill came from is part of what identifies it, so
  results keep that context, and the page doesn't relayout on the first
  keystroke. Repos and subgroups with no matches simply don't appear.

  The step also shows how many skills are currently selected (a search can hide
  every selected card), and the review page's summary now names them, so the
  step's output is visible outside the values YAML.

  Each step shows a "Step X of N" label. When no skill repositories are configured
  the step is skipped entirely — Continue goes straight from Details to Review and
  the flow is a 2-step flow — rather than showing an empty page whose only advice
  is app-config the agent's creator usually can't change.

  The "Create an agent" page's Configuration card no longer includes the skill
  picker field; it now warms the skill-discovery query in the background instead,
  so the skills step usually opens with its catalogue already loaded.

- 2b79a0c: Add the "Use your agents right in Slack" banner to the new-session home, shown
  only where a platform admin enables it with the new app-config key
  `agentPlatform.integrations.slack: true` (off by default; an unconfigured portal
  renders and reads nothing). Each person can dismiss it for good; the dismissal
  is stored in their user settings. The gs-backend signed-in config now passes
  `agentPlatform.integrations.slack` to the browser.
- 2c4e7eb: The session page no longer goes silent on a turn that never lands.

  A turn that outlived the send's transport and then stalled — on the kagent API
  v2 line, an answer's turn cancelled at the caller's 30 s deadline and left
  `submitted` with no later event — used to drop the page to an empty, enabled
  composer once the "Working…" indicator's age bound expired, while kagent still
  refused every new message as a conflict with the active task. Now:

  - The newest `submitted`/`working` task keeps the "Working…" row; once its
    timestamp has not advanced for the 5-minute bound the row becomes **stalled**
    ("The agent has not reported progress since HH:MM") with a _Cancel the turn_
    action. Cancelling ends the turn server-side and puts the message that turn
    never answered back into the composer as a draft, so it can be sent again. The
    composer's Send stays withheld while the task is active and its caption says
    why; the page never falls back to an idle composer over a busy session.
  - A send refused with a 409 renders "This session is still working on the
    previous turn" with the same _Cancel the turn_ action, instead of a generic
    "Message not sent".
  - Answering a confirmation streams the resumed turn (`…/answer/stream`,
    `SendStreamingMessage`) like a message does: the answer panel gives way to
    the working composer on the stream's first event, the agent's reaction
    previews live, a cut stream is visible as such, and no deadline of the
    portal's bounds the agent's turn. The message and answer paths share one
    stream fold (`useStreamedTurn`).

- 9eab10f: Every session starts through agent-manager's `start_session`, called through
  muster as the signed-in person (`AgentManagerClient.startSession`), on every
  entry point: the sessions list, the agent page, the session page, the command
  palette, the meta-agent hand-offs and the create-agent assist. It is the one
  place where an agent and, optionally, a workspace grant meet, so no surface
  can skip a workspace's access check. The portal sends no grant yet: an absent
  grant is the plain session.

  The portal calls `start_session` without a message, so it only creates the
  session; the session page still sends the first message itself, streamed and
  with the human-in-the-loop extension requested, as every reply. The
  idempotency key per submission and the derived title are unchanged.

  The backend's `POST /kagent/sessions` route and `KagentClient.createSession`
  are removed, with the frontend's `KagentApi.createSession` and the common
  package's `parseCreatedSessionId`. Reads, sends, rename and delete stay on the
  kagent proxy. Requires an agent-manager whose `start_session` takes an
  optional message on the installation.

- f47e1e7: Stream the agent's reply. Sending a message into a kagent session now goes over A2A
  `message/stream` (relayed byte-for-byte by a new
  `POST /kagent/sessions/:sessionId/messages/stream` route, flush-wrapped past
  Backstage's global `compression()`), so the reply appears in the session detail page
  as the agent produces it — text as it is written, tool calls as they happen — instead
  of all at once when the turn ends.

  **The stream is a preview; the poll stays the source of truth.** Streamed events are
  folded into the same `TimelineItem` shapes the polled history produces and rendered
  as a live overlay on the timeline. An item the poll has already delivered is dropped
  by `messageId` recognition — the rule the optimistic user message already follows —
  and the whole overlay is discarded once the send's awaited invalidation has put the
  canonical history on screen. Both executor dialects are handled: text chunks on
  non-final status-updates (Python) and `partial`-stamped artifact updates with a
  `lastChunk` sentinel (Go).

  **Losing the stream is not losing the message.** The verify-not-report contract of
  the `message/send` path carries over exactly: any event proves the turn was
  dispatched, so a stream cut mid-turn (a gateway's 60 s door, a network drop) resolves
  like the existing 202 and the 10 s poll follows the turn to its end. A transport
  failure before any event triggers one read of the session history to check whether
  the sent `messageId` landed — present means dispatched, absent keeps the failure and
  hands the text back to the composer. A decision (a rejected message, an unknown
  agent, an in-band A2A error) is reported as made, never verified away. On routes
  whose request timeout is disabled (agent-platform-standalone sets `0s`) the stream
  lives as long as the turn; where a door cuts it, the page degrades to exactly its
  pre-streaming behaviour.

  Answering an agent's question still goes over `message/send`: a confirmation seen on
  the stream is deliberately not previewed, because only the polled task carries the
  state the answer panel can actually resume.

- 9e57736: Turn Agent Platform into a tabbed section at `/agent-platform` with two
  top-level tabs: **Agents** (`/agent-platform/agents`) and **MCP Servers**
  (`/agent-platform/muster`, contributed by the muster plugin). The page now uses
  `PageBlueprint` + `SubPageBlueprint` tabs instead of a bespoke router, so the
  single section header is owned by the app's page layout.

  - The Agents tab is a stub landing plus the create flow
    (`/agent-platform/agents/new` and `.../new/review`).
  - The create flow no longer renders its own header; its Cancel / Review actions
    are surfaced in the section header via the new
    `useProvidePageHeaderActions` slot from `ui-react`.

- 341e658: Agents per tenant. A person who may list agents only in some namespaces sees
  the agents of every tenant the kagent controller lets them list (`ListAgents`
  as the person, new backend route `GET /kagent/agent-namespaces`), read through
  the Kubernetes API as before. Each agent names its tenant (`platform`,
  `organization <name>`) and its creator (`agent-platform.giantswarm.io/created-by`);
  the Agents tab filters by tenant and "Created by: Me" (the person's email from
  kagent's `/me`, as agent-manager records the creator). A person whom no tenant
  binds, or who may create agents in no tenant and sees none, is told who grants
  access instead of an error or an invitation to create. The create flow offers only
  the tenants in which the person may create agents and picks the only one; Edit,
  Update skills and Delete show only where the person may update or delete the
  agent's HelmRelease, and a deep link to the edit page without that right shows
  the refusal; a refused session start names the agent's tenant.
- 4f45e35: The agent creation Tools step no longer renders the whole gateway catalogue at
  once. On an installation with a few hundred tools the page ran to about fifty
  screens before the author could see what their choice resolved to: every
  workflow was a full card carrying its whole description, muster's core tools
  were expanded by default, the search box sat below the first fold and the
  selected toolset with its resolved list closed the page.

  Now the presets come first as the primary path, followed by a **sticky
  "Selected so far" bar** with the selectors as removable chips and the live
  resolved count ("Resolves to 51 tools for you", with the sign-in, unmatched
  and unknown-preset hints in short form) and a jump to the full list. The
  **catalogue is collapsed behind a "Browse the catalogue" toggle** and a
  one-line inventory; its **search box stays visible** and typing opens only the
  groups with matches. Infrastructure, Agent Platform, Registered servers and
  Workflows are **accordions collapsed by default with counts**; servers inside
  are rows that open to their tools; _Platform administration_ is its own
  warned, collapsed entry. Tools and workflows are **compact rows** (name,
  markers, one truncated line of the description) and every list shows its
  first 20 rows with a _Show all N_ button. **Workflows are grouped by the
  leading segment of their name** (`cert-manager`, `mc`, …), singletons under
  _Other workflows_, each group collapsed with its count — the one structure a
  workflow catalogue reliably carries, since neither `filter_tools` nor
  `core_workflow_list` exposes a workflow's steps.

  The resolved list (Tools step, review step and the agent page's Toolset card)
  groups workflows the same way and pages its rows too. New shared pieces:
  `SelectableRow` / `SelectableRowList` next to the cards, and `ShowMore`.
  Everything the step did before stays: nothing selected at start, `none` and
  `full` exclusive, the inline per-server sign-in, whole-server selection
  without a sign-in flagged, the cap of 32 inline selectors, copying another
  agent's toolset, selectors typed by hand, and the degradation against a muster
  that does not evaluate toolsets or a portal without the muster plugin.

- 88d2fa8: On the agent creation Tools step, _No tools_ is no longer a preset card: it is
  what the empty selection means. The step opens with nothing selected and
  Continue enabled — an agent nobody added tools to is a chat-only agent — and
  the "Selected so far" bar reads **No tools** until a preset, server, workflow
  or tool is added; removing the last selector brings that state back. The
  review step shows _No tools_ and the declaration it applies.

  The release is unchanged: the wizard declares the empty selection as
  `toolset: [preset:none]`, which makes the agent chart omit the gateway entry.
  An empty list is a render error in the chart and an absent value is the
  unscoped default, so the translation happens at the one point where the
  selection becomes a declaration (`declaredToolset`). `preset:none` in a copied
  toolset or typed by hand clears the selection instead of appearing as a chip;
  `full` stays exclusive; a toolset that cannot be applied (a malformed
  selector, more than 32 inline) still blocks Continue.

  From the first round of use: a _No tools_ card among the presets read as one
  more thing to add, while nothing selected already said it.

- 69eaff0: A required **Tools** step in the agent creation wizard, the chart's `toolset` value, and a **Toolset** card on the agent page.

  Every agent the wizard creates now declares a toolset — the selector list (`preset:<name>`, `server:<name>`, `workflow:<name>`, `tool:<name>`) that bounds which of the gateway's tools the agent can discover and call, within whatever the person invoking it may reach. Composition, not authorization: the invoking person's identity and the backends' own authorization remain the boundary.

  - **Tools step** (between Skills and Review): opens with nothing selected and Continue blocked until a choice is made. Presets first, read from muster's `filter_tools({ include_presets: true })` — _Read-only tools_ (recommended), _No tools_, _Infrastructure_, _Agent Platform_, the installation's own, and _Full gateway_ last with a warning; then the catalogue grouped **Infrastructure / Agent Platform / Registered servers / Workflows** from the `agent-platform.giantswarm.io/tool-group` label on the MCPServer CRs (no server names hardcoded), muster's core tools as a warned _Platform administration_ sub-group, with search. Every registered server is listed whether or not the author's session has authenticated with it; an _Auth Required_ server offers the muster plugin's per-server **Sign in** right in the step and its tools become selectable once the callback lands. A whole server can be selected without signing in (flagged: it resolves for the people who have access); individual tools need the sign-in. The resolved tool list for the current selection comes live from `filter_tools({ toolset })`, with read-only / destructive markers from the forwarded annotations and the selectors that match nothing. _Start from an existing agent's toolset_ copies another agent's selectors. Inline selectors are capped at 32 ("define a preset"). The Review step repeats the flags and the resolution.
  - **Composer**: emits the top-level chart value `toolset` (the list, verbatim). Never `muster.toolNames`.
  - **Agent page**: a Toolset card shows the declared selectors (read off the Agent resource's gateway entry, so `kubectl`, agent-manager and the portal agree), the tools they resolve to for the viewer per group and server (each linking into the Tool Explorer), selectors that match nothing for the viewer, the sign-in for a server the viewer has not authenticated with, muster's error when the toolset names a preset the installation no longer defines, and loud labels: _Implicit full access_ for an agent without a toolset, _No tools_, _Full gateway access_.
  - Degrades to the built-in preset names (plus selectors typed by name) where the muster plugin is not installed, and says so — instead of showing the whole catalogue as a resolution — where the installation's muster does not evaluate toolsets yet.
  - The plugin now depends on the muster plugin's API (the picker _is_ muster's catalogue). Its muster-backed reads are keyed under `muster` and never persisted to localStorage; the persister also skips the muster plugin's own per-session keys.

- 2b79a0c: The create flows all speak the connector wizard's language now, in the content
  area rather than full screen or a dialog:

  - **Create agent** renders its Details / Skills / Tools / Review steps in the
    shared in-content `WizardFrame` — step strip on top, centered column, sticky
    footer with Cancel, Back and the step's primary action. The Skills step
    still only appears when skill repositories are configured; all form logic,
    validation and the dry-run review are unchanged.
  - **Add model** is the same single-step frame (Cancel and Close leave to the
    Models list, or the Customize screen's Models tab inside the shell).
  - **Add skill** moved out of its dialog onto a page of its own,
    `/agent-platform/skills/new`, in the same frame: the pull-request proposal
    form, its outcome and a Done action. The Customize screen's Skills tab links
    there instead of opening a dialog.
  - The Customize screen's **Agents** tab shows the agents as the Connectors
    tab shows connectors: one flat table (avatar, name and description, the
    organization as a column, model, skills & connectors, environment where more
    than one, and the status dot), each row opening the agent — instead of cards
    grouped per organization.
  - The Customize screen's **Skills** tab shows the skills the same way: one
    flat table (name and description, source, used by), the skills the agents
    in scope use most first, each row opening the skill — instead of a card
    grid. With Models already a table, the Customize tabs now share the
    Connectors tab's presentation.

- 59f12a0: The Agent Platform moves to URLs that follow the shell's rail
  (giantswarm/giantswarm#38510): Sessions, Usage and Profile are `/sessions`,
  `/usage` and `/profile`; an agent, a skill and a model sit under their
  Customize tab, at `/customize/agents/<installation>/<namespace>/<name>`,
  `/customize/skills/<owner>/<repo>…` and
  `/customize/models/<installation>/<namespace>/<name>`, with their create
  flows at `…/new` and their edits at `…/edit` (skills keep
  `/customize/skills/edit/…`). Model hosting is
  `/customize/models/hosting[/capacity|/cache]`, with Running models at its
  bare path, and Usage's Overview is the bare `/usage`, its "Your sessions"
  `/usage/your-sessions`. An unknown address
  under any of them lands on its nearest valid page. Every old
  `/agent-platform/…` and `/agents/…` address redirects to its new place in one
  hop until the end of 2026.

  The Agents, Skills and Models tabs are sub-pages of the app's Customize page
  (`page:app/agent-shell-customize`); Sessions, Usage and Profile are pages of
  their own (`page:agent-platform/sessions`, `page:agent-platform/usage`,
  `page:agent-platform/profile`), all enabled by default. New exported routes:
  `modelDetail`; `usageOverview` is gone (Overview is `usage` itself). The muster
  external routes take the installation as a path parameter.

- 2b79a0c: Usage screen: follow the platform's content style and keep every view useful. All four views (and the second-level tab strip) sit in the platform's centered content column (the ShellPage max-width idiom) instead of filling the whole content area. On an installation without gateway (gen_ai) metrics (`mimirEnabled: false`), **Overview** shows the kagent-derived tiles — your sessions, your tokens, the runtime-reported cost where any turn reported one, and your agents — under a note that fleet-wide token and cost figures need the gateway metrics, instead of a mostly-empty page; **Cost** keeps its compact honest empty state and adds the kagent-reported cost when one exists. Nothing is invented: no estimated spend without a gateway-derived rate, and "not reported" never renders as `$0.00`. The 7/30/90-day control now applies to **Your sessions** too: the kagent fan-out's window is fixed (a backend caching contract), so a narrower selection is cut client-side from the daily buckets — turns and tokens re-total, while sessions, tool calls and the reported cost read `—` with a hint saying they exist only over the full window, and the tables name the window they cover; a wider selection says it shows the backend's own window rather than claiming days it never read. On Your sessions, window options wider than the window kagent reports are greyed out and unselectable, with a tooltip naming how many days kagent keeps; a wider window reached by link or tab switch still renders with that explanatory note.
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

- 2b79a0c: Usage: the Overview gains an activity heatmap, and connector tool calls get
  their own **Connectors** view.

  - **Overview** now shows the headline tiles, model calls per day as a
    GitHub-style heatmap (with the busiest day, active days and daily average)
    beside the top agents, the gateway's health, and the tokens per day by type.
  - **Connectors** (`/agent-platform/usage/connectors`) carries the connectors'
    tool calls that used to sit at the foot of Overview. It is offered only where
    the muster plugin contributes it, and the old `/agent-platform/usage/mcp`
    address now leads there.
  - The daily model-call count behind the heatmap is one extra pair of Mimir
    queries, run only by the Overview; if it fails, the heatmap says so and the
    rest of the view is unaffected.

- 2b79a0c: The Usage screen is rebuilt per the Agent Platform prototype, with the views
  **Overview**, **Cost**, **Your sessions** and **Technical details**.

  **Overview** opens with KPI tiles — spend this window with the change against
  the previous window, tokens, your own session count, and the active agents —
  followed by compact per-agent and per-model spend breakdowns. **Cost** carries
  the cost-over-time chart and the full by-agent and by-model tables.
  **Technical details** absorbs the raw gateway figures (token counts, model
  calls, blended rate, cache share), the tokens-per-day chart, the gateway health
  strip, and the connector tool-call section the muster plugin contributes —
  `/agent-platform/usage/mcp` redirects there, and the view exists whether or not
  muster contributed anything.

  Two scope controls sit above the tab strip, both kept in the URL so they
  survive a tab switch and travel in a shared link: a **time window**
  (7/30/90 days, `?window=7d`) applying to the gateway views, and an
  **Environment (installation) selector shown only when the portal knows more
  than one installation**.

  Costs follow the installation's configured display currency where one is set
  (`gs.installations.<name>.currency`), USD otherwise. A converted amount is
  labeled **estimated**; the gateway's measured USD figures and the
  runtime-reported costs are never relabeled.

  The kagent session-usage fan-out now also sums the **runtime-reported cost**
  (`costUsd`, which the claude harness reports per turn), overall and per agent —
  so Your sessions shows "Reported cost" beside the token-derived "Est. cost",
  and an agent whose runtime reports none says "Not reported" rather than $0.

  The tiles stack and the tables scroll at phone width (375px).

- 2b79a0c: Per-user, roaming user state: the portal's StorageApi now persists the agent platform's `agent-platform` bucket to the new `@backstage/plugin-user-settings-backend` (registered in the backend, `UserSettingsStorage` override in the app), so remembered UI state follows the person across browsers and devices instead of living in localStorage. Two new hooks ride it: `usePinnedSessions` (bucket `agent-platform`, key `pinnedSessions`) and `useFavoriteAgents` (key `favoriteAgents`) each return `{ pinnedIds, isPinned, togglePin }`, keep every mounted instance in sync through the storage subscription, and store references (`{ installation, sessionId }` / `{ installation, name, namespace }`) that are re-resolved against the live fleet. No UI consumes them yet — the pin and favorite controls land with the shell workstreams.
- 2b79a0c: Hand workflows to the workflow agent (`agentPlatform.metaAgents.workflowManagement`): "Edit via agent" on a workflow's page starts a session about that workflow, and the Workflows overview offers to create one with the agent. Both stay hidden unless the role resolves to an agent that can take a session. Sessions started there report `AgentPlatform.sessionStarted` with the new entry points `workflowEdit` and `workflowCreateAssist`.
- f4fd3d2: A workspace has its own page, at
  `/customize/workspaces/<installation>/<organization>/<name>`, with three tabs:
  **Repositories** (each linked to its provider, with its head commit and its
  last push, marked "after last synchronization" when it moved since),
  **Sessions** (each with its person, last turn and cleanup date) and
  **Details** (the synchronization status with what started it, a failure in
  the workspace-manager's words, and the storage). **Synchronize** shows the
  synchronization running and notifies its outcome when it ends. Edit and
  Delete sit beside it, and the editor of a workspace closes back to its page.
  The Workspaces tab's names and a Session's workspace drawer link to it; a
  person outside the workspace's Organization gets a "not a member" page.
- d129ee1: Add the workspace editor at Customize → Workspaces (`/customize/workspaces/new` and `/customize/workspaces/<installation>/<organization>/<name>/edit`): a name checked as it is typed (format and whether it is free); sources on any provider instance, each an owner with a Language, Topics and Including filter (counts per option where the workspace-manager reports them) and one table of the owner's repositories, matches first, to pick by name or exclude; Edit shows one source at a time; a single minimum disk size under Advanced options; a live preview of what the draft selects; the manager's validation message on the field it names; and an inline sign-in (`ProviderConnectPrompt`) that grants a provider's App in muster. The Workspaces tab gets its heading, New workspace, one line per source and the row menu Open, Edit, Sync now, Delete. `WizardFrame` takes a `meta` line at the header's right end.
- 2e5ece2: Agent Platform: a client for the workspace-manager's tools over muster, as the signed-in person, without UI yet. `lib/workspaceManager.ts` has the tool names as muster exposes them (`x_workspace-manager_<tool>`), the request and result types of workspace-manager 0.4.1 and `classifyWorkspaceManagerError` (not a member, invalid, not found, already exists, conflict, unavailable); `authorizationError` turns a refused or connect-required `authorize_workspace` answer into the error a Session start shows, with the unreadable repositories or the providers to connect and their links. `WorkspaceManagerClient` has one method per tool; `useWorkspaceManagerClient(installation)` builds it and `useWorkspaceManagerAvailability(installation)` says whether the installation's muster lists workspace-manager.
- 2b94c2a: The new-session composer offers a workspace beside the agent: the workspaces
  of the agent's installation, with their repository count and last sync, or
  "No workspace". It is preset to the workspace last used with that agent. A
  start in a workspace checks first that you can read every repository in it:
  an unconnected provider shows its sign-in and the start goes on once you are
  signed in; a refusal names the repositories you cannot read and keeps your
  prompt. `AgentPlatform.sessionStarted` reports whether a workspace was picked.
- e49717c: Customize gains a **Workspaces** tab, last after Workflows, on
  installations whose muster lists the workspace-manager (absent elsewhere). It
  lists the workspaces of one Organization: their sources, repository count,
  what the shared volume stores (with the share's size where its class
  provisions one), the last sync's result (when it happened and why it failed
  behind its info icon), and the Sessions with a directory on it, searchable. A
  person in several Organizations picks one with the Organization control beside
  the Environment; a person in one never sees it. Each row offers Sync now and
  Delete; Delete asks first, naming the workspace and the Sessions still using
  it, which keep their directories until each is cleaned up. Open, Edit and
  Create workspace come with the workspace page and editor. New exports:
  `CustomizeWorkspacesPanel` and `WorkspaceOrganizationSelect`.
- 2a9d630: The agent wizard's skills step lists the plugins found in the configured skill
  repositories, each pinned to the commit its card shows: a Claude Code plugin
  (`.claude-plugin/plugin.json`) is picked whole, an Agent Plugins package
  (`plugin.json` at its root) by the skills it enables. The step warns when a
  skill name is picked twice, the review names each plugin with what of it loads,
  and an edit keeps the agent's plugins at their pins. `GET /agent-skills`
  answers the repository's `plugins` next to its skills, from the same tree read.
- 2b79a0c: Inside the agent-platform shell, an agent's page, a model's page, Model hosting and Usage use the shell's standard page frame: breadcrumbs, one title at the standard scale, and the page's tabs and actions in its header, with no second heading under the shell's. An agent's page reads in plain language, with the tabs Overview, Sessions and Usage: the Overview says what the agent is for and shows its instructions, its skills as cards that open each skill's page, what it can reach, and its model and environment beside it, with the Kubernetes detail (configuration, status, HelmRelease, GitOps source, skill versions) behind "Show technical details", shown from the start while the agent is not ready. Edit and "Use this agent" sit in the header, Update skills in the Skills section, and delete and the manifest in the actions menu. The Usage tab shows the agent's estimated cost, tokens and model calls from the gateway, your sessions with it and any runtime-reported cost, with a link to the Usage screen. Model hosting gathers Serving and GPU capacity under one titled page. The Usage views no longer repeat their tab's name as a heading, in either frame. Classic chrome keeps its existing pages.
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

- a060513: Customize gains a Toolchains tab, where an installation runs the
  toolchain-manager: the toolchains its sources publish, each with its versions
  and its newest version's tools, and the sources with Add source. A
  toolchain's page shows, per version, its tools, Harnesses, pinned packages
  and binaries, egress and Dockerfile; New toolchain writes a Dockerfile from
  picked Alpine packages and opens it as the person's pull request in a source,
  following its build to the published image. The New session dialog offers
  the session's toolchains beside the workspace, preset to the agent's
  defaults: a toolchain added, removed or set to another version reaches
  `start_session`.
- 2b79a0c: The new-agent wizard reads plain-first. Step 1 is "Describe your agent": name, "What is it for?", instructions, the environment and the model (a sole model is now picked automatically); the runtime, the technical name and extra egress origins move behind a "More options" disclosure that sums up its defaults and opens by itself when one of its fields blocks Continue. The review step is "Check and create": a plain summary (name, purpose, model, runtime, skills, tools) comes first, the release, the toolset resolution and agent-manager's manifests sit collapsed under "Technical details", and the actions are "Create agent" and, where agent-manager offers it, "Propose as pull request instead". The Swarm Operator assist's accept button reads "Use these instructions".

  Add model asks for the display name first and fills the technical name from it, and its intro now says what the page is for, pointing at Model hosting where a serving layer exists.

- 2b79a0c: Tools step: a preset now sets the selection instead of being a base to add
  to. Picking one shows what it covers in _Which apps?_ and the individual tools
  (Read-only, All or "k of N selected" per connector) while the toolset stays the
  preset. The first change there writes the preset out as concrete selectors,
  applies the change and switches to _Only the tools I choose below_. A toolset
  that is a preset plus more opens as _Only the tools I choose below_, unchanged.
  Full gateway keeps the selection below turned off.
- 2b79a0c: The agent creation flow follows its design more closely.

  - **Describe your agent**: the Swarm Operator assist is a tinted banner above
    the form — the assistant's avatar, "Rather describe it in your own words?"
    and what it does, and _Let Swarm Operator help_ — instead of a small button.
    It still opens the side chat, and still shows only where the
    `agentManagement` meta-agent resolves.
  - **Select skills**: the same Source and Usage filters as Customize → Skills,
    each only when it would change the list. Filters work with the search and
    keep the step's grouping and paging; while a filter is picked the step says
    how many skills are selected, since some may be out of sight.
  - **Tools** ("What may it do?"): the catalogue is now _Individual tools_,
    opened with _Choose individual tools_. Every tool row says whether it
    **Reads** or **Changes things** (an unannotated tool counts as changing;
    the destructive marker stays), and a long catalogue can be narrowed to
    either kind. The sticky summary takes the design's tinted look and says how
    many of the resolved tools change things. Presets, copying another agent's
    toolset, selectors by name, validation and the resolved list are unchanged.

- 2b79a0c: The create-agent wizard's Tools step ("What may it do?") is simplified to the
  design's blast radius.

  - **Access level**, a single choice: _Nothing outside the chat_ (the new
    agent's default: no tools, and the selection below turned off), the presets
    (_Look things up_ = read-only, recommended; environment presets; _Look things
    up and make changes_ = Full gateway, warned), and _Only the tools I choose
    below_ (no preset). A preset is the base the picks below add to.
  - **Which apps?**: every connector with its tool count and _Read-only_ / _All_.
    Read-only picks the connector's read-only tools one by one; All picks the
    whole connector, so tools it adds later too. Tools picked individually show
    as "N of M selected". Paged, with a search past eight connectors.
  - **Choose individual tools instead** opens the catalogue, with copying another
    agent's toolset and adding a selector by name moved inside it.
  - **Selected**: a rail beside the step lists the selection by connector, how
    many tools it resolves to and how many of them change things; narrower
    screens keep the summary bar.
  - "Server" is "connector" throughout the step. Editing an agent shows its
    toolset as it is: nothing is rewritten until the author changes something.

- 1e1e0e3: Track creating a cluster (`AgentPlatform.clusterCreated`) and adding a GPU node
  pool (`AgentPlatform.nodePoolCreated`) through cluster-manager, each with its
  `mode` (`apply` or `commit`). The writes that ran outside react-query (the
  cluster-manager and model-manager dialogs, muster's server and workflow
  dialogs) now go through `useTrackedMutation`, so every one of them is tracked
  or opts out explicitly.
- 9c0ba49: Report meaningful portal actions through Backstage's analytics API: a new
  `analytics-react` library with the typed event list and `useTrackedMutation`.
  Creating an agent (`AgentPlatform.agentCreated`), starting a session
  (`AgentPlatform.sessionStarted`) and registering an MCP server
  (`Muster.mcpServerAdded`) are tracked; every other write opts out explicitly.
- 2b79a0c: Inside the agent-platform shell, the Agents and Models lists send to the Customize screen's Agents and Models tabs (`/customize/agents`, `/customize/models`), keeping the query string. Without the `agent-platform-shell` flag nothing changes.
- 85e7d8c: The muster and agent-platform backends report, per installation, whether its
  muster or kagent endpoint is reachable from this portal, learned from an
  unauthenticated probe (no credentials, no user data; any HTTP answer proves
  the route, DNS/connection/TLS failure or a 3 s timeout means unreachable),
  cached five minutes. `GET /api/muster/installations` and
  `GET /api/agent-platform/kagent/installations` gain `reachable: true | false |
'unknown'` and `reason`. The Sessions tab no longer queries an installation
  reported unreachable -- so its 10 s timeout and the 500 per page view stop --
  and lists it as "not reachable from this portal"; the MCP Servers tab does
  not run its session probe against an unreachable muster and says so instead
  of offering a connect that cannot help.
- 2b79a0c: Add the pieces of the agent-platform shell's Customize screen: `CustomizeDataProvider` and `useCustomizeData` (the agents, models and skills in scope, with a count per tab), `CustomizeAgentsPanel`, `CustomizeSkillsPanel`, `CustomizeModelsPanel`, `EnvironmentSelect`, `OrganizationSelect` and `ALL_ORGANIZATIONS`.

  The Skills tab and its count list each skill once, matching an agent's skill to the catalog whatever form either repository URL is written in (`.git`, `git@host:`, case on github.com). Above the skills a line says how many skills from how many sources there are. A repository that could not be read is named once, with the reason, and no "No skills yet" is claimed then.

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

- 2b79a0c: A session's chat reads like the prototype's: each run of the agent's work folds under one line — "✓ Used 3 tools ›" — that opens straight onto the exact trace (tool names, argument summary, each call's arguments and result as its own fold-out), collapsed once the turn is done. The page-wide "Timeline" heading and "Show technical details" switch are gone: technical detail is a fold-out in place, and a call outside a summary folds out its exact call on its own row. Under the composer the resting caption is "Agents can make mistakes. Check important results.", the waiting caption names the agent ("… is waiting for your decision above."), and the approval card says "Nothing is sent until you allow it." In the agent shell the session header gets a pin toggle, and a toast — "<Agent> is waiting for you · Open session" — appears when one of your sessions starts waiting on you while you are elsewhere in the shell.
- b63373b: A person connects their own ChatGPT subscription in the portal. The sign-in
  dialog lists a row per provider App muster keeps, beside the MCP servers: not
  connected, waiting for the code, connected or failed. _Connect_ shows OpenAI's
  one-time code with a copy button and its link, opens OpenAI's device page in a
  new tab, and turns _Connected_ without a reload; _Disconnect_ drops the grant.
  The agent chat of an agent whose model is the person's own ChatGPT login sends
  no turn until the person has connected it, shows the connect prompt instead,
  and sends a new session's first message once they have. The model is named
  "ChatGPT (your subscription)".
  Profile and settings lists the person's connections, where they connect or
  disconnect one without a feature asking.
- 205d9b4: Connectors (muster MCP servers) are named by the `ui.giantswarm.io/display-name`
  annotation on their MCPServer where it is set, as agents and models are: in
  the Connectors list, a connector's page title, breadcrumbs and document
  title, the tool page's breadcrumb, the connector wizard's edit frame, the
  command palette, the agent wizard's Tools step and review, the agent page's
  tools, Usage → Connectors, the session timeline, the workflow pages and the
  sign-in notice and dialogs. A family takes the display name its members agree
  on, and connectors that would read the same go by their technical names, so no
  two read alike (`connectorDisplayNames`, exported with
  `mcpServerDisplayNames` and `connectorNameSource`). Searches match the display name and the technical name; URLs,
  `server:` selectors and tool names keep the technical name, which the
  connector's Technical details still show. `MCPServer` gains
  `getDisplayNameAnnotation()` and `getDisplayName()`.
- e33193b: Customize › Agents explains an empty or incomplete list again. A fleet that
  answered with no agent, and has an environment that can take one, shows "No
  agents yet" with "Create your first agent". An environment in scope without
  kagent shows "kagent is not installed on <environment>" (or "on any
  environment") with "Go to Installations"; one that could not be asked whether
  it runs kagent shows the inventory gate with its remedy; a pinned environment
  the portal does not know reads "Unknown environment"; and where no environment
  in reach runs kagent the tab says "No agents to list", naming any environment
  that runs kagent but is switched off in Cluster access. While more
  environments are still read, a thin "Loading more agents" bar sits in the gap
  above the list without moving it.

  gs exports `installationsWithoutComponent`, the one rule behind "<component>
  is not installed on <installation>", which `InstallationScopeNote` now uses
  too.

- 2b79a0c: Customize is global-only: the Agents tab drops its Organization column (it showed the Kubernetes namespace), and the Agents and Models tabs drop the organization filter. `OrganizationSelect` and `ALL_ORGANIZATIONS` are no longer exported, and `CustomizeAgentsPanel` and `CustomizeModelsPanel` no longer take an `organization` prop.
- 2b79a0c: The Customize screen's Agents and Skills tabs follow the prototype's presentation again instead of a table. Agents is one rounded list with a row per agent: its avatar, name and what it is for, then its model, its skills and connectors, and its environment when there is more than one; the state shows next to the name only when the agent is not ready (a ready agent's state stays on its own page). Skills is a grid of cards under a tinted note, most used first, each card showing what the skill does, its source repository and how many agents use it, and opening the skill's page. Both stack at phone width. Connectors, Models and Workflows keep their tables, which is how the prototype draws them too.
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

- bebda60: Agent Platform: the resolved toolset list no longer renders every tool at once.
  A preset like `read-only` can resolve to hundreds of tools across a dozen
  servers, which made the Tools step, the review step and an agent's Toolset card
  into pages of endless scroll. The list now opens as its counts — every group,
  server and workflow prefix collapsed behind a one-line inventory, the same
  disclosure structure the Tools step's catalogue already uses — with a search
  field that opens the sections its matches are in. A resolution short enough to
  read at a glance still shows itself outright.

  Long row lists everywhere in the step now reveal a page at a time (with _Show
  fewer_ to go back) instead of a single _Show all_ that swapped a long list for a
  longer one.

- 1f1b881: One installation inventory, from one `GET /apis` per installation, tells every Agent Platform tab where its component is installed — home first.

  **gs: `useInstallationInventory()`.** Per `gs.installations` entry the hook yields whether it is the _home_ installation (the one whose `oidcTokenProvider` is the frontend's `gs.authProvider` — the portal's own management cluster on a central portal, the release itself on a standalone install), its cluster-access state, and which platform components it runs: `kagent`, `muster`, `kserve`, `capi`, read from the API group list (`kagent.dev`, `muster.giantswarm.io`, `serving.kserve.io`, `cluster.x-k8s.io`). The home installation is probed first, as a foreground request, the moment its access state is `healthy`; every other installation as a background request (behind foreground page reads) as it turns healthy; an installation that is not healthy is never asked. `installationsWith(component)` lists the installations a tab may query for a component — answered, present and healthy, home first. Also exported: `useHomeInstallation()`, `installationInventoryQueryKey(installation)` (`['gs', 'installation-inventory', 'v1', <installation>]`), `parseApiGroupList`, `isPlatformComponents`, `PLATFORM_API_GROUPS`, `INVENTORY_PROBE_PATH`.

  Answers are cached for an hour and, under the agent-platform QueryClientProvider, persisted to localStorage. The data shape is versioned in the key; a persisted entry of another shape reads as "not answered yet" and is fetched again. `refresh()` re-reads every healthy installation, and an installation turning healthy again after `degraded`, `session-expired` or leaving the status set is re-read on its own. A 403 or 404 on `/apis` is a failed probe with its error, never "no components".

  **agent-platform: the providers follow the inventory.** `AgentsDataProvider` and `ModelConfigsProvider` list CRDs only on `installationsWith('kagent')`; `SessionsDataProvider` intersects the backend's kagent installations with `installationsWith('kagent')` instead of with every reachable installation; `ServingProvider` reads KServe on `installationsWith('kserve')`. On a portal with many installations and few Agent Platform ones this replaces two doomed list requests per installation per tab (404s on `kagent.dev`), one KServe discovery request per installation, and a sessions request — with a broker token mint before it — to every installation the backend derives a kagent URL for, by one `GET /apis` per healthy installation for all tabs together. `useKServeInstallations` is removed (folded into the inventory); `useKServeServingSource` takes the inventory's KServe verdict. `useReachableInstallations` keeps its role as the access filter (used for model-manager, which registers no API group) and orders the home installation first. A single-installation portal behaves as before: its inventory is one entry.

- bbb9e16: Populate `agent.iconUrl` in the composed agent manifest at creation time, so the
  created Agent's `spec.iconUrl` (surfaced on the A2A AgentCard) matches the avatar
  Backstage renders.

  - The review/deploy page now sets `agent.iconUrl` in the HelmRelease values to
    the size-agnostic canonical avatar URL
    (`https://avatars.<baseDomain>/v1/<name>.png`), derived from the agent's
    technical name via the same `useAgentAvatarUrl` builder used for display.
  - The field is omitted when the installation has no configured base domain, so
    the chart keeps its default rather than persisting an empty URL.

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

- 2b79a0c: A model's page is a read view now, with **Edit** as an action that turns it into the form in place: what the model cost and how much it was used over the last 30 days (the gateway's figures, snapshots of the model included), its cost per day, the agents that run on it with what each spent on it, and the facts beside it — model ID, endpoint, context window where `agentPlatform.models.contextWindows` names it, environment, created. Model hosting in the agent shell gets a headline row (models running, GPUs in use, GPU pools, GPU cost now, model cache) and the prototype's tab names (Running models · GPU pools · Model cache, the cache a tab of its own). GPU node pools show what their running nodes cost per hour at cluster-manager's on-demand list price for their node sizes.
- 0fd7769: Model hosting (Running models, GPU pools, Model cache) has the Environment control in its header. It sets the same scope as Customize › Models, so a change on either page shows on the other, and the tab links keep the scope. Picking an environment that runs no serving layer keeps the tabs, and a pinned environment the portal does not know is named instead of an empty state. Where no environment in view could be read, Running models no longer shows "Models running: 0" or says that no model is running, and GPU capacity no longer says "No GPU nodes found" or "unavailable for some environments". The Environment control no longer leaves an empty slot in the Customize header on a single-installation portal.

  The "Could not read … environment" warning on Home, Sessions, Usage, Customize and Model hosting reads as one sentence per case. For one environment it says "The sessions on gremlin could not be read. The environment may be unreachable, or your account may lack permission there." and, with a known reason, "The sessions could not be read on gremlin (timed out)." Several environments read in the plural, and the warning no longer says "Skipped because their …".

- 2b79a0c: Model hosting's create flows are pages of their own instead of dialogs over
  the list, in the same frame as agent creation: Serve model, Import from
  Hugging Face and Pull model (`/agent-platform/models/serving/serve`,
  `…/import`, `…/pull`), Add model backend (`…/serving/add-backend`, Backend and
  Review steps) and Add GPU node pool (`…/capacity/add-pool`, Pool and Review
  steps). Each has a deep-linkable URL; Serve model takes its seed from the
  query, and the older `?serve=1` pool link still opens it. Cancel returns to the
  view the flow was opened from; a served model lands on Running models with its
  steps open, a deployed pool on GPU pools with its lifecycle open. The hosting
  area's copy is condensed into full sentences.
- 3489cdb: A model's page says on Overview when no context window is configured for the
  model, or when the one configured is not a number of tokens: an info note
  under the facts says that a window lets a session show how full its context
  is, and whom to ask to set it in `agentPlatform.models.contextWindows`, with a
  link to its documentation. A model the table names keeps its Context window
  fact. The page's Created fact reads as a relative time ("3 days ago"), the
  full date on hover, like the shell's other relative dates.
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

- 2b79a0c: Agent shell attention signals and list scale:

  - The "is waiting for you" toast now shows however the shell is laid out:
    with the rail collapsed and in the phone's bottom bar too, where it used to
    appear only while the rail was expanded. `NeedsInputToasts` is exported and
    mounted once per shell beside the rail, so it never fires twice.
  - More than three sessions starting to wait at once raise one "N sessions need
    your input" toast that opens Sessions on its Waiting chip, instead of a
    stack.
  - The rail lists the latest 8 pinned sessions; the rest are a "N more pinned"
    link to Sessions on its Pinned chip.
  - The ⌘K palette offers a filter chip only for kinds that have entries (none
    over a single kind), lists up to 50 rows while one kind's chip is on, and
    its "+N more" opens that kind's list searching for the same thing.
  - The shell's Sessions list opens narrowed when a link asks for it
    (`?q=` searches, `?state=` picks a chip).

- bbb9406: MCP servers that wait for the person's sign-in move from muster's corner card
  into the Agent Platform shell's Notification inbox: one row for the person's
  home installation, "2 MCP servers need your sign-in", naming the servers, with
  a Sign in that opens muster's sign-in dialog in place. The row counts in the
  bell's badge, the tab title, "Mark all read", the toasts and the desktop
  notifications. A server that starts to wait makes it unread again; a sign-in,
  in the dialog or on a muster page, takes it away. Marking the row read takes
  the place of the card's "Not now".

  `muster` no longer mounts its corner card (`McpAuthNotice`) on every page, and
  exports `McpSignInProvider` and `useMcpSignIn`: the home installation's MCP
  servers waiting for the person's sign-in and those connected, read every five
  minutes and when the tab regains focus under muster's query client, and
  `openSignIn` for its sign-in dialog, which loads on first use and opens only
  for the home installation. `useMcpServersAwaitingSignIn` also tells whether
  muster answered (`isAvailable`).

  `agent-platform`'s notification record adds `replaceSeenMark`, which writes a
  seen mark only while the stored one is still the mark it replaces, and its
  `SeenMarkReason` and `analytics-react`'s `AgentPlatform.notificationOpened`
  take the `mcpSignIn` kind: the MCP sign-in row's Sign in.

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

- 2b79a0c: Remove the session notifications bell from the agent shell's rail and mobile bar:
  the colored session dots in the rail are the notification mechanism. Removed
  exports: `SessionNotificationsBell`, `SessionNotificationsBellProps`,
  `useSessionNotifications` and `SessionNotificationSetting`. The mute/read
  markers stored under `sessionNotifications` in the `agent-platform` storage
  bucket are no longer read or written. The dots and their polling are unchanged.
- 2b79a0c: The MCP-servers rename to **Connectors** carried through this plugin's
  user-facing labels: the Usage page's "MCP tools" view tab is titled
  **Connectors**, the usage tables say "Top connectors" / "Connector", and the
  installation scope control follows the tab's new `connectors` path segment.
- 83cc65c: A session whose messages keep timing out before the agent starts, with none of
  them reaching the session, now offers to continue in a new session from the
  second such send in a row. The notice reads "This session may not be able to
  continue" and keeps the message box and the retry, since kagent has not marked
  the runtime lost. A send that lands, or a new turn, ends the count; a loss
  kagent reports later takes the reported path. `agent-platform-common` adds
  `countSendTimeout`, `readSendTimeoutRuntimeLoss` and `RuntimeLoss.source`.
- 2b79a0c: Export `RecentSessions`, the signed-in user's most recently started sessions with the ones waiting on them marked, and `AgentPlatformProviders`, the plugin's query client and fleet-wide data providers for rendering its components outside its pages.

  Export `StartNewSession`, the session composer as the Sessions tab shows it, and `AgentPlatformHome`, a greeting above it for use as a home page.

  Add state filter chips, each with its count, and an agent filter to the Sessions list, and export `AGENT_SHELL_FLAG`, under which the Agent Platform page drops its tab strip and a session's page its session switcher.

  Export `ServingLayerGate`, which renders its children only where the Models tab offers its Serving view.

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
- 500dedb: The session view shows each egress refusal of the Session on the turn that met
  it: the refused host and port, why (not in the agent's egress settings, or raw
  TCP), when, how many requests, the origin to add, and a link to the agent's
  egress settings. The refusals come from the Substrate egress gateway's
  per-actor counter in the installation's metrics, read as the signed-in person
  for that Session's actor only.
- eb7ed35: A long user message on the session page, and in the create-agent assist panel, is cut to 10 lines of its text, with _Show more_ centred in the bubble under the fade and _Show less_ at the end of the opened text — a continued session's opener, which carries the whole earlier conversation, or a pasted log no longer fills the page. A message only a line or two longer is shown whole, and find in page or keyboard focus past the cut opens the message. `ui-react` exports the pieces behind `CollapsibleMarkdown` (`useCollapsible`, `CollapsibleViewport`, `CollapsibleToggle` with `onSolid` for a filled surface, `collapseSlack`), and `mockCollapsibleLayout` from `testUtils`; `CollapsibleMarkdown` now also shows whole a document that would hide no more than a fifth of its cut.
- 69e07c8: A session's actions menu, on its page and on each row of the Sessions list,
  has a Notifications submenu: Default, All activity or Muted, the current one
  ticked. The level is kept per person in the user-settings backend, with the
  sessions the portal started and what the person has seen in the Notification
  inbox; `useSessionNotificationRecord`, `useSessionNotificationSettings` and
  `useNotificationSeenMarks` read and write that record. Entries for deleted
  sessions are pruned, only after a complete read of the installation's
  sessions (`KagentApi.listSessionsIfComplete`); the backend now flags a session
  listing cut at its page limit as `truncated`. Settings writes read the stored
  value first and refuse to write on a read that failed. Adds the
  `AgentPlatform.sessionNotificationLevelChanged` event.
- eb2bbd1: The session page has a small "Show tool activity" switch on the line with its
  start time, on by default. Off, the conversation shows only the person's
  messages, the agent's replies, its questions and the request the session is
  waiting on; work summaries, reasoning and other permission requests are
  hidden. The choice is kept per person across sessions and reloads, and
  reported as `AgentPlatform.toolActivityChanged`.
- 2b79a0c: `NewSessionComposer` takes opt-in props, all off by default so the new-session
  dialog and the inline composer are unchanged: `showUnavailable` lists non-ready
  agents as disabled options that give the reason, `groupByNamespace` heads the
  options by namespace with `recentAgentIds` listed first under "Recent",
  `searchable` always offers the search box, `initialPrompt` fills the field,
  `pickerPlaceholder` names the empty choice, `pickerFooterAction` lists an
  action last in the picker, set apart and kept open beside a sole agent, and `promptPlaceholder`, `renderPickerAccessory`,
  `renderFooter` and `onSelectedAgentChange` let a caller build around the
  choice. Grouped by namespace, the picker lists a search's matches as one group
  and starts the next opening with an empty search. `StartNewSession`
  passes them through `composerProps`, and takes `titleMaxLength`, which
  `useCreateSession` and `deriveSessionTitle` now accept as the derived title's
  bound.
- 2b79a0c: The Agent Platform shell's home page builds around the choice of agent. Under
  the greeting a line says what to do, or which agent the session starts with.
  The picker, "Choose an agent" until one is chosen, lists every agent, grouped
  by namespace behind the person's recent agents, with unavailable ones disabled
  and their reason shown, and is always searchable. Beside it the chosen agent's
  model is named; under the composer the three most recent agents are one press
  away until one is chosen, and then a line says which connectors it can use.
  The picker ends with "Manage agents", which leads to Customize, when
  `AgentPlatformHome` is given `manageAgentsHref`. Sessions started there keep up
  to 199 characters of the first prompt as their title.
- 2b79a0c: `RecentSessions` takes a `shellRail` prop that adds an "All sessions" link to the sessions list next to its label and a dot before each session whose agent is working.

  Under the `agent-platform-shell` flag, the rail drops its Sessions item: the recent sessions' "All sessions" link opens the list instead. The mobile bar, which lists no recent sessions, keeps the item.

- 2b79a0c: Under the `agent-platform-shell` flag, the Sessions page is titled "Sessions" with a "New session" button, and its list shows one table per day the sessions started (Today, Yesterday, Earlier), states in the shell's words (Waiting for you, Working, Finished, Failed) with a coloured dot, state chips with counts, an agent filter labelled "Agent" beside the search, search by title or agent, and a menu per row to rename or delete the session. The list shows 25 sessions at a time, with "Load more" for the next 25; deleting a session moves focus to the next row. Without any session the page says so and links to a new session. Deleting a session from the list itself no longer navigates to the list a second time. Without the flag the Sessions page is unchanged.
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

- bce6f2c: The skill page is a single column, as the connector page is: its facts
  (source, path, branch, latest commit) move into the Overview under "Where it
  lives". The header's View source button is gone; the latest commit links to the
  skill's folder at that commit instead. The Used by tab lists the agents as the
  connector page's does, with the same rows (each agent's name a link to its
  page, where it runs at the row's end, and its namespace where two agents share
  a name on one installation), empty state and Show all N agents. On a phone,
  both pages write that detail under the agent's name.
- 220e7c7: A session's live view now survives a cut stream. When the stream of a running
  turn ends before the turn does, as every stream does during a kagent
  controller rollout, the page resubscribes to the turn and continues the reply
  where it stopped, saying "The live view was interrupted. Reconnecting…"
  meanwhile. When that keeps failing for a few seconds, the page follows the turn
  through the conversation poll as before and says the live view could not be
  restored. The backend adds
  `POST /kagent/sessions/:sessionId/tasks/:taskId/subscribe`, which relays
  `A2AService/SubscribeToTask` as the signed-in person.
  `agent-platform-common` adds `STREAM_MAX_DURATION_MS`, the bound the relay and
  the page share.
- f94930d: Report more of what people do in the Agent Platform as usage data, with no
  names or other identifiers in any of these events:

  - A tool run from its page that returned a result is reported as
    `Muster.toolRan`, next to `Muster.workflowRan` for a workflow's. A
    connector tool run there reports the connector's event below instead.
  - Deleting an agent is reported as `AgentPlatform.agentDeleted` (`mode`:
    `apply` or `commit`).
  - Creating, editing and deleting a model is reported as
    `AgentPlatform.modelCreated`, `AgentPlatform.modelUpdated` and
    `AgentPlatform.modelDeleted`.
  - Editing a connector, in the wizard opened from its Edit or as JSON on its
    page, is reported as `Muster.mcpServerUpdated`; Activate, Deactivate and
    Reconnect as `Muster.mcpServerConnectionChanged` (`change`: `activated`,
    `deactivated`, `reconnected`), and Delete as `Muster.mcpServerDeleted`.

  - In a session, sending a message (a first message included), answering the
    agent's question, stopping a turn, renaming and deleting the session are
    reported as `AgentPlatform.messageSent`, `AgentPlatform.questionAnswered`,
    `AgentPlatform.turnStopped`, `AgentPlatform.sessionRenamed` and
    `AgentPlatform.sessionDeleted`, with nothing of the text, the answer or how
    it was given.

  `DefinitionEditorDialog` takes `saveTracking`, the event its save reports or
  the reason it reports none, in place of `saveUntrackedReason`.

- 2b79a0c: Usage gives every metric one home. **Overview** shows platform health and headline trends: the tiles, tokens per day by type, top agents ranked by model calls, gateway health and the MCP tool-call section. It keeps one spend tile that links to Cost. **Cost** is the only view with money breakdowns: spend against the previous window, the blended $/1M rate, cache read share, cost per day, the by-agent and by-model tables, and the unpriced-models warning. **Your sessions** is unchanged. The **Technical details** view is removed because each of its figures moved to Overview or Cost; `/usage/technical` and `/usage/mcp` now redirect to Overview.
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

- 2b79a0c: An agent row carries `skillIds`, its git skills as the skill catalog identifies them, and `modelConfigId`, the ModelConfig it references.
- 66c658c: The workspace editor shows each source's exclusions under Exclusions, to
  remove one or add one: from the repositories the source selects now, or by
  typing a name it does not select yet. Its repository count follows
  workspace-manager's rules: an exclusion drops a repository picked by name too,
  one that names nothing selected drops nothing, a name picked twice in
  different case counts once, and a source with filters is counted by the
  manager ("counting…" until it answers, "total not known" when it cannot), so
  the count is never negative or off. The preview says how many repositories
  the exclusions left out. The Workspaces list drops its Sources column, which
  listed every repository and exclusion; the sources are on the workspace's
  page, and the Repositories column no longer cuts its header short.
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

### Patch Changes

- 2b79a0c: Add skill names its commit and pull request `feat: add skill <name>`,
  following conventional commits, and an edited skill's `fix: update skill
<name>`. The add- and edit-skill form says "This opens a pull request." and
  "Markdown formatting allowed." under Instructions,
  and its success message links to the pull request with "Review pull request".
  The add form's Name hint drops "Becomes the skill's folder."
- 2b79a0c: The agent area says "Environment" where it said "Installation": the Profile
  page's Environments section, the Environment column of the agents, sessions
  and models tables and of the GPU and model-cache tables, the Environment field
  of the add-model, model-hosting and GPU dialogs, the empty and error states of
  Sessions, Agents, Models, Usage, connectors and tools, the connector Connect
  step, the create- and edit-agent wizard (the Environment field and its notes,
  the model, Tools-step preset and copy-from-agent messages, the review
  summary), the agent page's sessions and not-found messages, the home and
  new-session composer. Config keys, URL parameters and code names are
  unchanged, and the classic portal keeps its wording.
- 2b79a0c: Agent detail: **Update skills** is offered for an agent applied from git too, when agent-manager can open pull requests. The dialog asks the same dry run in commit mode (each git skill's pinned commit next to the default-branch head), confirms as **Open pull request**, shows the pull request it opened and then only closes; the agent's skills move once it is merged. A live agent keeps the direct update. Reported as the existing `AgentPlatform.agentUpdated` with `mode: commit`, `change: skillsRefreshed`.
- 2b79a0c: Long agent lists render a page at a time: Customize → Agents shows 25 agents with _Show 25 more agents_ (the search narrows first), and the "Used by" lists on a model, connector and skill page show 10 agents with _Show all N agents_.
- 2b79a0c: The agent picker for a new session finds an agent by the text its option shows
  under the name (its description, or why an unavailable agent cannot be started)
  as well as by its name, listing name matches first. Words are matched from
  their start, so a short query no longer matches inside words.
- 6c82397: The agent detail page shows an agent whose HelmRelease exists but whose
  AgentTemplate is not rendered yet as **deploying** instead of "Agent not found".

  Right after Deploy, agent-manager's `create_agent` has applied the HelmRelease
  and the create flow navigates to the detail page before helm-controller renders
  the template, so the template read answers 404. The page now tells "not yet"
  from "not there" through agent-manager's `get_agent_status` — the same read the
  creation progress polls — which answers `not_found` only when neither the
  template nor the HelmRelease exists. While the release is there the page shows
  the name and avatar, a "Deploying" label and agent-manager's summary of where
  the release stands, re-reads the template every 5 s and switches to the rendered
  agent in place. "Agent not found" remains for an agent that exists nowhere, and
  for installations without agent-manager.

- 322e58c: Name the agent on its detail page: the browser tab reads
  "<agent> · Agents · Agent Platform" (display name, falling back to the
  technical name), and the agent's name is the page's `h2` heading. The
  Configuration card is a description list instead of `h6` headings, and the
  Status card's conditions are `h4` headings under the card's `h3`.

  A ModelConfig without the `ui.giantswarm.io/display-name` annotation (or with
  a blank one) is no longer shown by its resource name as if that were the
  model: the detail page leads with the model and provider, in monospace, and
  the Agents table's Model column shows the model (`spec.model`).

- d19ad0c: Agent detail page: the **Agent manifest** dialog uses the shared manifest dialog, with keys sorted like `kubectl get -o yaml` and a **Copy manifest** button.
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

- 2b9d403: `/agents` (and anything below it, query and hash kept) redirects to the same place under the Agents tab, `/agent-platform/agents`, instead of answering 404. Where the Agent Platform section is not enabled, `/agents` stays a not-found page.
- 382f7cc: Answering an agent's confirmation no longer fails with an error 500 when the
  resumed turn takes longer than the backend waits for its first event. The
  streaming answer route answers such a turn 202, as the non-streaming routes do,
  and the page shows the turn as still running and picks up the reply from the
  conversation poll. Sending a message is unchanged.
- 7b43a16: The GPU capacity view explains a memory budget the operator set: a host node
  whose serving layer reports `budgetSource: override` (model-manager's
  `ollama.memoryBudgetGiB`, for a pod whose `/proc/meminfo` is not the host's
  memory) says so in the budget cell's tooltip and keeps its "Backend host"
  rendering — no GPU columns, the operator's figure as the budget.
- 244719a: Session detail: a canceled turn says so. A turn stopped before it finished — by pressing Stop, or by the controller ending the run — rendered as the person's message, or a reply that breaks off mid-sentence, with nothing to say why; and since the header badge reads only the newest task, a cancel earlier in the session left no trace anywhere on the page. It now closes with an entry the way a failed turn does, worded as what it is rather than as an error: "This turn was canceled", with the controller's reason when it recorded one. Whatever the agent managed to write keeps its place above it. The live stream ends a canceled turn on the same entry, so pressing Stop closes the turn at once instead of leaving the half-written reply looking like it is still being typed.
- 863da43: The session timeline and session usage read kagent's `kagent.dev/a2a/*` metadata (part type, usage, timeline position) and a delegated agent's `usage` response field, and still read the older `adk_`/`kagent_` spellings and `kagent.dev/timeline-position` in stored task history. The message a completed task's status carries is read as the task's last history entry, which is the only place the claude Harness reports its usage, so tool calls, tool results and token usage show again for ADK and Claude Code agents on kagent 1.1. History entries without a timeline position keep their place behind the entry before them. On kagent 1.1 model reasoning is no longer marked as such and replies carry no author, so reasoning renders as the agent's answer and subagent replies are not attributed. `readKagentMetadata` and `readKagentSubagentUsage` take an optional type guard, a usage spelling that counts no tokens no longer hides an older one that does, and `readKagentMetadataRecord`, `isRecord` and `asRecord` are exported.
- 2b79a0c: The "Couldn't read N environments" warning can be closed with an "X" button and is announced as an alert. It shows again on the next visit or when a different set of environments fails.
- 8988eeb: Offer a pull request (agent-manager's commit mode) only for deleting an agent
  applied from git, the only kind that has a GitOps repository to open one in.

  The delete dialog and the Edit agent page no longer show Commit for an agent
  written live. An agent applied from git, which agent-manager refuses to delete
  live, can now be deleted through a pull request when agent-manager reports the
  commit capability: the actions menu offers Delete for it, and the dialog's only
  action is "Open pull request". Edit and Update skills stay unavailable for such
  agents.

- d6bec76: Extract the kagent wire layer into a new `agent-platform-common` package. No
  behaviour change — every module moves verbatim, with its tests and fixtures.

  Moved out of `agent-platform/src/lib`: `kagentSchema`, `kagentTaskSchema`,
  `kagentSessions`, `kagentSessionDetail` and `kagentSessionState`, plus
  `isListableSession`, which had been sitting in the sessions table's helpers.

  **Why now.** The backend is about to derive a session's state server-side, which
  needs the task schema, the session parsers and the state map. A second copy in
  the backend is exactly the drift the version-tolerance strategy exists to
  prevent: kagent ships no OpenAPI spec, GS pins v0.9.9 while upstream is on
  v0.10.x, and the fleet can run a mix, so tolerance lives in permissive parsing
  rather than version detection — and that only holds while there is one parser
  and one `KNOWN_STATES`. The first symptom of two would be a session grouped one
  way in a list and badged another way on its own page.

  `kagentSessionPolling` stays in the frontend: it is typed against react-query.
  It keeps re-exporting `ACTIVE_MAX_AGE_MS`, so its callers are untouched.

  **Fixtures are shared, not duplicated**, through a dedicated `/testFixtures`
  entry point. A test asserting against its own copy of a captured v0.9.9 response
  is one that can keep passing while the real fixture drifts. Two constraints
  shaped that entry point rather than a deep import: `no-forbidden-package-imports`
  rejects reaching into another package's `src`, and the type rollup cannot resolve
  a `.json` module, so each fixture carries an explicit type instead of the one
  inferred from its JSON. The six well-formed task envelopes are typed as a mutable
  `TaskEnvelopeFixture`, since tests clone and edit them to reach states no
  captured response covers; the malformed and envelope-tolerance ones are
  `unknown`, which is what a parser sees anyway.

- e59a84c: The session chat keeps the keyboard focus. Starting a session from the sessions
  list or the agent page lands on the new session with the cursor in the message box;
  sending a message no longer drops it (the box stays editable while the agent works,
  only sending is withheld, and the next message can be drafted meanwhile); when the
  agent asks a question the first choice or the answer box is focused, and once it is
  answered the focus returns to the message box.
- 2b79a0c: _Connect a model_ and _Edit model_ lay their fields out in one full-width column: Provider sits above Model rather than beside it, where a provider description of one line or three moved the Model input up and down.
- 17f51ca: The session cost popover's **Context used** is the newest turn's largest model call (prompt plus output), no longer the sum of every call in the turn, which on a long turn ran to several times the model's window and was then shown capped at 100%. A raw count never sits beside a share: above the configured window, or for a model the table does not name, it shows with a line saying why. A claude Harness turn, which reports only a total over its calls, reads "Not reported". The default `agentPlatform.models.contextWindows` table names each Claude family on its own, following Anthropic's documentation: 1M for the 5.x models, Opus 4.6 to 4.8 and Sonnet 4.6, 200k for Opus, Sonnet and Haiku 4.5, and no `claude-*` catch-all. `agent-platform-common` adds `readUsageReport` (a usage bag's totals and context reading, parsed once) and `claimEndedTurnMessage`.
- e0f7ae7: Create cluster: the cloud identity is picked from the installation's `AWSClusterRoleIdentity` names whenever the provider line in effect is aws or eks, the preselected one included; it showed a free text field until a provider was chosen by hand.
- 2b79a0c: Customize's Agents, Skills and Models tabs fit a phone. Models drops the Used by column at phone width, and its count joins the model's line ("Anthropic · claude-sonnet-4-5 · Used by 2 agents"); the status column keeps room for its label. Agents wraps a long name, the description and the facts instead of cutting them, says inline why an agent that is not Ready needs a look, and gives the star a 44px target. A skill card breaks a long name inside the card. The tab's search and its create action (New agent, Add connector, Connect a model, Add skill) take a full-width line each on a phone, instead of the action wrapping under the search, left-aligned.
- 83ad03b: Delete cluster: cluster-manager's `notFound.nothingLeft` answer (0.27.0) reads as the removal complete. After **Finish removal** the dialog shows the cluster removed instead of a refusal. A cluster already gone opens as already removed, without the refusal, **Check again** or **Delete cluster**.
- 0a2a223: Deleting a session right after its last turn ended no longer fails with a 409
  "not yet settled". kagent refuses the delete until the turn's cleanup has
  settled, so the backend retries exactly that refusal with a doubling backoff
  for up to about 16 s, and the delete dialog says what it is waiting for once
  the delete runs longer than 2 s. A session still unsettled after the retries
  answers the 409 with kagent's reason and a hint to try again; every other
  failure is reported as before.
- 2b79a0c: Agent and skill pages read on a phone.

  - **Skill page header:** at phone width only the primary action stays a button (Evaluate, else the first). Update agents, Edit and View source move into a ⋯ menu; before, four buttons wrapped to two rows.
  - **Skill page, Used by:** each agent's environment, namespace and older pin sit under its name instead of beside it, where they squeezed the name.
  - **Agent page, technical details:** on a phone or touch screen, a revision and each skill's pinned commit are written out in full. They were shortened, with the full value only in a hover title.
  - **Agent page, Tools:** a toolset selector chip breaks a long selector instead of running past the card.

- a47a299: A dialog holds itself open only while a write is on its way. The Load, Pull and Import model dialogs can no longer be closed by their header's close button mid-request; the Add GPU node pool dialog no longer lets go of a Deploy or Commit when its review reruns; and the Create cluster, Delete cluster, Add model backend and Remove model backend dialogs can be left while their dry run is still out, since it writes nothing.
- fb7354b: Enter sends. In the session reply composer and the new-session composer, Enter now
  sends the message and Shift+Enter inserts a newline — the rule of Slack, Claude and
  kagent's own UI, and the first thing people reached for; the earlier arrangement
  (Enter for a newline, Cmd/Ctrl+Enter to send) came back as a bug report. Cmd/Ctrl+Enter
  still sends, and an Enter that commits an IME composition is left alone.

  The answer panel an agent's question opens can now be sent from the keyboard too:
  Enter from a radio, a checkbox or the answer box sends the answer, where before only
  the button did. In the reason box Enter confirms the decline rather than sending an
  approval.

- 986b054: The session timeline now shows why a turn failed. kagent records the reason — for
  example the model provider's `404 model_not_found` for a model the account cannot
  use — only on the failed task's `status.message`, which the timeline read solely in
  the awaiting-input states, while the streamed terminal event rendered it as the
  agent's prose that the poll then replaced with nothing. A failed turn therefore
  showed the user's message with no reply under it and a "Failed" badge as the only
  sign. It now closes the turn with a red alert carrying kagent's reason, both live
  and after the poll.
- 3f7455f: The session timeline and session usage count the tokens a failed or canceled turn reports on its status message, where the claude Harness puts what a failed Claude Code turn spent. The message stays off history, so the failed-turn entry still shows the reason. Session usage also counts the usage on a pending prompt of a turn awaiting input, as the timeline does, and no longer credits a message from a turn outside the window to a later turn that repeats it. A failed turn's reason no longer renders a second time when a later turn's history repeats it. `readTurnStatus`, `historyWithPendingPrompt` and `claimEndedTurnUsage` are exported.
- 113606d: The **Create your first agent** button on an empty Agents or Sessions tab is a
  link to the create form (`/agent-platform/agents/new`), the same form as
  **New agent**. The browser follows it however the click arrives, it opens in a
  new tab like any other link, and assistive technology announces it as the
  navigation it is.
- a1e3699: Format the Agent Platform's counts, USD amounts and tokens-per-second figures
  with `en-US` thousands grouping on every browser, instead of the browser's
  locale. The decimal mark in these figures was already fixed (`$4.50`, `1.5k`,
  `4.3%`), so a browser set to another locale showed `$4.50` next to `$1.235` in
  the same column. Nothing changes for an `en-US` browser.
- b02b541: Agent details: withhold **Update skills…**, **Edit agent…** and **Delete agent…** for an agent that is applied from git. The page reads `get_agent`'s `managed` field — `gitops` means the agent's `HelmRelease` is applied by a Flux Kustomization, so agent-manager refuses every live write to it — and the Skills card's button, the three kebab items and the edit page are withheld. Previously the refusal only arrived after the dialog had opened and its dry run had run. Nothing explains the absence in place — the Overview tab's "Managed through GitOps" card already does, and a menu is a list of things to do rather than somewhere to read a warning, so the disabled reason items the kebab used to show for a missing agent-manager are gone too. Deliberately agent-manager's own verdict rather than the Flux provenance labels: `isGitOpsManaged()` is true for every agent this plugin deploys, because the create flow applies a `HelmRelease` of its own. When `get_agent` settles without an answer — muster not connected, or the read refused — the actions stay offered, as before; while it is in flight they are withheld, rather than shown for a muster round-trip and then taken away.
- 48cf35b: Add GPU node pool: the node sizes, their prices and the presets each hosts appear as soon as a cluster is picked, before the pool is named — the sizing dry run carries a placeholder name until then; the name only enables Review.
- 757d619: `Update skills` on an agent's page shows the convergence progress again, and no
  longer leaves it behind to appear on a later visit.

  The detail page reads the write it should watch out of the router state. That
  state was only read once, when the page mounted — but `Update skills` runs from
  the page itself and navigates to the URL it is already on, so nothing unmounts
  and the write was never seen: no "Updating skills…" alert ever appeared, despite
  the toast saying the update had been accepted. Nothing having been read, nothing
  was cleared either, so the state survived in the history entry and a later reload
  of that URL surfaced the progress out of nowhere, for an update long finished.

  The handoff is now picked up whenever it appears, not only at mount. The create
  flow is unaffected — it navigates to a different page, so it always worked.

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

- 4eaec47: Cluster page: **Delete** shows only on a cluster create_cluster made (rendered
  by a HelmRelease of its own name in its organization's namespace), the only
  kind cluster-manager's `delete_cluster` removes; App-based clusters,
  GitOps-managed ones among them, no longer offer a dialog that can only report
  the refusal. `useClusterPageTarget` reports the cluster's `helmRelease`.
- 2b79a0c: The Model hosting dialogs follow the app's standard form design. Add GPU node pool, Add model backend, Serve model, Import from Hugging Face, Pull a model and the three remove dialogs keep their main button pressable: a blocked press marks the field that is wrong with its message under it and moves the focus there (opening More options where the field is folded away), instead of a disabled button that says nothing. Fields are one column. The knobs whose defaults fit most cases are under **More options**, with a one-line summary of what they are set to: Maximum GPUs and Zones (Add GPU node pool; the model cache switch, a monthly bill, stays in sight), the agent endpoint, the discovery ConfigMap and the credentials Secret (Add model backend), Placement and Nodes (Serve model), and Serving preset and Target node (Import). Footers have Cancel first and the primary button last, and wrap rather than run past a phone's edge.

  Fixed: choosing **None** as the serving preset or **Best node** as the target in the Hugging Face import sent the internal placeholder (`__none__`, `__best__`) to model-manager's fit check and download instead of leaving the preset or node out.

- 2b79a0c: Model hosting's actions sit in the platform's standard places at the top right of the page header, as on an agent's or a skill's page, instead of a free-floating row of up to five buttons (~730px wide, wider than a phone). On Running models, **Serve model** is the primary button, **Import from Hugging Face** (or **Pull model** where nothing imports) the secondary beside it, and adding a model backend or a GPU node pool are in the ⋯ menu; on GPU pools, **Add GPU node pool** is the primary. At phone width one button stays and everything else moves into the menu, so the header never runs past the screen.
- 2b79a0c: The Model hosting figures no longer repeat identically on every tab: Running models keeps the whole row, GPU pools shows only the GPU tiles (GPUs in use, GPU pools, GPU cost now) and Model cache only the cache tile. `ModelHostingKpis` takes a `scope` (`all`, `gpu`, `cache`) and renders nothing when its scope has no tile.
- 2b79a0c: Model hosting: the GPU pools table keeps its lifecycle chevron and **Remove pool** clickable, and the model cache table its **Remove cache**. Shared out equally among the other columns, the actions cell was narrower than its buttons, and the chevron slid under the version cell beside it. The pool form's cache notes now point to **Model cache**, where a kept cache is removed, instead of the GPU capacity page.
- 9a71810: The GPU node pools and Serving pages report an installation that did not
  answer in plain words, never the MCP SDK's transport text.
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

- 2b79a0c: More lists stay plain at a few entries and usable at hundreds:

  - Usage → Cost's by-agent table renders the top 20 agents by the active sort,
    with _Show more_.
  - The Serving page's running models get a model search once more than 20 are
    listed (filtering out backends with no match), and each backend's table
    renders 20 models at a time.
  - The create-agent environment step's "Sign in to muster" links wrap and show
    the first five (_Show all N environments_); its notes name the first five
    environments and count the rest.
  - The Tools step's "Start from an existing agent" shows 12 agents at a time,
    with a search by name or namespace once there are more than 20.
  - The agent wizard's Skills step (create and edit) shows a single repository's
    skills as a plain grid, opens every repository only while the catalogue
    holds at most 20 skills (a longer one opens as its repositories and counts,
    each counting its selected skills, and a search opens the repositories it
    matched in), renders 20 skills per grid at a time with _Show more_, and
    offers its search and selected count only above eight skills.

- 2b79a0c: Live round 2 fixes:

  - An agent's question no longer offers _Decline_, which always failed ("A
    question cannot be rejected"): a question is answered, or left waiting. A
    permission request keeps _Allow_ and _Decline_.
  - With several questions, "Question N still needs an answer." appears only
    after a blocked send, not on arriving at a question. _Send answer_ can be
    pressed while an earlier page is unanswered, and says which one.
  - The edit-agent wizard always prefills from a fresh reading of the agent, so
    opening it right after a save shows the saved values, and the next save
    compares against them. Saving re-reads the agent straight away.
  - The agent wizard's model card says "Environment default" (it said
    "Installation default"), on screen and to screen readers.
  - A session opens at its newest turn instead of its top.
  - The docked chat bar no longer lifts 24px when the conversation is scrolled
    to its end.
  - The home screen titles the browser tab "New session · Agent Platform" instead
    of keeping the previous page's title.
  - Lists that page with _Show more_ (including the wizard's Skills step) show a
    small remainder instead of hiding it behind a button, so there is no
    "Show 1 more skill".

- 2b79a0c: Live-round fixes:

  - Adding and editing a skill name the page in the browser tab ("Add skill ·
    Skills", "Edit <skill> · Skills") instead of falling back to "Sessions".
  - Usage → Top agents reads each row's figures apart — "12 model calls, 53%" to
    a screen reader and in a copy, not "1253%". Nothing changes visually.
  - The Active agents tile says "1 model answered" for a single model.

- 2b79a0c: A model's edit form marks the field a blocked save is about — the message
  under it, the field invalid and focused — like the create flows, instead of a
  "Please fix the following" box.
- 2b79a0c: Customize → Models now says how to turn on model hosting when no environment has it: one line explaining that the environment needs model-manager registered with its muster, with a link to the configuration reference. Environments that already have model hosting still show the Model hosting entry.
- 2b79a0c: One word per concept in the agent platform: connectors are called connectors everywhere (named as Customize lists them, also in session tool calls and Usage), the read-only preset is "Read-only tools" and muster's own tools are "Platform tools", gateway costs are "Spend" and token estimates "Est. cost", served models use the Running models states everywhere, the hosting columns no longer reuse "Used by", the catalogue skill shows its "Latest commit", starting a session from an agent is "Start a session", stopping a turn is "Stop the turn", and error titles read "Could not …".
- 2b79a0c: Search palette: the results list scrolls with the arrow keys, so the
  highlighted result stays in view (a group's first result brings its heading
  along), also when results arrive late. It scrolls back to the top when the
  query or type filter changes, and a row only takes the highlight from the
  pointer when the pointer itself moves.
- 3373287: Render the question a session is waiting on. A session whose last turn ends by asking
  the user something showed nothing at all for that question — the timeline stopped at
  the agent's previous message, so it read as if the agent had trailed off mid
  conversation, with only the "Waiting for input" badge in the header hinting otherwise.

  The question fell between two paths that each assumed the other had it. The raw
  `ask_user` call **is** in `task.history`, but it is deliberately skipped as ADK plumbing
  (`INTERNAL_TOOL_NAMES`) on the grounds that the approval path renders it — and that path
  only ever read `history`. For an _unanswered_ question there is nothing there to read:
  kagent puts the pending `adk_request_confirmation` on `task.status.message` and nowhere
  else. Verified against a live session on an internal installation, where the pending
  message carries a `messageId` that appears in none of its task's history entries.

  So `status.message` is now appended as a final history entry when the task is waiting
  on it, which gets the existing approval handling — dedupe, part walking, the
  `ask_user` -> `asks: 'input'` discrimination, and the cross-task verdict tracking —
  without a second code path. kagent's own UI solves the same problem with two separate
  passes that are then concatenated; one list keeps the question in its chronological
  place instead of at the end.

  Gated on the state (`input-required` / `auth-required`) rather than merely on the
  message being present, which is what makes the card self-clearing. kagent's resume
  path settles this: a HITL decision resumes the **stored** task — `executor.go` takes
  the `StoredTask != nil` branch, emits `working` on that same task and appends the
  decision to its history, and `BuildResumeHITLMessage` will not even build a resume
  unless that task is currently `input-required`. So the asking task always leaves
  `input-required` once answered, the prompt stops being emitted from `status`, and the
  now-answered confirmation renders from history with its verdict. The question cannot
  appear twice, and cannot linger as "Awaiting a reply" after it has been answered;
  there is a test for exactly that overlap. The alternative — emitting whenever
  `status.message` exists — would also risk duplicating a terminal task's final message,
  which is what `status.message` holds once a task completes.

  **The question itself now renders as prose.** Making the row appear was not quite
  enough: `ask_user` arguments were only reachable by expanding the row, where they
  showed as JSON in a monospace, single-line-ellipsised slot built for tool payloads. A
  question is the last thing the agent _said_, so the approval item now carries the
  extracted `questions` and the entry renders them as markdown, numbered when an
  `ask_user` asks several at once. With the questions on the row there is nothing left
  behind the expander, so it renders as a plain row rather than offering a click that
  reveals a worse copy of what is already on screen. This applies to already-answered
  questions too, which had the same problem less visibly.

  Extraction is deliberately narrow — `questions[].question` strings and nothing else.
  A question rendered from a guessed field would put words in the agent's mouth, so an
  unrecognised payload falls back to showing the raw arguments as before.

- 2b79a0c: On an agent's Tools tab, the note introducing the Platform tools is an informational alert instead of a warning.
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

- 2d1f914: Explain unpriced models against agentgateway's built-in price catalogue. The gateway prices from the catalogue its release ships, with the platform's `llmRouting.modelCatalog` as an overlay on top (giantswarm/giantswarm#37975). The "Models with no usable price" card and the lookup-status metric description now say a model is `Missing` when neither prices it, and that the fix is a gateway release that prices it or an overlay entry.
- c65731d: Saving an agent no longer reports success before the change has been compiled.

  After Save, the detail page showed a green "Ready … (saved as you)" almost
  immediately — for the revision that was there _before_ the write. agent-manager
  writes the agent's HelmRelease and returns; helm-controller re-renders the
  AgentTemplate seconds later, so the first status read after saving an agent that
  was already ready answers `ready` about the old revision. Worse, the page then
  stopped polling, so if the new revision went on to fail it kept claiming Ready.

  The progress now waits for the revision the write produced: the template
  generation is read immediately before the write and the verdict only counts once
  it has moved past it and the controller has caught up. The wait is bounded at a
  minute, after which the current verdict is shown rather than a spinner that
  never resolves — which covers a release that cannot be reconciled at all.

  Creating an agent is unaffected: there is no earlier generation to compare
  against, so the verdict stands on its own as before.

- 2b79a0c: Agent wizard and session fixes from QA round 2: over the 32-selector cap, the
  Tools step no longer shows muster's raw "Could not resolve the toolset" dump
  beside its own message; the Review step summarises tools in words (selectors
  stay under Technical details) and shows no raw Harness name as the runtime;
  a session's turn markers read "Turn N · <time>"; the session title's rename
  hint is a native title instead of an MUI tooltip.
- 2b79a0c: On the agent wizard's Tools step, undoing a change to a preset-based toolset collapses it back to the preset, keeping what was added beside it, even after a round trip through another step, and a preset whose coverage cannot be read no longer shows its connectors as None. Leaving a session mid-turn ends its stream once the message has reached the agent, and a stalled turn reads "Not responding" instead of "Working". Pins, favorites and dismissed hints toggled in quick succession all persist, and pinning and favoriting are reported as `AgentPlatform.sessionPinChanged` and `AgentPlatform.agentFavoriteChanged`. A hand-off to a meta agent caps the draft it carries and refuses a prompt over the 32,000-character message limit before creating a session; that limit is now one constant in agent-platform-common.
- 2b79a0c: The "Could not read N environments" warning no longer shows above a list's
  loading indicator. On Customize → Agents and Models, Home, Sessions and Model
  hosting it appears once the list has something to show — its first rows, or its
  empty or failed answer — even while other environments are still being read.
  Model hosting no longer waits for its GPU node reads before showing the served
  models, and its "Could not read the downloads" warning waits the same way. A
  closed warning stays closed when the list reloads and fails the same way.
- a4c4ba2: The New agent review page shows the checks agent-manager's dry run could not
  make (`validate_agent`'s `notes`, such as the name-clash check for a person who
  may not read the namespace's HelmReleases) as an informational list beside the
  violations. Notes never withhold Deploy: the dry run is still valid. A dry run
  without notes renders as before.
- 2b79a0c: The link on a success message after a pull request is opened reads "Review pull
  request ↗" instead of "Open the pull request ↗", matching Add skill: the pull
  request is already open. This covers creating, editing and deleting an agent,
  Update skills, adding a model backend, adding and removing a GPU node pool, and
  creating and deleting a cluster.
- 808fb08: Agents: after a Deploy from the New agent wizard, the Agents list polls every 5 s until it lists the new agent (for up to three minutes, in that tab, across a reload), so the roster shows it within seconds of its `Agent` existing instead of after the one-minute poll.
- 30e503d: Agent avatars are rounded squares instead of circles. The corner radius is 20% of the width, so the shape is the same at every size.
- 052624a: The Serve dialog's body scrolls again and its Cancel / Serve model buttons stay
  inside the dialog on smaller viewports: the `<form>` that wraps the dialog's
  header, body and footer now passes the dialog's flex layout on instead of
  growing to its content height and pushing the footer off the screen. The
  session rename dialog gets the same layout.
- b65a95b: Serve dialog: the chosen preset (and the installation) stays while the Serving page refreshes. Every poll of the served list passed a new list of targets, which re-seeded the dialog and reset the preset to the first one within seconds, before a slow fit check could finish; the dialog now re-seeds only when it opens, gets a new seed, or the set of targets changes.

  A split's fit verdict says its requirement is per node: "needs 69 GiB on each of 2 nodes (98.6 GiB of weights split 2 ways + 20.0 GiB of serving headroom)" (model-manager reports a split's `requiredBytes` per node).

- 9c69597: Serve model and the Serving list say what happened. A preset that serves already shows as "Serving on <node>" and cannot be served again; a Serve ends in a toast naming the node, and model-manager's "already serves" answer is shown as such. A model in its normal start shows Starting instead of a red Not ready (a crash loop stays red), and a stopped model leaves the list without a reload.
- 6052701: GPU node pool serve intent: the served model's steps appear beneath **Serving <preset>** with the read that follows `load_model`, and keep moving while the tab is not focused — no reload needed. Once `load_model` was asked, the portal re-reads the installation's model-manager backends and inventory at once (the inventory read is gated on the backends list, which predated the pool's registration of its backend), and model-manager's reads — backends, inventory, node view — poll in a background tab like the pools read does, so a served model's timeline on the pool panel and the Serving view moves whichever tab is in front.
- 9e84495: Serve model: choose the node. The dialog gets a Node field: "Any node that fits" (default) and each node with its free memory budget, fed by a fit check per node; a node the preset cannot land on is listed disabled with the reason. A chosen node is sent to model-manager as the hostname pin, and the verdict reads "Fits — will be placed on <node>"; unpinned it reads "Fits on A and B", never one node the request does not pin. A preset served from its model image reads "served from the model image", shows no download on a node that holds the image, and the GPU capacity table marks a node pinned out by the cache claim as a serving target for model-image presets.
- 4dfd71d: A ModelConfig is linked to the served model it fronts ("Served by Ollama
  model …", the Serving view's Used by column, the auto-wiring) by the
  `hostname:port` of its endpoint where the backend shares its host with other
  servers, not by the hostname alone: a client of another OpenAI-compatible
  server on the same machine (a Lemonade server on `:13305` beside Ollama on
  `:11434`) is no longer read as served by the one Ollama model that happens to
  be there. The model-manager source lists Ollama rows under the backend's
  client-facing address (`agentEndpoint`, model-manager 0.8+, else
  `endpoint`); KServe predictors keep matching by hostname in every form.
- 335f7fe: The agent's name in a session's header now links to that agent.

  A session page named the agent that ran it but offered no way to reach it — the
  only route to the agent's own page was back through the Agents tab. The name is
  now a link, so a conversation leads to the agent's configuration, tools and
  skills in one click.

  It stays plain text when no `Agent` resource matched the session, which is the
  case for an agent that has since been deleted: the name shown there is a decode
  of the session's stored agent id and names nothing that can be looked up.

- 6ab4cbf: Session details: the user's messages are bubbles in the portal's primary colour instead of a neutral fill behind a hairline border, so a person's own turns read as active in the conversation; the colour follows `app.branding.theme.<mode>.primaryColor`, so a white-labelled portal keeps its own. **Start a new session with &lt;agent&gt;** moves out of the message box to its own right-aligned row beneath it — it leaves the session rather than being one of the box's controls — and the bottom dock gained the gap it was missing, so a lost-runtime notice or a rejected send no longer sits flush against the composer.
- 2b79a0c: The _Delete session_ dialog now says what a delete actually does on kagent: the session's runtime is shut down and the session can no longer be listed or opened, while kagent keeps the record and its conversation in its database, with no way to restore it from the portal.
- dfce475: Fix six defects found reviewing the session detail page.

  - **A click on a session title navigated twice.** The Sessions table has both an
    anchor in the title cell and a whole-row click, and react-aria's row press fires
    for a press anywhere in the row — the anchor included. So one click navigated
    twice: two identical history entries, meaning Back needed two presses to return
    to the list, and with cmd held the session opened in a new tab _and_ took the
    current tab with it, which is the opposite of why the anchor is there. The title
    anchor now swallows the press (`pointerdown`/`pointerup`, which is what
    `usePress` listens to) so exactly one of the two affordances acts on any click.
  - **A wholly unreadable session claimed to be empty.** The timeline's "N messages
    could not be read" warning sat below an early return for an item-less timeline —
    so the one case it exists for, every history entry failing to parse, reported
    "This session has no messages yet." and never warned at all. The warning now
    renders in that branch too, with wording that does not deny the messages existed.
  - **A blank text part could still lose an `ask_user` reply.** The reply is recovered
    from `ask_user_answers` only when the decision message carries no text part, but
    the check counted a `{ text: "" }` part as words while the renderer drops text
    that trims to nothing — losing the answer both ways. The check now agrees with
    what actually renders.
  - **A `call_tool` shape change would have dropped a call's arguments.**
    `unwrapProxiedCall` promised to degrade to showing muster's proxy rather than
    losing a call, but keyed only on the inner `name`: had muster renamed or nested
    the inner arguments, every proxied row would have named the real tool with its
    arguments silently `undefined`, rendering as an entry with nothing to expand.
    Unwrapping now also requires that the payload carries no key beyond `name` and
    `arguments`. An argument-less proxied call (`{ name }` alone) still unwraps.
  - **Turns were keyed on `taskIndex`.** `groupIntoTurns` deliberately emits two turns
    with the same index if a task index ever repeats non-contiguously, which made the
    React key ambiguous — one turn's entries could reconcile under the other's
    timestamp. Keyed on position now.
  - **A known 404 sat behind a spinner.** "Not found" is decided by the session read
    alone, but the loading flag waited for the tasks read too, so a missing session
    stayed on a spinner for the whole retry ladder — or the fetch timeout on an
    unreachable installation — with the answer already in hand.

- d6bec76: Add `GET /kagent/session-states`, which reports the derived state of each of the
  caller's sessions on one installation. Nothing renders it yet — the session
  switcher rail is the consumer.

  **The first route here that interprets kagent rather than forwarding it**, and the
  exception is arithmetic. A kagent `Session` carries no state; the only way to learn one
  is to read that session's whole conversation and look at its newest task. Measured
  against a real 21-session account on an internal installation, that is **2.8 MB**
  (individual sessions 1.6 KB–481 KB) to produce about 700 bytes of answer — not something
  to do in a browser, on a poll. It derives through the same parser and the same state map
  the UI badges from, shared from `agent-platform-common`, so the two cannot disagree.

  **There is no bulk endpoint, and this was checked, not assumed.** On kagent 0.9.9
  the A2A `tasks/list` returns `-32601 METHOD_NOT_FOUND`, while `tasks/get` on the
  same endpoint reaches a decode error — so it is method dispatch, not transport.
  `GET /sessions/:id/tasks` ignores `limit`, `order`, `sort` and `after` outright,
  returning byte-identical payloads; and tasks come back oldest-first, so even a
  working `limit` would read the wrong end.

  The response separates four facts a rail renders differently: a reported state, a
  `null` state (has tasks, none reported one — created and never run), an id in
  `unreadable` (the read failed, so the state is genuinely unknown rather than
  terminal), and a `skipped` count for sessions never evaluated. Terminal states
  come back unfiltered; which ones are non-terminal is a question the frontend
  already answers with the same map.

  Bounds, all overridable under `agentPlatform.kagent.sessionStates` and
  deliberately not query parameters, since the fan-out is a cost lever the browser
  must not be able to widen: subagent sessions dropped, then a 7-day activity
  window, then newest-first capped at 20. Reads run through a **sliding** pool of 4
  rather than batches — payloads span two orders of magnitude, so a batch would run
  at the pace of its largest member — with 5 s per read and an 8 s pass deadline
  that sits under the frontend's 10 s poll. A complete pass measured ~500 ms.

  The window is generous on purpose: a session in `input-required` is blocked on a
  human and can sit for days, which is precisely what the rail exists to surface.
  The cap is the real bound.

  Every read is caught individually, so a session deleted between the list and the
  read costs that row and not the rail. Failures are logged at `debug` as a count —
  a partial read is the expected outcome this route is built around, and `warn`
  would forward it to Sentry — and the route answers **200 even when every task
  read fails**, since a 5xx would reach Sentry through `MiddlewareFactory`
  regardless of our own log level.

  Summaries are cached in process for 15 s, keyed by a hash of the caller's token:
  the TTL must exceed the frontend's 10 s poll or it buys nothing, and the token is
  exactly kagent's own scoping key, so a rotation or sign-out makes an entry
  unaddressable rather than stale. Concurrent polls share one fan-out; a failed
  pass is not cached. Not `cacheService` — that is a pluggable store, and pointing
  it at Redis would put per-user chat-derived data somewhere that outlives both the
  process and sign-out.

  One optimisation is deliberately left out: if kagent bumps `session.updated_at`
  on every task write, terminal sessions could skip their re-read entirely. That is
  unverified, so it is not in the baseline.

- 69bba88: The Sessions page keeps showing its loading state, not "No sessions found.",
  while a failed read waits to retry (for instance in a background tab).
- 2b79a0c: Sessions and the new-session home work on a phone. All Sessions, and an agent's Sessions tab, list stacked rows at phone width instead of a table that left the title ~31px: the title (the link, wrapping to two lines) with its pin and ⋯ menu, then the agent, state, environment and start time under it; the agent's tab shows a page of rows at a time instead of the table's paging. On touch input Enter breaks the line in the session composer, the home composer and a question's answer box, and the Send button sends; the captions say "Tap …" instead of naming Shift+Enter, and the soft keyboard's Enter key is labelled to match. While the agent waits on a question or a permission, the disabled message box folds to its one-line caption (the cost chip stays beside it), and the card's proposed arguments scroll with the card instead of in a box of their own, so the conversation keeps its room. The session's docked composer publishes its height, so a toast lands above it. Tool payloads and reasoning scroll in boxes no taller than two fifths of the view. The command palette's agent rows carry a "Start a session" button on touch, and its keyboard hints are left out there; the new-session dialog is full screen on a phone. The home page no longer scrolls by its own bottom margin, the Slack banner leaves out its decorative thread on a phone, a long email wraps on the profile, and the shell's sign-in page fills the dynamic viewport.
- 6fe3050: Sessions list: drop the Last activity column, which kagent API v2 never updates
  after a session starts, and sort by start instead; the session page drops "last
  activity" and Duration for the same reason. Pressing Start or Enter with no agent
  chosen now says so and focuses the picker instead of doing nothing. The list has
  its own "Your sessions" heading and drops the intro line above the page, session
  titles stay on one line in a wider column, and with one installation pinned (or
  only one running kagent) the Installation column is left out. A session whose
  state was not read says "Not loaded" rather than showing a dash, and a search
  with no match names the term.
- fda0620: The Sessions page names why an installation could not be read (authentication
  failed, permission denied, timed out, unreachable, server error) and the request
  id of the failed call. The backend sends that id toward kagent as
  `x-request-id` and logs every failed session list with its call, status, code
  and request id, so a failure can be matched with the gateway's logs.
- 3e4bc2a: Withhold Create, Edit, Update skills, Delete and Start session, and leave the agent out of every session picker, on an installation whose muster has no per-user sign-in in this portal (`requiresAuth: false`), lists no agent-manager, or could not be asked; each place says why instead of offering an action that ends in a 403.
- 28d3fe0: Withhold the cluster-manager, model-manager and workspace-manager actions, and a lost session's "Start a new session", on an installation whose muster has no per-user sign-in in this portal (`requiresAuth: false`): Create cluster and Delete show disabled with the reason, Model hosting and the Workspaces tab say why above or in place of what they list, and the lost-runtime notice names the reason instead of offering a session that ends in a 403. Every manager the portal reaches through muster is now gated this way by default.
- 2b79a0c: Status cells keep to a few words; the explanation moves into a hint a press
  opens on a touch screen too. The Serving table no longer prints the
  backend's explanation (the scheduler's "0/3 nodes are available: …") under
  a troubled model's label, and a failed pull reads "Download failed" with the
  error in the hint. GPU capacity shows why a node is not a serving target in
  the hint instead of under its name on phones and touch screens. Customize
  Agents no longer prints a not-Ready agent's reason in its row on a phone;
  the agent's page says it in full. A GPU node pool whose failure message has
  no short reason reads "failed".
- 9ea8cf0: The toast after deleting an agent, and the one after updating its skills, say only what the person cannot see for themselves — that the uninstall is under way and the row may linger for a moment. The caller's own address and agent-manager's reason for keeping the namespace's shared chart source, which listed every other release referencing it, are gone.
- 2b79a0c: Editing a skill that has more files than its SKILL.md lists them under the Instructions field: "These N files stay as they are", each linking to the skill page's file viewer in a new tab, plus "Edit on GitHub ↗". A link in the instructions to a file the skill does not have gets a quiet warning. The hand-off to the skill creator agent now also carries the instructions typed so far (on an edit, the ones rewritten) in its first message.
- 2b79a0c: A skill whose `SKILL.md` the portal cannot read no longer offers _Edit_. Its page and the edit address say "The portal cannot read this skill's source" instead of ending in an error. _Evaluate_ and _View source_ stay.
- 2b79a0c: The "Use your agents right in Slack" banner has a "How it works" button that
  opens the installation's guide in a new tab: `agentPlatform.integrations.slackDocsUrl`
  where a platform admin sets it, Giant Swarm's docs otherwise. The new key is
  part of the signed-in config.
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

- a021ef9: A Stop that fails on the session page is reported as **Stop failed** with the
  backend's message, no longer as "Message not sent" — the turn it aimed at is
  still running, and the old wording said the opposite of what happened. A 401
  (the tab's token no longer verifies, seen when the Backstage pod rolled while
  the page stayed open) adds that reloading the page signs the tab back in, after
  which Stop works. Tests cover the case that had no Stop at all before the
  stalled-turn change: a task still `working` on the server whose state has not
  moved for the age bound keeps Stop after a reload and when it goes stale under
  the open page.
- e1f1c38: A session page no longer stays on "Working…" for good when the turn's live
  stream dies although the task has completed. When the stream ends before it has
  delivered the end of the turn — cut by an intermediary such as Envoy Gateway's
  default 15 s route timeout, closed with an error, or hanging open after the
  task finished — the page treats it as **lost** rather than as still working: the
  row under the conversation says "The live stream was lost. Checking the result…"
  while the conversation is re-read, then "Still working; the reply appears when
  the turn finishes" if the task really is still running, and shows the finished
  turn as **Completed** with its full answer, no reload needed, as soon as the
  poll reports it. A stream still open when the poll already shows its task over
  is aborted, so a hung request can no longer hold the page. Stop stays available
  throughout, and a task that is genuinely running is never shown as finished.
- 2bb7acd: On a session page, a tool call's result shows as soon as it streams in, and a
  reply is never shown cut off where a background read happened to catch it. The
  stored copy of an item now takes over whatever the live preview already knows.
- 839cf0a: Fix the live session timeline rendering a streaming turn out of order.

  While a turn was in flight, its tool calls became timeline items immediately but
  its text sat in two flat buffers the page appended after _every_ item. Three
  things followed from that, all visible on a session running more than one tool:

  - **Tool rows overtook the sentences that introduced them.** kagent's Python
    executor puts a message's text part and its `function_call` in the same
    `status-update`, text first, so every such pair rendered inverted — a busy turn
    showed a block of tool rows with all the prose collected underneath, then
    snapped into chronological order when the poll delivered the real history.
  - **Consecutive agent messages rendered glued together**, the end of one running
    straight into the start of the next with no separator, because the buffer
    accumulated across message boundaries.
  - **A sentence said before the agent went to work could disappear**, because the
    terminal event cleared the buffers wholesale on the assumption they held only
    that message's own chunks.

  The two buffers are replaced by a single open text run that holds a position in
  the item list. Anything else that arrives — a new message, reasoning giving way
  to a reply, a tool call taking an item slot — closes it first, so "items, then
  the open run" is chronological by construction and the page appends rather than
  sorts.

  The same invariant now holds on the artifact path the Go executor uses: text
  parts are appended as they are read, so a `function_call` later in the same event
  cannot overtake them, and an artifact's closing sentinel no longer discards a run
  that belongs to a message rather than to the artifact stream. A message that
  emits items _and_ leaves a run open — text, a call, then more text under one
  `messageId` — keeps that trailing text, which the terminal event used to drop on
  the strength of a complete copy that is skipped as already rendered.

  Following the reply as it streams now keys off the turn's own event counter
  rather than a size derived from its content, which was not strictly increasing:
  closing a run hands length from the open text to the item list, so a real update
  could leave the number unchanged and skip the scroll for it.

  Streamed items now also carry the `messageId` of the message they came from, and
  `buildTimeline` stamps polled tool-call items with theirs. Both halves of the
  existing recognise-and-drop dedupe therefore line up, which removes the frame
  where the reconciled history and the still-mounted preview rendered the same turn
  twice.

- d7c8277: The session page no longer shows the agent's latest reply, or a tool call it
  just made, twice while the turn finishes. The live preview now carries the id
  kagent stores that output under, so the stored copy replaces it.
- 8bcea5e: The system prompt field on the create and edit pages counts characters against
  the 20,000-character limit agent-manager and the agent chart enforce, and points
  to skills for long reference material. Past the limit the field is marked
  invalid and says by how much; the create wizard stays on Details and the edit
  page keeps Save locked. Characters are counted as agent-manager counts them
  (code points), so an emoji counts once.
- e807fa6: Agent details: the system prompt renders as Markdown instead of raw source in a
  code block, and a long prompt is cut to a preview with **Show full prompt**.
  The copy button in the card header still copies the source verbatim. The copy
  buttons of code blocks and session payloads are ui-react's `CopyButton`, so a
  failed copy is reported instead of failing silently.
- 54925ab: Agent detail, Tools tab: the Toolset card no longer greets every visitor with "Toolset not readable" before the toolset loads. While the agent's carrier `RemoteMCPServer` is being read the card says it is reading it, and it waits for the read's own terminal state rather than for `isLoading` (still false on the render before a query starts fetching) or for `errors` (which a rejected installation's failure never reaches, so the card would have waited forever). Once the read has answered, the two causes it used to conflate are told apart: **Toolset not readable** when the namespace's `RemoteMCPServer`s could not be read at all — naming the namespace and installation — and **Gateway server missing** when the read came back without the server the agent binds the gateway through. The resolved list's own wait now holds itself back the same way, so a resolution served from cache, or one selector toggled in the create and edit flows, no longer flashes an indicator.
- 3980275: Toolset presets are shown by their label — _Read-only tools_, _No tools_,
  _Full gateway_ — instead of their selector (`preset:read-only`) in the agents
  list's Toolset column, on the agent's Toolset card, in the edit form and on the
  create flow's Tools and Review steps. The selector stays in view as the second
  line, the row's meta or the chip's tooltip. A preset without a label (one the
  installation defines), and server, workflow and tool selectors, are shown as
  written.
- 83cc49a: **Try it** on a served model sends the model id the ModelConfig sends — `spec.model`, the name vLLM serves the model under (the Hugging Face repository) — instead of the serving object's name, which vLLM answered with 404 "The model `<name>` does not exist". The served model's ModelConfig now carries that id from model-manager's inventory.
- 2b79a0c: The agent wizards keep the model's name (a platform admin may name a model on
  purpose rather than after what it runs) and show the model it runs one step
  away: an info button beside "Runs on …" on the first step, and an "Underlying
  model" line in the review step's Technical details, for new and edited agents
  alike. The agent page's overview names the model the same way, with the model
  it runs below the name instead of in its place.
- 2b79a0c: Update all skills to latest no longer offers a pull request agent-manager cannot open. For an agent applied from Git, once the dialog shows skills that would move and no violations, it also runs agent-manager's commit dry run, which checks the repository, and says so while it runs; the table then shows the pins that dry run would commit. When agent-manager has no file for the agent's HelmRelease in its directory, the dialog names the release, the file agent-manager looked for and the repository, says to change the pins in the file that defines the release, and disables **Open pull request**. The same explanation replaces agent-manager's raw `conflict` message when the write itself is refused that way.
- 2b79a0c: In Update all skills to latest, the Skill column puts each skill's repository on its own line under the name, instead of running the two together.
- 2b79a0c: Usage and model hosting read on a phone.

  - **KPI tiles:** at phone width the headline tiles sit two across instead of one per row, so the Usage tabs, model hosting and the agent and model pages no longer open with 400–500px of tiles.
  - **Cost tables:** at phone width By agent keeps the agent and its cost, and By model keeps the model, its cost and average tokens per call. A model id wraps to two lines instead of being cut to a few letters. Before, five or six columns were squeezed until the amounts were clipped. Models with no usable price keep the model and the reason. The model a client asked for appears under the model that answered, and the reason wraps instead of being cut off.
  - **Your sessions, By agent:** at phone width the table keeps the agent, its sessions and the estimated cost. A cost the agent's runtime reported appears under the agent's name.
  - **Removed agents:** what the Removed mark means now opens on a tap. Before, it was only a hover title.
  - **Busiest agents:** at phone width a long agent name gets its own line and wraps, with the share bar under it.
  - **Time range:** on a phone or touch screen, Your sessions says beside the control why the longer ranges are off. Before, the reason was only a hover title on the greyed buttons.
  - **Activity heatmap:** a day can be selected with a tap, a click or the arrow keys, and its figure appears under the legend. Before, a day's figure was only a hover title. Cells are bigger at phone width.
  - **Running models:** at phone width each model is a row of its own. The status and its explanation, where it runs, the features and APIs in words, and what uses it sit under the name. The actions menu stays at the row's end. Before, up to ten columns squeezed every cell and clipped the menu. A long endpoint in a backend's header now truncates instead of widening the card.
  - **GPU pools:** at phone width each pool is a row of its own, with the lifecycle chevron and a ⋯ menu holding Remove pool. Before, Remove pool and the chevron were clipped off the table.
  - **Model cache:** at phone width each claim is a row of its own, with Remove cache in a ⋯ menu. A read-only claim says why in words.
  - **GPU capacity:** at phone width the table keeps the node and its free GPUs. The GPU, its count and memory, the budget and the cache appear under the node. On a phone or touch screen, a node that is not a serving target says why under its name instead of only on hover.

- 2b79a0c: The agent page's header button reads "Use this agent". Everywhere else, including the agent's Sessions tab when it has no sessions, starting from an agent stays "Start a session".
- 2b79a0c: The create-agent wizard fits a phone. The assistant chat ("Let Swarm Operator help") keeps its draft and its conversation when it is closed and opened again, at every width; on a phone, or wherever the form has no room beside it, it is a full-screen dialog with the page behind it inert, closed by Escape or "Back to form", with a one-line header, a composer capped at four lines and room for the home indicator. Beside a wide form the wizard keeps its step and footer clear of the chat instead of sliding under it. The Tools step's "Selected so far" bar is one line on a phone ("3 selected · Resolves to 42 tools for you") that opens to the chips, instead of a sticky block that left the catalogue little room; a long selector wraps inside its chip, and each remove button has a 44px target. On the review step "Propose as pull request instead" moves from the footer into the page at phone width, and an edit's "Propose changes as pull request" shortens to "Propose as pull request", so the footer keeps to one row.
- 2b79a0c: The new-session screen and the agent page's Connectors section name an
  agent's reach by connector instead of tool ids: "Can use kubernetes", "Can
  read from github" or "Can use some tools from cluster-manager", combined in one
  sentence, with muster's own tools called platform tools and long lists ending
  in "and N more". The new-session line links to the chosen agent's tools.
- 2b79a0c: Agent shell on a phone (T22 wave 1B):

  - **Bottom bar**: five labelled items — New session, Sessions, Search,
    Customize, Profile — each a 48px-tall target with its label under the icon
    and the current one marked along the top edge. Usage and the Platform Portal
    link move into the Profile menu, and Profile is marked current on the pages
    only its menu leads to.
  - **Typing a message**: on a touch screen Enter starts a new line and the Send
    button sends; a keyboard keeps Enter to send and Shift+Enter for a new line.
    `isSendKey` answers for the input in use, and `sendKeyCaption` /
    `sendEnterKeyHint` word and label it for the box.
  - **Form fields** are 16px at phone width, so iOS Safari no longer zooms into
    a field on focus.
  - **The bar steps aside** while a text field has focus on a touch phone, so
    the soft keyboard does not leave it eating the conversation's height.
  - **Toasts** sit above the bottom bar, and above the session's docked composer
    wherever the page publishes its height.
  - **bui tables** that still show four or more columns at phone width scroll
    sideways inside themselves instead of clipping their values and action
    buttons, and their sort arrows show on touch screens.
  - **Recent sessions** in the rail keep their pin button visible on touch
    screens, which have no hover to reveal it.

- 2b79a0c: The shell rail's session lists highlight the current and the hovered session across the rail's whole width, with the pin button inside the highlighted row instead of beside a shortened one. A click anywhere on the row outside the pin opens the session.
- 2b79a0c: Customize's Agents tab shows the Harness of each agent and filters by it, as the classic agents list did, once the agents run on more than one Harness. Its search also matches the Harness name and title.
- 2b79a0c: The agent detail page keeps re-reading an agent's status every 5 s after
  agent-manager reports it failed, and stops once the agent is ready, so a
  failure that clears by itself right after a create turns into Ready without a
  reload.
- 2b79a0c: An agent's Overview folds its Kubernetes detail (GitOps, configuration, status, the resource's name, Harness, revision and skill pins) into a "Technical details" fold-out in place at the bottom of the page, replacing the "Show technical details" switch. It still starts open for an agent that is not ready.
- 5d5877a: The agent's tenant reads as its Organization: the organization's plain name
  under the label "Organization" on the agent's page and in the Agents list's
  rows and filter, or "None" for an agent of the platform, with an info icon
  saying it is available to all organizations ("None" in the filter too).
  Sentences, empty states and refusals say "the platform" or "the acme
  organization" instead of "tenant". The New agent form offers Platform,
  Organization and, for a managed namespace that is no organization, Other
  namespace as choices where the person may create in more than one kind;
  Organization lists the organizations by name, without the `organization `
  prefix. The choice goes with the environment. An Agents list row's link is now
  the agent's name, its hit area still covering the row.
- 69782ef: The create wizard shows an agent of an Organization's tenant the platform
  Harness as its only runtime, and no "Could not read the runtimes" warning for
  the platform namespace. It creates the agent in the tenant it names: a model
  preselected before the tenant was known no longer puts it in the platform
  tenant (#3189).
- 4ec284d: The agent page's Toolset card says how muster holds the agent to it. Where
  agent-manager binds the toolset to each session at its start (`get_info`
  reports `toolsetBound`), it reads "Bound to each session at its start. A
  change applies to new sessions."; elsewhere it reads as declared, with the
  caveat that a process in the agent's sandbox that omits the X-Muster-Toolset
  header is not held to it. Both add that a toolset is composition, not
  authorization. The implicit-full-access and full-preset labels are unchanged.
- a56114f: Agent detail, **Update all skills to latest**: when agent-manager cannot open the pull request because the agent's HelmRelease is not in the file it edits, the dialog now says so as information under the skills table, where the loading line was: "Skills cannot be updated here", what to do in plain words, and the HelmRelease, file and repository in smaller text after it. The dialog then offers only **Close** instead of a disabled **Open pull request**, and its title no longer asks a question. A skill that moves has a copy button for its full head commit, for pinning it by hand.
- 2b79a0c: The "Update all skills to latest" dialog shows placeholder cells and a progress
  line while agent-manager works out the plan, and its table keeps its column
  widths when the pins arrive.
- 2b79a0c: Tools step: a change below a preset no longer writes the preset out tool by
  tool. While everything the preset covers stays chosen, the toolset is stored as
  the preset plus what was added (for example `preset:read-only` +
  `server:agent-manager`), so read-only access everywhere plus full access to one
  connector fits the 32-selector limit. Only taking part of a preset away writes
  it out, because selectors cannot subtract. A toolset that is a preset plus more
  now shows both in _Which apps?_. Over the limit, the error names the connectors
  that list the most selectors instead of asking for a preset.
- 2b79a0c: New-agent wizard: the model moves behind "More options" next to the runtime,
  technical name and egress, so step 1 shows only the name, what the agent is for
  and its instructions. The installation's default model (`default-model-config`)
  is preselected when there are several, else the only one or the first listed;
  the picker says which was preselected and why, and a line under the fields
  names it ("Runs on … · change under More options"). A missing model opens More
  options on Continue. The review step is unchanged.
- 89dc2ed: An Agents list row names an organization's agent's organization as
  "Organization: acme", beside the agent's name, so it is not read as the
  environment among the facts, and a platform agent's row no longer shows a
  "None" and an info icon without a label. Pointing at a row shows its name and
  organization in full. Every row of the list has the same fact columns, which
  stay on one line beside the name or under it on every row alike, so
  organization and platform agents' rows line up. The agent's page and the
  Organization filter keep "None". The name, the organization and the facts each
  sit on one baseline.
- 3452758: A failed agent read no longer shows as "No agents yet". When muster cannot say
  which namespaces an environment's agents live in and the platform namespace
  lists none, the environment counts as unread instead of read with no agents.
  The home then shows "Couldn't load your agents" with a Retry button, which
  reads the agents and muster's namespace answers again; "No agents yet" appears
  only after a read that succeeded and found none.

  A page load right after an agent list changed no longer shows the list as
  it was before the change: the lists restored from the browser are read again
  on the first load, and a restored empty list waits for that read instead of
  showing "No agents yet".

- af67bbf: Retry on "Couldn't load your agents" asks the controller again which namespaces
  hold the person's agents, along with muster, so a failed answer from it no
  longer outlasts the retry.
- 9e00143: Muster's server and workflow dialogs (confirm, edit as JSON/YAML, manifest) use
  bui instead of MUI. Confirm buttons are red only for deletes: saving an edit,
  activating, deactivating or reconnecting a server, stopping a served model and
  cancelling a download no longer get the destructive treatment.

  `ConfirmDialog` can no longer be closed with its header button while busy, and
  keeps line breaks in error messages. ui-react exports `useOnDialogOpen`, which
  resets a controlled dialog's state when it opens, and `ALERT_MESSAGE_STYLE`.

- 698fb08: Show an error when kagent does not take an answer to the agent's question. An answer whose stream said nothing (a 202, or an empty stream) used to count as sent: the button came back and nothing else happened. The session is now read until the answer shows up in it. If the same question is still open without it after 15 seconds, the session page replaces the question card with "Could not resume this session" and offers a new session with the same agent instead of a retry. The new session starts with the conversation so far (messages, and tools by name), the open question and the answer, within the message size limit, and the notice says what it will carry. The new session's page shows a "Continued session" banner linking to the session it continues.
- fd4dc77: Handle a cluster in the Deleting state on the cluster details page. The page
  says the cluster is being deleted and since when, and it no longer reports
  objects the deletion already removed (a control plane, provider cluster, AWS
  identity or node pool not found) as errors, neither in the error panel nor as
  error icons in the About card. Other errors, such as missing permissions or an
  API the installation does not serve, are still shown. A cluster being deleted
  whose App or HelmRelease is already gone opens from its Cluster resource
  instead of failing with a not-found error. While the deletion runs, the page
  re-reads everything it shows every 10 seconds and shows "Cluster not found"
  once the cluster is gone; a re-read that fails for another reason keeps the
  cluster on the page and says why. A live cluster is re-read every minute, so a
  deletion that starts while the page is open is noticed. **Delete** is no longer
  offered on a cluster already being deleted, and a Delete dialog left open stays
  open through the deletion, for its **Finish removal** step.

  - `gs`: `ClusterPageTarget` has `isDeleting`.
  - `kubernetes-react`: `ErrorsProvider` takes an `ignoreError` predicate that
    leaves matching errors out of its list, the `ErrorItem` type is exported,
    `k8sResponseError` names the object a 404 did not find (`notFoundName`), and
    `isObjectNotFound(error)` tells such a 404 from one for an API path the
    apiserver does not serve.

- 2b79a0c: Condense UI copy: the agent platform's descriptions, helper lines, empty states, hints, alerts and dialogs say only what the surrounding UI does not already make clear, and every sentence is complete and grammatical (no half sentences or telegram-style cuts, e.g. the skill form's hand-off banner).
- 99cede2: Every connector, tool and workflow link names its installation. The search
  palette lists a connector once per installation it is registered on, with the
  installation beside it, and opens the connector there. A connector's Edit opens
  the wizard with `&installation=<inst>`, and the wizard edits the server on that
  installation before falling back to the active one.
- a2443de: Every tool of a connector opens on a page of its own under the connector
  (`/agent-platform/connectors/<connector>/tools/<tool>`): what it does, its
  description under "What it’s for", input schema, the form that runs it and the result, in one
  column. The connector's Tools tab lists its tools as links to these pages
  instead of running them in place. Going back from a tool, by the breadcrumb or
  the browser's Back, keeps the tab's search and filter; Back also keeps how far
  the list was paged.

  A tool's markers read as the Tools list words them everywhere, "Reads" or
  "Changes things", never "read-only" or "destructive"; the agent wizard's tool
  catalogue drops its extra "destructive" marker beside the "Changes things"
  badge.

- 884bd42: A connector's Used by tab names each agent as a link to the agent's page.
- 2b79a0c: A blocked Continue or submit in the create flows (new agent, add connector, add skill and edit skill, add model) now marks the fields that are wrong: a danger edge on the field, the reason right under it (tied to it with `aria-invalid` and `aria-describedby`), and the keyboard focus on the first one. The generic "Please fix the following" box is gone, except for the few problems no field on the step can show. Add skill no longer greys out its button while fields are missing; pressing it shows which ones.

  `ui-react` adds the shared mechanism: `useFieldValidation`, `fieldErrorProps` for bui text fields, `useSelectFieldError` for bui `Select`, `FieldErrorText` for hand-rolled fields, and an optional `describedBy` on `SelectableCardGrid`.

- 4ea4c78: A session's egress refusal says what the person can actually do for its agent: a coding Harness (toolchains, or the platform team), an agent defined in Git, an editor to ask, or the edit page, and nothing while the agent is read. The agent form shows no Extra egress origins on a coding Harness and clears typed ones on a move to one, and the review step and Change Harness lead a `validate_agent` refusal with what to do, agent-manager's words folded.
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

- 2b79a0c: Skill discovery (`GET /agent-skills`) gains a second provider: a repository in `agentPlatform.skills.repositories` that is not on github.com is now read over the plain git protocol — a depth-1 clone via isomorphic-git, every `SKILL.md` frontmatter parsed from the checkout — instead of being refused. That removes the GitHub REST API (and its 60-requests-an-hour anonymous rate limit) from the portal's skill catalog for any self-hosted or lab-local git server (Gitea, `git http-backend`); github.com repositories keep going through the REST API as before. To keep the backend from cloning arbitrary URLs, a non-GitHub repository must be one of the configured `agentPlatform.skills.repositories`; its failures are forwarded with their upstream status (missing ref → 404, refused fetch → the server's status, unreachable host → 502), like the GitHub provider's.
- 2b79a0c: Skills are their whole directory now, not only `SKILL.md`: discovery lists every skill's files (GitHub from the tree it already reads, generic git from its checkout scan; a nested skill's files belong to it; at most 200 per skill, with `filesTruncated`), and each listed skill carries a `fileCount`. `GET /agent-skills/content` answers the list next to the instructions (`files`, `filesTruncated`), and the new `GET /agent-skills/content/file` answers one listed file of a skill at its commit — text up to 512 KB inline, binary and larger files as metadata only — immutably cached in the browser and in a size-capped server cache. A file outside the skill's list is never served. Generic-git repositories are answered from what the scan kept, not a clone per file. The agent-platform plugin gains the matching types (`SkillFile`, `SkillFileListing`, `SkillFileContent`, `DiscoveredSkill.fileCount`).
- 2c6f671: The wizard's runtime picker, the review page and the agent status card no
  longer show a Harness's per-turn limits: kagent's Harness carries no budget or
  turn cap any more. `ClaudeHarnessLimits` and `Harness.getLimits()` are gone.
  A turn's reported usage and cost still show in the session view.
- e447f16: Home explains an empty agent picker the way Customize › Agents does. When
  every environment in scope answered without kagent, the new-session composer
  gives way to the same "kagent is not installed on <environment>" card with "Go
  to Installations", instead of "No agents are deployed on the reachable
  environments." Where the environments that run kagent are switched off in
  Cluster access, where none in reach runs kagent, and where the portal knows no
  environment, Home says Customize's sentence; where an environment could not be
  asked whether it runs kagent, Home leaves it to the same inventory gate,
  including for an environment other than home. `useAgents()` now carries what
  both pages read: `kagentMissing`, `kagentSwitchedOff`, `unknownPin` and
  `inventoryFailure`.

  gs exports `installationsWithComponent` (what the inventory's
  `installationsWith` answers) and `installationsSwitchedOffWithComponent`, next
  to `installationsWithoutComponent` and sharing its test of whether an
  installation runs a component.

- 8402eee: Serve installation configuration (`gs.installations`) from the `gs-backend`
  plugin through a new authenticated endpoint, and load it in the frontend after
  sign-in instead of reading it from static frontend config. The boot-time
  frontend APIs (Kubernetes, discovery, auth) now obtain installation data
  asynchronously from a shared source, and per-installation auth providers
  initialize lazily once the main sign-in completes.
- b820660: `@giantswarm/k8s-types` moves to v0.10.0: the kagent API v2 types
  (`kagent.dev/v1alpha3`) come from the kagent line's release v1.2.5, the line
  the Agent Platform runs; bounded arrays are plain arrays instead of tuple
  unions, which shrinks the AgentTemplate types from 395 KB to 13 KB; and every
  API group version is an entry point of its own (`@giantswarm/k8s-types/crds/<group>/<version>`).
- 871a9cb: `@giantswarm/k8s-types` moves to v0.12.0: the CRD types follow the versions
  deployed on Giant Swarm management clusters (the Giant Swarm forks of CAPI,
  CAPA, CAPZ and CAPVCD, and the deployed CAPV, Crossplane AWS provider and App
  platform releases) instead of commits on upstream `main`. Fields that only
  upstream `main` had are gone from the types; none of them is used here.
- 553814b: The "kagent is not installed" card on a portal without the Installations page
  tells the person to ask their platform team to enable the Agent Platform,
  instead of naming a remedy the portal offers no way to.
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
- 2b79a0c: Lists in Customize and the new-agent flow now fit both a handful of entries and hundreds. The Customize search shows only on tabs with more than eight entries, or when a search is already set (a `?q=` link can now open a tab with that search). The Models and Connectors tabs show 20 rows at a time, and the model picker shows 12 cards at a time and always keeps the selected model visible. In the new-agent Tools step, a catalogue of 20 entries or fewer opens straight away, with no search and no _Browse the catalogue_ toggle.
- 2b79a0c: Dropdowns over environments, clusters, repositories, serving targets, presets
  and nodes now offer type-ahead search once they list more than eight options,
  and stay plain lists at eight or fewer. This covers the environment pickers of
  the new-agent and new-model flows, the add-backend and add-GPU-node-pool
  dialogs (environment, cluster and _I want to serve_), the serve, pull and
  download dialogs (target, preset or model, serving preset and target node),
  the add-skill repository picker, and the Agent Platform installation scope
  selector. The gs `InstallationScopeSelect` offers it only where the caller opts
  in with the new `searchable` prop (off by default, a plain select as before);
  the Agent Platform's scope controls pass it.
- 2b79a0c: The Usage page's remaining tables stay plain at a few entries and bounded at
  hundreds:

  - The conversations by-agent table, Cost's by-model table and the MCP usage
    connectors table render their first 15 rows (by the active sort), with
    _Show all N_.
  - The top tools and top connectors tables say what their top-10 cap left out
    ("and 14 more, 230 calls between them.") instead of dropping it silently.
    The `session-usage` route now returns `otherTools` and `otherMcpServers`
    (`{ count, calls }`) beside the capped lists.

- 25fc7da: `MusterMcpClient.listTools` reads every page of muster's `list_tools`, so the agent wizard's Tools step lists the whole catalogue; an organization's MCP server's tools land on its own tile.
- 2b79a0c: Long lists stay light, short lists stay bare. A session's conversation renders its newest 20 turns, with _Show earlier activity_ above them adding 20 at a time, and a folded "Used N tools" run is no longer kept on the page until it is opened. Customize → Skills shows 24 skill cards with _Show 24 more skills_, and its "most used first" note appears only when the catalog is longer than that. All Sessions shows its search, agent picker and state chips only above 8 sessions (the agent picker only with two or more agents), and _Load more_ keeps at most 100 sessions on the page, with _Show previous_ to go back.
- 4114dde: A page whose first read failed no longer says "No items" while the retry
  waits for the tab to come back to the foreground: it shows its loading state
  until the retry answers, then the data or the error. `isAwaitingData` in
  `ui-react` is the shared check (no data yet, fetching or waiting to retry),
  used in place of react-query's `isLoading`, which is false while a retry is
  paused.
- 2b79a0c: `agentPlatform.metaAgents.*` values must now name the agent as `<namespace>/<name>`, or `<installation>/<namespace>/<name>` where it runs on several installations. A bare name, or a value that matches more than one agent, resolves to nothing, and the feature that role gates stays hidden. Before, a bare name matched the first agent with that name in any namespace the viewer could list, so anyone who could create an agent there could take over the role. Update existing configs, for example `skillCreation: skill-creator` to `skillCreation: kagent/skill-creator`.

  The first messages that meta-agent hand-offs send (Evaluate, Edit via agent, the skill creator) now frame workflow definitions, skill content and drafts as data the agent must not take instructions from. Names and paths from repositories are reduced to one line.

- 4f6d765: The Agents and Sessions tabs explain an installation whose inventory probe was
  refused (gs `InstallationInventoryGate`): when the API server of the installation
  the tab reads rejected the person's token or refused the read, the tab says
  which installation, what the API server answered and what fixes it, instead of
  listing nothing.
- 5b9c5f4: The New agent wizard offers the ModelConfigs of the namespaces a person may
  read when they may not list them cluster-wide: an installation that refuses
  the cluster-wide list is read namespace by namespace (`kagent` and
  agent-manager's agent namespaces), so a person with a namespaced kagent
  RoleBinding can pick a model and no longer sees "Couldn't read 1
  installation". A refused namespace is skipped; any other failure still reads
  as "Could not read". `kubernetes-react` exports `getK8sListPath`.
- b990251: Models › GPU capacity and Serving: the GPU node pools, Model cache and GPU
  capacity cards show a loading indicator instead of an empty table while they
  are read, and a message instead of an empty table when there is nothing to
  list. The Model cache card is only on GPU capacity now, as its last card. On
  Serving, each installation's backend is a card of its own — its header, its
  table or the note that it serves nothing yet, and the opened model's steps.

  The kebab menus of served models, downloads and a model config's details page
  get a definite width, like the agent and session menus: opening one no longer
  trips the browser's ResizeObserver loop warning, and "Remove model config"
  fits on one line.

- 846f143: A person who has not signed in to cluster-manager sees "Sign in to
  cluster-manager to see GPU node pools" with its Sign in on the GPU capacity
  and model cache views (and on Add GPU node pool's cluster list) instead of an
  authentication error, and the view fills in once the sign-in lands. Every
  `401` from muster-backend now says why in `error.reason`
  (`server_sign_in_required` with the server, `token_missing`, `token_expired`,
  `token_rejected`) and is logged with it. The muster client refreshes the
  forwarded token ahead of its expiry, sends a call once more after a refresh
  for a refused token, and no query retries a muster `401` with backoff. New
  exports: `ConnectorSignInAlert`, `splitConnectorSignIns`,
  `musterSignInRequiredOf`, `musterUnauthorizedInfoOf`, `isMusterAuthFailure`,
  `shouldRetryMusterQuery`, `MusterUnauthorizedError` and the
  `MusterUnauthorizedReason` type (muster); `MusterUnauthorizedError` and
  `toMusterUnauthorizedError` (gs-node); `MUSTER_UNAUTHORIZED_REASONS`,
  `MUSTER_TOKEN_REASONS`, `isMusterUnauthorizedReason`,
  `MUSTER_TOKEN_EXPIRED_TEXT` and `MusterUnauthorizedReason` (gs-common, the
  contract both sides share).
- 7b63a47: MCP server and workflow editing share one definition-editor dialog: the same dismiss lock while a validate or save is in flight, error display and seeding on open, with the server's JSON editor and the workflow's YAML editor. A definition that no longer parses clears the previous success message, and only a parse error marks the editor invalid (the server's JSON editor too), not a failed call. `ConfirmDialog`, the definition-editor dialog and the session rename dialog share one busy dismiss lock (now `ui-react`'s `BusyDialog`), and the rename dialog seeds through `useOnDialogOpen`.
- 1642eed: The MCP Servers tab no longer carries an installation picker of its own: the
  Agent Platform page header's installation selector is the one control that
  scopes every tab, MCP Servers included. Where the selector's choice and the
  muster shown differ -- under "All installations" (the section shows one muster
  at a time, the home installation's) or when the pinned installation runs no
  muster the portal knows -- the muster views say so in one line instead. The
  header selector marks an installation whose muster is not reachable from this
  portal on the MCP Servers tab, as it already did for kagent on the other tabs;
  `useMusterInstallations` (the backend's installation list with reachability,
  usable outside the muster section) is exported for that.
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

- 2995471: Decide whether an installation's muster carries a server by the name muster exposes it under (`family.name ?? toolPrefix ?? name`), not by the MCPServer's own name. A server declared with a `toolPrefix` is addressed by that prefix — `mcp-marge` exposes `x_marge_<tool>` — so matching the name alone reported it as absent on every installation that runs it. `McpServerRuntime` now carries `toolPrefix` and `family`, and the muster plugin exports that type.
- 71d7a44: New `ToolTable` component: the house list of tools, as a table of name, markers
  and description without a header row.

  Five near-identical tool lists had grown across the two plugins — the Tool
  Explorer's browse rows, an agent's resolved toolset, muster's `ToolList`, the
  toolset picker's rows, and the servers page's chips — in four spellings of the
  tool name across three sizes, and five treatments of the summary. Only two of
  them showed the read-only / destructive markers their servers annotate, and the
  Tool Explorer, the one surface that actually _runs_ a tool, was not among them.

  `ToolTable` is one component behind all of them. What differs between surfaces
  is a row's `mode` — shown, linked, selectable (the whole row opens the tool) or
  checkable — not its typography. It is presentational: it renders exactly the
  items it is given, and grouping, searching and paging stay with the caller.
  Columns are a CSS grid on the list with `subgrid` on each row, so they line up
  without a header, and the marker column only exists when some row in the list
  can fill it.

  The `isReadOnly` / `isDestructive` annotation predicates moved to the muster
  plugin, where `ToolTable` needs them too; `agent-platform`'s `lib/toolset`
  re-exports them unchanged, so its callers are unaffected.

  Every one of those lists now renders through it: the servers page's core tool
  families (`ToolList`, deleted), the resolved toolset behind the agent detail
  page, the Tools step, the review page and the edit page, the Tools step's
  catalogue, and the Tool Explorer's browse, search and quick-access lists. The
  Tool Explorer and the core families show read-only and destructive markers for
  the first time — the surface that actually runs a tool was not telling anyone
  which tools destroy things.

  The servers page's inline chips stay as they are: a dense jump-off surface, not
  a read-and-compare list, and a different affordance rather than a different
  styling of the same one.

- 8e3b668: The new-agent form no longer loses what was entered when the person leaves
  it: it keeps a draft in the browser tab, per person, and fills it in again
  after a reload, a sign-in redirect, the browser's Back or a link followed in
  the same tab, saying "Your draft is back" with **Start over** to begin empty.
  Creating the agent, opening its pull request, Start over and Discard changes
  drop the draft. Links inside the form, including the Environment card's
  sign-in links, open in a new tab and say so. The Environment card says what an
  environment it could not check means for the agent being created, and **Check
  again** reads it anew after signing in to muster there.

  ui-react adds `useSessionDraft`, which keeps a form's draft in the tab's
  `sessionStorage` per person, `DraftRestoredAlert` and `WizardFrame`'s
  `onDiscard`. `ExternalLink` now tells screen readers that it opens in a new
  tab.

- 2b79a0c: Starting a session no longer flashes "Could not load this session" on the way to the conversation: the session page now shows its loading state while the cached data is restored, and retries a just-created session's first reads for a few seconds before reporting it missing or unreadable.
- fd7799f: Plans: the proposed plans read as a table, one column per fact. The open pull requests of a plan repository were a list whose facts were run together into one line (`#412 · marians · 7 files changed · updated Sep 18, 2026`); they are now a bui `Table` with PR, Author, Status, Last updated, Title and Epic as columns, sortable, newest first. Only a draft is marked — every row is an open pull request, so a badge on the others would say nothing. The changed-file count is gone, and with it the `GET /pulls/:n/files` request the list made per row.

  The author is the person, not their GitHub login: their photo and display name, linking to their catalog User entity. `UserEntityLink`, a new `ui-react` export, composes that from `EntityRefLink`, which resolves the name and degrades to the bare login for an author the catalog does not know (an outside contributor, a bot). The photo comes from a single batched catalog read for the whole table, because `DefaultEntityPresentationApi` fetches a fixed field list that `spec.profile.picture` is not part of and that cannot be extended. Entity refs are lower-cased, since the catalog indexes them that way — a mixed-case login like `QuentinBisson` otherwise matches nothing and renders with neither name nor photo.

  The epic cell is a plain link to the issue number, since the column heading already says Epic; the board status it used to spell out moves into the link's tooltip. `stopRowPress` moves from `agent-platform` to `ui-react` now that other plugins need it, and the epic link stops its own press from reaching the row behind it, so clicking it no longer opens the epic _and_ the plan.

- 2b79a0c: `DateComponent` shows the browser's local time below a `DateTimeZoneProvider` set to `local`, with the full timestamp and its zone on hover; without a provider it stays UTC. The Agent Platform shell sets it, so its lists and detail pages show one clock. `DateComponent` no longer passes its `tooltip` prop to the DOM.

  Every Agent Platform page now sets a document title such as "Lab Helper · Agents · Agent Platform". `ShellPage` and `WizardFrame` set it from their breadcrumbs or title (`documentTitle` overrides), through the new `ShellDocumentTitle`, which an outer title template cannot suffix a second time.

- 2b79a0c: Session states use one vocabulary everywhere: Waiting for you, Working, Finished and Failed. `describeSessionState` returns those words as `label`, and the separate `shellLabel` and `SHELL_STATE_LABELS` are gone (`SESSION_STATE_LABELS` replaces the latter). An agent's Sessions tab now uses the Sessions page's list, so a few sessions show without pagination, search or an Agent column.
- 2b79a0c: The Usage time range applies everywhere. The Overview's "Your sessions" tile counts the selected window, and Your sessions shows sessions and tool calls for 7 days too: the session-usage route now reports `toolCalls` and `lastActiveSessions` per day. The Connectors view asks muster for the selected window instead of a fixed 30 days. The per-day chart no longer draws a bar for tomorrow.
- 2b79a0c: The shell rail lists the pinned sessions, then the eight most recently active ones (the later of start and last state change, grouped by that time), and ends with an "All sessions" link that says how many more there are when the list is cut.
- 2b79a0c: A "not reachable from this portal" answer for a kagent installation is now
  trusted for one minute, re-read every minute while it lasts, instead of being
  cached (and persisted across reloads) for an hour. Usage and Sessions come back
  within about a minute and a half of the installation recovering. A reachable
  answer is still cached for an hour.
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

- 77d7831: The Agents roster lists the Agents of the namespaces a person may read when
  they may not list them cluster-wide: an installation that refuses the
  cluster-wide list of Agents, Harnesses or RemoteMCPServers is read namespace by
  namespace (`kagent` and agent-manager's agent namespaces), so a person with a
  namespaced kagent RoleBinding sees their agents, with their Harness names and
  toolsets, instead of "Could not read 1 environment" on the roster, a
  connector's "Used by" and a model's agents. The fallback is shared with the New
  agent wizard's ModelConfigs (`useNamespacedFallback`); a namespace that fails
  for another reason than a refusal now leaves the installation unread, as a
  failed cluster-wide list does.
- f568ed3: Carry the whole conversation into the new session offered when a session's
  runtime is lost, as already happens when kagent does not take an answer. The
  new session's first message holds the conversation so far (messages, and tools
  by name) and the open question with any answer that never reached the agent,
  within the message size limit. It is titled "Continued: <title>" and shows a
  "Continued session" banner linking to the lost session. The way on is a
  "Continue in a new session" button inside the notice, which says what the new
  session will start with. A session that can no longer continue (a reported
  runtime loss, or an answer kagent did not take) shows no message box; while a
  runtime loss is only suspected, the box stays for a retry.
- 2b79a0c: The message box on a session's page says how it sends, beside the disclaimer
  under it: Return sends and Shift+Return adds a new line. The new-session box,
  the answer panel and the command palette draw keys the same way, as key caps
  with a Return icon for Enter. On touch devices the boxes say to tap their
  button instead.
- bf1e9b2: The line under _Est. cost_, in a session's cost popover and on _Usage_, now names the input and output tokens the estimate priced, written the way the token figures beside it are (`48.0k input and 466 output tokens`), instead of one exact total that no figure on the page showed. When kagent counted tokens beyond input and output, such as thinking, the line says how many the estimate does not price. Token figures round half up to a tenth (48,050 reads `48.1k`), move to the next unit when they round into it (999,950 reads `1.0M`, not `1000.0k`), and reach billions (`2.3B`). Sizes do the same (1,048,575 bytes reads `1.0 MiB`, not `1024 KiB`).
- 2b79a0c: Session detail: the cost popover says **Context used** where it said "Memory
  used", and its accessible names say context too, since memory means something
  else for agents; the model page's "Memory (context)" fact reads **Context
  window**. The choices of an agent's question show their whole focus ring, sit
  apart from the question and the answer box, and use the message text's size,
  with each checkbox level with its label.
- 12aaa8b: A session left while its turn was running shows its conversation when opened
  again within a minute, instead of the conversation from before that turn (for a
  new session, "This session has no messages yet." until a reload).
- e77e553: A session page that the reader scrolls back down to the end of while a reply
  streams follows the reply again, also when a paragraph streams in before the
  scroll lands. On a phone a paragraph is taller than the "at the end" margin,
  and the page used to stop just short of the end and stay there.
- 565a7b5: A session page, and the Create agent assist panel, no longer pull the reader
  back down while a turn streams. The conversation follows the reply only while
  the reader is at the end; scrolling up (wheel, touch, keyboard, scrollbar)
  leaves the end at once, and the position then stays where they are until they
  scroll back to the end or press End. Opening _Show more_ or a tool activity
  row never scrolls the page.
- 2b79a0c: The shell's sessions list filters with the shared dropdowns (State, Agent, Pinned) used across Customize, replacing the state chips and the single agent picker.
- aecc202: Explain and name every failed Kubernetes proxy request the same way.

  kubernetes-react now exports `k8sResponseError`, the helper its own reads and
  writes use, along with its two parts: `k8sResponseReason` (the Kubernetes
  `Status` message, the Backstage proxy's error message, or the HTTP status;
  `withStatus` keeps the status in front of a message) and
  `k8sErrorNameForStatus` (401 `UnauthorizedError`, 403 `ForbiddenError`, 404
  `NotFoundError`, 409 `ConflictError`).

  The three requests that built their own errors use it now:

  - The deployment picker (gs) warns when a `valuesFrom` ConfigMap or Secret
    could not be read, naming each one and why. Such a source used to look
    exactly like an empty one, so its values were silently missing from the
    configuration being edited.
  - The pod lists behind the Agent Platform's KServe serving view name a 401
    `UnauthorizedError`, so an expired token is no longer retried, and quote the
    apiserver's `Status` message.
  - The installation inventory probe (gs) quotes the apiserver's `Status`
    message after the HTTP status, e.g.
    `HTTP 403: forbidden: User "jane" cannot get path "/apis"`, instead of only
    the status. It keeps naming a 503 `ServiceUnavailableError`.

- 2b79a0c: Detail pages in the agent-platform shell no longer flash a different page layout while they load. The agent, model, skill, session, connector and workflow pages render their final header (breadcrumbs, avatar or tile, title line, badge row, tabs, facts column) from the first paint, with skeletons where the data is still being read. An agent, model or session already in the query cache renders at once, instead of showing the loading state while the persisted cache is restored. Opening a detail page no longer shows the section's list header ("Agents", "Sessions", "Models") while the page's code loads, and the Agents and Sessions tabs wait for the agent-platform cookie only once per page load instead of on every visit. `ShellPage` gains `ShellPageTitleSkeleton`, `ShellPageBadgeSkeleton` and `ShellPageFactsSkeleton` for these loading states.
- 2b79a0c: Inside the agent-platform shell, the buttons a tab's page puts in the page header (New agent, a session's actions, a create flow's Cancel and Review) show in the header above the page again instead of disappearing.
- 2b79a0c: The agent shell now works at phone width (375px). The shell publishes how much
  of the viewport's bottom edge its fixed mobile bar covers as
  `--agent-shell-mobile-bar-height` — the bar's 56px plus the iOS home-indicator
  inset — and the session view's docked composer sticks above it instead of
  being covered by it; in-flow pages (the home composer) clear the inset too.
  Tables built on core-components scroll inside their own box at phone width
  instead of widening the page. In the session view, long tool names in timeline
  rows ellipsize rather than overflowing, and the approval card's caption and
  buttons wrap onto separate lines. A workflow step's arguments grid on the
  workflow detail page folds to one column below 420px, like the steps section's
  grid already did.
- f205e33: `ShellPage` keeps its header actions at the top right beside the title: a long
  title wraps beside them instead of pushing them under its badge row, so the
  session page's pin and menu stay put, on a phone too. Only an action group too
  wide to leave the title its room (192px, 320px with a description; an avatar or
  tile comes on top) moves under it. The avatar or tile sits beside the title's
  first line, as the actions do. A header row with the Environment select lines
  up on its bottom edge, so the buttons beside the select align with its field
  rather than its label. Usage's select and time range are items of that row,
  8px apart, as every header's controls are.
- 2b79a0c: `ShellPage` and `FullScreenWizardFrame` now claim the page header with the new `useOwnPageHeader` hook, and a layout reads `usePageHeaderOwned` to draw no header of its own. Under the `agent-platform-shell` flag, every Agent Platform page that renders a `ShellPage`, such as the Sessions list and a connector's page, shows one title and each header action once.
- 2b79a0c: Classic pages keep their pre-shell `InfoHint` and `FactList` behavior. The press-to-open popover, the larger hit area and the 600px stack point now apply only inside the agent-platform shell, which marks its pages with the new `ShellScopeProvider`. Markdown tables in `GSMarkdownContent` and the session timeline scroll instead of breaking words mid-word in their cells. The shell flag is read once per app load (`isAgentShellOn`), so the shell's pages and chrome always agree.
- 2b79a0c: LLM usage over a one-day window no longer issues a range query that ends before it starts: the daily charts show today alone. `useLlmUsage` reports the window it rounds `days` to, the same one its queries cover.
- 5d7602c: Only offer an installation selection when there is an actual choice.

  - `agent-platform`: when several installations are configured but, once the
    fleet has settled, only one of them is usable (has models and agent-manager),
    the "Create an agent" installation card selects it and says where the agent
    runs instead of offering a one-option dropdown. The card now also explains
    installations whose muster server list couldn't be read and installations
    whose cluster access isn't healthy, instead of leaving them out silently.
  - `gs`: the `GSInstallationPicker` scaffolder field selects the only selectable
    installation, regardless of `autoSelectFirstValue`, and hides itself when it
    is the only allowed one. It waits for the installations' health checks before
    deciding, withdraws a selection that becomes disabled, and withdraws an
    automatic pick when the list widens again.

  `muster`: remove the "Add ad-hoc server" button and its create dialog from the
  MCP Servers page. "Register server" is now the single way to add an MCP server.
  stdio servers and non-default settings (`autoStart` off, a custom timeout, and
  so on) are no longer created from the portal; add those through GitOps. An
  existing server's settings can still be changed through its JSON edit dialog.
  User-facing copy no longer calls these servers "ad-hoc".

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

- 90f37c4: Top-align the content in selectable model and skill cards on the new-agent
  page. The grid stretches every card in a row to the tallest card's height, and
  the native `<button>` cards were centering their content in that extra space.
  The cards now lay their content out as a flex column so it stays pinned to the
  top.
- 2b79a0c: Skill pull requests are github.com only, and the UI now says so instead of
  failing with a 400: "Add skill" lists only github.com repositories as targets
  (noting why others are missing) and is replaced by a short note when none of
  the configured repositories is on github.com. A skill from any other git
  repository gets a read-only detail page
  (`/agent-platform/skills/-/<host>/<repo path>[/-/<skill dir>]`) with its
  description, instructions and users, no Edit or Evaluate, and a note naming the
  reason; its edit address explains the same instead of offering a form.
- 14e878c: Set the skill cards off from the repository heading they belong to.

  On the Select skills step, each repository is a collapsible section, and bui
  gives an expanded panel 4px of padding — so the first row of cards sat almost
  flush against the heading and read as part of it. An expanded grid now starts
  12px further down, which is more space than there is between two rows of cards,
  so the heading reads as the boundary it is. Collapsed sections are unchanged:
  the extra space is scoped to the expanded state, because the panel element stays
  in the layout either way.

  A repository whose skills all sit in subfolders opens on a subfolder heading
  rather than on cards, and that heading carried a top margin of its own on top of
  the panel's new space. The margin now applies only to the subfolder headings that
  actually follow cards.

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

- a5ec0eb: Explain every figure in the stats strips with an info hint: the session detail
  and session usage totals, the muster dashboard, MCP usage and workflow run
  stats, and the bot PR queue. The workload details pane's replica counts now use
  the shared `Stat` component too, and the session detail and muster dashboard
  strips use the same spacing as the others.
- 2b79a0c: Remove model config on a running model asks first and names the agents that use the config. The agent page's "Update skills…" is now "Update all skills to latest…", and a skill pinned behind its catalog's newest commit shows "Update available". Add GPU node pool is disabled with its reason where no environment has a cluster, and Serve model no longer preselects a preset the nodes cannot serve. `DisabledAction` moves from muster to ui-react.
- 2b79a0c: A session whose agent ended its turn is "Idle" instead of "Finished", and its composer invites a reply to the agent instead of resuming the session. The session header shows "Working" from the moment a message is sent, from the same state the conversation shows. The rail always lists sessions waiting for you above the recent ones and counts them beside "All sessions". The sessions list orders and groups sessions by last activity, as the rail does, in a "Last active" column.
- 2b79a0c: Meta-agent hand-offs that start a session are named "Create with", "Edit with" or "Evaluate with" the agent, and their strips say a session starts. The skill hand-off also carries a rewritten description of a skill being edited. A hand-off's first message is captioned "Prepared by the portal" in the session it opens. The agent wizard asks before Close or Cancel discards entered input, through the new `confirmDiscard` prop of `WizardFrame`.
- 2b79a0c: Agent platform pages follow one idiom each for loading, empty, not-found, headings and states: detail pages read "Reading …" in place, hosting empty states and the sessions empty state use the shared card, model and skill not-found pages offer the way back, form sub-sections and the Used by heading use the section scale, the agent and session headers show their state as a dot like the lists, the agent menu no longer repeats Edit, the remove pool/cache items are marked as destructive dialogs, Remove backend confirms destructively, banner actions are small, dialogs fit a phone, optional fields are marked, usage cost columns say "Est. cost", latencies read "1.2 s", download toasts are success toasts, the home agent picker searches only past eight agents, View source opens in a new tab from the menu too, and error copy reads "Could not".
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

- b63373b: A new session's turn that ends at once — refused or failed straight away —
  shows on its page right after: the conversation is read afresh after the turn,
  also while the page's first read of it is still under way, instead of keeping
  that read's empty answer until the next poll.
- cba71a8: An agent turn (a message, streamed or not, and the answer to a confirmation)
  goes out with an ID token that has at least 25 of its 30 minutes left, so a
  long turn no longer fails part-way with `Unauthorized` when the token the
  session had cached runs out. The session is refreshed silently first when its
  token has less of its lifetime left; reads keep Backstage's 3-minute margin. A
  turn whose token could not be refreshed is still sent, with a console warning.

  - `gs`: the Kubernetes auth APIs (`LastingAuthApi`) carry
    `getLastingIdToken(minLifetimeLeft)`; its refresh never opens a sign-in.
  - `gs-react`: `idTokenLifetimeLeft` and `hasIdTokenLifetimeLeft`.
  - `gs-common`: `readJwtClaims`, `readJwtLifetimeClaims` and
    `jwtLifetimeSeconds`, the one unverified JWT claims reader of frontend and
    backend.
  - `kubernetes-react`: `getInstallationOidcToken` takes `{ minLifetimeLeft }`.
  - `auth-backend-module-gs`: `POST /cluster-token/:installation` takes
    `?minLifetimeLeft=` and re-exchanges a cached token with less of its
    lifetime (`exp` − `iat`, on the issuer's clock) left.

- 2b79a0c: Move `ShowMore` (with `revealAll`) and the list-scale constants `INITIAL_ROWS`,
  `SEARCH_MIN` and `USED_BY_ROWS`, plus the `countNoun` helper, from the Agent
  Platform plugin into `@giantswarm/backstage-plugin-ui-react`, so the muster
  plugin can window its long lists too (it cannot import from agent-platform,
  which depends on it). agent-platform re-exports them for its existing imports;
  behaviour is unchanged.

  Also adds `searchableIf(options)`: whether a `Select` over these options should
  offer type-ahead (more than `SEARCH_MIN` options).

- 420557f: The "Update agents" dialog on a skill's page no longer changes height while it checks which agents you can update: a row being checked is laid out like the row it becomes, the select-all box is there from the start, and the line under the list keeps its place. The placeholder rows of the "Update all skills to latest" dialog now match the height of the rows that replace them.
- 3130bf4: Usage: when the selected time range reaches back further than an
  installation's records, Overview, Cost and Connectors say since when calls were
  recorded and how many of the range's days that covers. The Cost tab shows the
  change against the previous range only when the records reach back before it.
  The muster-backend `/usage` route returns `data_start`, and the common package
  exports `usageDataStart` and the Usage screen's day formatters
  (`formatDayTick`, `formatDayTooltip`, `formatDayWithYear`). The session usage
  reader's `maxAgeMs` now defaults to `windowDays` plus one day, so raising
  `windowDays` no longer drops sessions by age alone; `maxSessions` still caps how
  many are read, so raise it with a wider window.
- 2b79a0c: Usage no longer drops the first model call of every gateway metric series. The
  LLM usage queries (cost, tokens, calls, latency and speed quantiles, request
  status, unpriced lookups, the daily charts, today's bar and the session $/token
  rates) now count a series born inside the window as growing from zero: its
  first value is added to its `increase()` when it has no sample in the hour
  before the window starts. On a fresh installation the portal showed about half
  the real spend.
- 600a4c3: Highlight the installation name in the Usage tab's intro sentences.

  The Overview, Cost and Conversations views each open with a sentence naming the
  installation they report on ("Spend on gazelle over the last 30 days…"). That
  name is now bold, so the one word that says whose numbers these are stands out
  from the rest of the sentence.

  `SectionHeader`'s `description` accepts a `ReactNode` rather than a `string` to
  allow the inline markup. Every existing caller passes a string, which is still
  valid.

- ebb3d7a: Usage Overview: the tokens per day by type chart is always shown, like the
  other cards; the Gateway health card drops its note about model calls versus
  agent turns; and the rate-limit figure is labelled "Rate limited" (its hint
  still says it counts 429 answers). The Gateway health hints and the empty state
  name the selected time range instead of a fixed 30 days. The Usage header's
  time range now lines up with the bottom edge of the Environment select on every
  Usage tab.
- 2b79a0c: Usage tabs now read Overview, Cost, Your sessions, Connectors. The skill-creation banner and the New Session agent picker label ("Select agent") are shorter and clearer.
- 6079d5b: The Usage screen's time window is a select labelled "Time range" with the
  options "Last 7 days", "Last 30 days" and "Last 90 days", in place of the three
  bold "7 days | 30 days | 90 days" buttons. Beside the Environment select it has
  the same label, box, edge, radius and height, and the two line up. On Your
  sessions, a window longer than kagent keeps is a disabled option that says why
  under its name ("kagent keeps 30 days of session usage"), which screen readers
  read with it; the note that said so beside the control on phones is gone.

  `ui-react` exports the control as `LastDaysSelect`.

  `agent-platform-common` removes the export `usageWindowLabel`, which nothing
  uses any more. Code that imports it must name the window itself.

- 2b79a0c: Shared helpers and components replace local copies in the agent platform: counts use one pluralizer, the session lists group days through one helper, Customize › Skills and the new-agent skill step search skills the same way, the session rail draws state dots with the shared status dot, list searches that match nothing use the catalog's no-match line, not-found pages use the shell's empty-state card, copy buttons use the shared copy button, the session cost chip is a bui button and popover, the approval card's "Changes things" is the shared effect badge, and removing a model backend or a model cache confirms with exactly one toast.
- 2b79a0c: Customize › Models names are links, so a model opens by keyboard or in a new tab. The search palette finds models and workflows and says "No results for …" instead of sending the query to the classic portal search. The agent and model forms show the technical name under the name and say that it cannot be changed; on edit it is no longer a separate locked field, and the model's "Display name" is now "Name". Edit wizards name the agent or model in the document title. GPU nodes, node pools, model caches, unpriced models, an agent's skills and its declared toolset show a page at a time.
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

- cbab22f: The workspace flows use one word per concept: "synchronize" everywhere
  (Synchronized, Synchronizing, Last synchronization), "disk" for a
  workspace's volume (the detail page's Disk section, the delete dialog),
  "session directory" for a session's folder, "environment" where the
  installation is meant, and "session" in lowercase as on the Sessions pages.
  The sign-in cards no longer name workspace-manager or call muster's sign-in
  a session, the repository picker's table names its columns for screen
  readers, a refused workspace start says to ask an owner of the unreadable
  repositories, and the Workspaces tab drops its "A failed sync shows its
  reason" footnote.
- 849157e: The workspace-manager client follows the provider sign-in's move to muster (workspace-manager 0.10): `authorize_workspace`'s `connect[]` entries and `list_providers`' providers carry `signIn`, a sentence saying how the person grants the provider's App in muster, in place of `url` and `connectURL`. `connectProvider` and `disconnectProvider` are gone with the manager's `connect_provider` and `disconnect_provider`.
- b613f6f: The Workspaces tab follows a workspace's synchronization without a reload.
  A workspace just created or changed, or one synchronized from its row, says
  "Synchronizing" until the workspace-manager reports the result, then
  "Synchronized", "Unchanged" or "Failed" with the manager's reason. While a
  synchronization runs, the list reads again every 5 seconds for the first two
  minutes and every 15 seconds after that, but not while the browser tab is
  hidden. A synchronization the manager has not reported yet is expected for
  30 minutes at most. The list, the workspace's page and its Synchronize
  button use the same state. A requested synchronization reads
  "Synchronizing" everywhere, and Synchronize waits while the manager reports
  one running or requested.
- 167c24c: A person who holds the workspace-manager grant no longer sees "Sign in to use
  workspaces" in a new portal session. The backend's sign-in hold, kept per
  person, answered a new token's calls with "a sign-in to it is pending for you"
  without asking muster, although muster connects that token's session with the
  person's grant. A new token's held call now first reads its own
  `auth://status` once (a read that starts no sign-in) and goes to muster when
  the server reads connected. The sign-in card reads again whenever muster reads
  the server connected, also when it already did as the card mounted.
- 668fce8: The Workspaces tab offers the sign-in to workspace-manager when the person's
  session has not signed in to it yet, instead of muster's refusal, and lists
  the workspaces once the sign-in lands.
- Updated dependencies [2b79a0c]
- Updated dependencies [5bdbb49]
- Updated dependencies [34f5fc9]
- Updated dependencies [1fba94a]
- Updated dependencies [2978657]
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [d7b570d]
- Updated dependencies [e62dd24]
- Updated dependencies [7740b89]
- Updated dependencies [343d4b2]
- Updated dependencies [244719a]
- Updated dependencies [863da43]
- Updated dependencies [2b79a0c]
- Updated dependencies [d6bec76]
- Updated dependencies [a59b04c]
- Updated dependencies [2c4e7eb]
- Updated dependencies [17f51ca]
- Updated dependencies [2b79a0c]
- Updated dependencies [2494c9a]
- Updated dependencies [3f7455f]
- Updated dependencies [b0a1bd2]
- Updated dependencies [85b1ac8]
- Updated dependencies [4eaec47]
- Updated dependencies [551e5d5]
- Updated dependencies [c5b9c46]
- Updated dependencies [0c2f870]
- Updated dependencies [1a05f26]
- Updated dependencies [e06dec9]
- Updated dependencies [7a49e7f]
- Updated dependencies [9c53996]
- Updated dependencies [a036f84]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a776d8b]
- Updated dependencies [2d1f914]
- Updated dependencies [2b79a0c]
- Updated dependencies [55e9be1]
- Updated dependencies [2b79a0c]
- Updated dependencies [03a24b1]
- Updated dependencies [bf367f1]
- Updated dependencies [9c69597]
- Updated dependencies [5b5d408]
- Updated dependencies [27e64aa]
- Updated dependencies [57df63e]
- Updated dependencies [d6bec76]
- Updated dependencies [d6bec76]
- Updated dependencies [2b79a0c]
- Updated dependencies [b5f7aa4]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [c4f3eca]
- Updated dependencies [9eab10f]
- Updated dependencies [341e658]
- Updated dependencies [fedd5d8]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [d129ee1]
- Updated dependencies [2b94c2a]
- Updated dependencies [9188650]
- Updated dependencies [9312feb]
- Updated dependencies [a060513]
- Updated dependencies [aad1e93]
- Updated dependencies [1e1e0e3]
- Updated dependencies [2b79a0c]
- Updated dependencies [9c0ba49]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [4c69b72]
- Updated dependencies [9dcfef0]
- Updated dependencies [85e7d8c]
- Updated dependencies [be7bd04]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [2fa183d]
- Updated dependencies [9e00143]
- Updated dependencies [d87fd9d]
- Updated dependencies [aad1e93]
- Updated dependencies [602f2a7]
- Updated dependencies [2b79a0c]
- Updated dependencies [b63373b]
- Updated dependencies [4f6d765]
- Updated dependencies [2b79a0c]
- Updated dependencies [ea12ebb]
- Updated dependencies [158457a]
- Updated dependencies [600a4c3]
- Updated dependencies [d0bf6da]
- Updated dependencies [c3409fb]
- Updated dependencies [fd4dc77]
- Updated dependencies [4048e91]
- Updated dependencies [67a32ef]
- Updated dependencies [9fd228e]
- Updated dependencies [4c4b507]
- Updated dependencies [f905068]
- Updated dependencies [4bcdf2e]
- Updated dependencies [86eec55]
- Updated dependencies [2b79a0c]
- Updated dependencies [e928a56]
- Updated dependencies [2b79a0c]
- Updated dependencies [205d9b4]
- Updated dependencies [2b79a0c]
- Updated dependencies [99cede2]
- Updated dependencies [2b79a0c]
- Updated dependencies [f088683]
- Updated dependencies [884bd42]
- Updated dependencies [6fe84bd]
- Updated dependencies [a2443de]
- Updated dependencies [884bd42]
- Updated dependencies [6b84a5f]
- Updated dependencies [2f5598e]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [23bfca0]
- Updated dependencies [2b79a0c]
- Updated dependencies [e33193b]
- Updated dependencies [2b79a0c]
- Updated dependencies [d82c4c6]
- Updated dependencies [13225d7]
- Updated dependencies [87b1c2e]
- Updated dependencies [3dbde6e]
- Updated dependencies [a1292a5]
- Updated dependencies [6822ed1]
- Updated dependencies [ee7fe5a]
- Updated dependencies [d29ac2a]
- Updated dependencies [573b34d]
- Updated dependencies [b4dc429]
- Updated dependencies [d19ad0c]
- Updated dependencies [75cb9fa]
- Updated dependencies [526dd01]
- Updated dependencies [2c383a6]
- Updated dependencies [2789f3d]
- Updated dependencies [3043a1d]
- Updated dependencies [0a05757]
- Updated dependencies [66ac70b]
- Updated dependencies [8967f50]
- Updated dependencies [6720990]
- Updated dependencies [cfb48ae]
- Updated dependencies [d14ebda]
- Updated dependencies [0811b1e]
- Updated dependencies [74e4a0b]
- Updated dependencies [e807fa6]
- Updated dependencies [e9a6141]
- Updated dependencies [b79cf20]
- Updated dependencies [104d1bc]
- Updated dependencies [5e54675]
- Updated dependencies [1f1b881]
- Updated dependencies [0d6360e]
- Updated dependencies [faaf78e]
- Updated dependencies [0d6d9f3]
- Updated dependencies [6e1050e]
- Updated dependencies [0edc1c4]
- Updated dependencies [2c6f671]
- Updated dependencies [0b2fa7f]
- Updated dependencies [e447f16]
- Updated dependencies [b431a04]
- Updated dependencies [89ad470]
- Updated dependencies [2b79a0c]
- Updated dependencies [8402eee]
- Updated dependencies [6a5c0d4]
- Updated dependencies [e5bd97a]
- Updated dependencies [381d16d]
- Updated dependencies [ea5fd6f]
- Updated dependencies [5c82125]
- Updated dependencies [b820660]
- Updated dependencies [871a9cb]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [ea12ebb]
- Updated dependencies [2e425c5]
- Updated dependencies [322e58c]
- Updated dependencies [d19ad0c]
- Updated dependencies [61b4c34]
- Updated dependencies [b2c5996]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [4114dde]
- Updated dependencies [0373fb1]
- Updated dependencies [32f7b03]
- Updated dependencies [731296e]
- Updated dependencies [56d8c05]
- Updated dependencies [ee2786b]
- Updated dependencies [b628d71]
- Updated dependencies [ad90805]
- Updated dependencies [f806f76]
- Updated dependencies [2b79a0c]
- Updated dependencies [87b1c2e]
- Updated dependencies [5b9c5f4]
- Updated dependencies [cfb83c6]
- Updated dependencies [846f143]
- Updated dependencies [9e57736]
- Updated dependencies [578b163]
- Updated dependencies [57d8d40]
- Updated dependencies [7b4b7ae]
- Updated dependencies [2b14d41]
- Updated dependencies [55db519]
- Updated dependencies [607d514]
- Updated dependencies [d200952]
- Updated dependencies [578b163]
- Updated dependencies [2b79a0c]
- Updated dependencies [478aa4d]
- Updated dependencies [2b79a0c]
- Updated dependencies [7518832]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [94a61cb]
- Updated dependencies [2b79a0c]
- Updated dependencies [28aada8]
- Updated dependencies [ee800aa]
- Updated dependencies [578b163]
- Updated dependencies [7c9e6d6]
- Updated dependencies [c8743f8]
- Updated dependencies [f2cc1f8]
- Updated dependencies [7b63a47]
- Updated dependencies [5851bba]
- Updated dependencies [2b79a0c]
- Updated dependencies [6f4d55e]
- Updated dependencies [2b79a0c]
- Updated dependencies [4b7522d]
- Updated dependencies [69eaff0]
- Updated dependencies [159c276]
- Updated dependencies [75cb9fa]
- Updated dependencies [1642eed]
- Updated dependencies [578b163]
- Updated dependencies [c4a1640]
- Updated dependencies [9a71810]
- Updated dependencies [4cdc2c0]
- Updated dependencies [c1c65ee]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f9644fb]
- Updated dependencies [6205cca]
- Updated dependencies [578b163]
- Updated dependencies [f410853]
- Updated dependencies [7ff288f]
- Updated dependencies [ff6278b]
- Updated dependencies [578b163]
- Updated dependencies [28aada8]
- Updated dependencies [5f09b20]
- Updated dependencies [e97558c]
- Updated dependencies [c3a9998]
- Updated dependencies [ab9b7a0]
- Updated dependencies [f8be62f]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [1305e9e]
- Updated dependencies [c604256]
- Updated dependencies [6b18a17]
- Updated dependencies [70eeb29]
- Updated dependencies [2b79a0c]
- Updated dependencies [d68f887]
- Updated dependencies [92f025f]
- Updated dependencies [65d8d60]
- Updated dependencies [0bed874]
- Updated dependencies [6b3ac77]
- Updated dependencies [ff8b3f1]
- Updated dependencies [2995471]
- Updated dependencies [2b79a0c]
- Updated dependencies [954a810]
- Updated dependencies [8d67e83]
- Updated dependencies [f90366e]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [54ea033]
- Updated dependencies [728d50e]
- Updated dependencies [c482453]
- Updated dependencies [5e9b874]
- Updated dependencies [eba6372]
- Updated dependencies [2b79a0c]
- Updated dependencies [32f943c]
- Updated dependencies [4aa60ba]
- Updated dependencies [71d7a44]
- Updated dependencies [5cf5f33]
- Updated dependencies [3383e35]
- Updated dependencies [578b163]
- Updated dependencies [578b163]
- Updated dependencies [f47797c]
- Updated dependencies [28aada8]
- Updated dependencies [59f12a0]
- Updated dependencies [23d3558]
- Updated dependencies [2b79a0c]
- Updated dependencies [28aada8]
- Updated dependencies [b8afa37]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [d19ad0c]
- Updated dependencies [799d6c3]
- Updated dependencies [2b79a0c]
- Updated dependencies [578b163]
- Updated dependencies [d95e52d]
- Updated dependencies [578b163]
- Updated dependencies [8e3b668]
- Updated dependencies [2b79a0c]
- Updated dependencies [bbb9406]
- Updated dependencies [9180429]
- Updated dependencies [12aaa8b]
- Updated dependencies [610d01d]
- Updated dependencies [ca6ffd8]
- Updated dependencies [398c4b1]
- Updated dependencies [22b2ad6]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [2b79a0c]
- Updated dependencies [e8c6d73]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [c81464c]
- Updated dependencies [a6c427b]
- Updated dependencies [b9aff1b]
- Updated dependencies [741669e]
- Updated dependencies [7a6b30e]
- Updated dependencies [2b79a0c]
- Updated dependencies [564456f]
- Updated dependencies [83cc65c]
- Updated dependencies [389a40b]
- Updated dependencies [fd05081]
- Updated dependencies [ee7fe5a]
- Updated dependencies [fa4ae37]
- Updated dependencies [b4a3dee]
- Updated dependencies [ebd7572]
- Updated dependencies [bf1e9b2]
- Updated dependencies [eb7ed35]
- Updated dependencies [69e07c8]
- Updated dependencies [eb2bbd1]
- Updated dependencies [aecc202]
- Updated dependencies [4f6d765]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f205e33]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f985210]
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
- Updated dependencies [5d7602c]
- Updated dependencies [14e878c]
- Updated dependencies [2b79a0c]
- Updated dependencies [14e878c]
- Updated dependencies [a2443de]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a5ec0eb]
- Updated dependencies [2b79a0c]
- Updated dependencies [220e7c7]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [b44a375]
- Updated dependencies [2b79a0c]
- Updated dependencies [49263b7]
- Updated dependencies [1893681]
- Updated dependencies [f94930d]
- Updated dependencies [cba71a8]
- Updated dependencies [2b79a0c]
- Updated dependencies [0bed874]
- Updated dependencies [483c8f4]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [2e425c5]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [322e58c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [0d6360e]
- Updated dependencies [d19ad0c]
- Updated dependencies [b990251]
- Updated dependencies [2b79a0c]
- Updated dependencies [d9673e8]
- Updated dependencies [9e57736]
- Updated dependencies [2b79a0c]
- Updated dependencies [d95e52d]
- Updated dependencies [ff8b3f1]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [2b79a0c]
- Updated dependencies [9fab6b1]
- Updated dependencies [2b79a0c]
- Updated dependencies [3130bf4]
- Updated dependencies [600a4c3]
- Updated dependencies [6079d5b]
- Updated dependencies [e6ced92]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [103014c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [ca3ad93]
- Updated dependencies [af67bbf]
- Updated dependencies [d9673e8]
- Updated dependencies [b773056]
- Updated dependencies [b032f65]
- Updated dependencies [0388b0e]
- Updated dependencies [d400274]
- Updated dependencies [0af6fea]
- Updated dependencies [2b79a0c]
  - @giantswarm/backstage-plugin-muster@0.4.0
  - @giantswarm/backstage-plugin-agent-platform-common@1.0.0
  - @giantswarm/backstage-plugin-kubernetes-react@1.0.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.15.0
  - @giantswarm/backstage-plugin-gs@0.71.0
  - @giantswarm/backstage-plugin-analytics-react@0.2.0
  - @giantswarm/backstage-plugin-gs-react@0.1.0
