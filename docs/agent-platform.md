# Agent Platform

The **Agent Platform shell** is the portal's UI for working with agents. It
serves `/`, `/sessions`, `/usage`, `/profile` and `/customize/**` and is built
from the
`agent-platform` plugin (`@giantswarm/backstage-plugin-agent-platform`), the
`muster` plugin and the app's `agentShell` module
(`packages/app/src/modules/agentShell`). Agents run on kagent; the portal talks
to them as the signed-in person.

What a deployment configures is in
**[Agent Platform configuration](agent-platform-configuration.md)**.

The first part of this page summarises the product. The second part, from
"Overview of the create flow" on, is the implementation reference.

## The shell

`app.portals.agentPlatform`, or a person's `agent-platform-shell` feature flag
where it is off, decides whether the shell appears. Where it is on, the shell
owns its routes and the classic portal keeps its chrome everywhere else.

The rail (`AgentShellNav`, `navItems.ts`) lists up to eight pinned sessions,
then every session waiting for the person, then the most recently active ones,
eight unpinned rows in all (`groupRailSessions`). Activity is the later of a
session's start and its last state change; the rail and the sessions list
order by it with one comparator (`byLastActive`). The waiting count beside
"All sessions" opens the list filtered to those sessions. On a phone it becomes a
bottom bar. The **Platform Portal** item appears only where the deployment also
serves the classic portal. The **Notification inbox** (a bell on the rail's
Profile row, and on a phone the Profile item's menu) lists the sessions that
need the person, the MCP servers that wait for their sign-in and what other
portal features send them, with toasts, an unread count in the tab title and
opt-in desktop notifications; see
[The Notification inbox](#the-notification-inbox).

## Sessions and chat

`/` starts a session (`AgentPlatformHome`). The agent implies its installation,
so there is no environment choice; the last-used agent is preselected. The
Slack banner appears only where `agentPlatform.integrations.slack` is on.

The session view (`/sessions/<installation>/<id>`) collapses a
turn's tool calls into one expandable line, takes answers to the agent's
permission requests and questions in a card on the chat bar, and stops a
running turn. Its cost chip shows an estimated cost, the runtime-reported cost
where there is one, tokens and how full the context window is. Pins follow the
person across browsers. A lost runtime is explained in place, with a way to a
fresh session on the same agent.

The sessions list (`/sessions`) offers search once a list has
more than eight entries, the rule every list in the shell follows. Sessions are
always the person's own: kagent answers only for the caller.

## Customize

`/customize` (`CustomizePage`) has the tabs Agents, Skills, Connectors, Models
and Workflows. An environment selector appears when there is more than one
environment.

### Agents

Favorites follow the person across browsers. A `generalInformation` meta-agent
adds a helper banner. Each agent's Harness, and a Harness filter, appear only
when the agents run on more than one Harness.

**New agent** (`/customize/agents/new`) is a wizard: Details, Skills,
Tools, Review. The Skills step exists only when skill repositories are
configured; every skill is pinned to a commit. An `agentManagement` meta-agent
adds a helper that drafts the instructions in a side chat; the form changes
only when the person accepts. Review is agent-manager's dry run, and **Create
agent** deploys as the person. **Propose as pull request instead** appears
where agent-manager supports it.

On the agent page, Edit, Update all skills to latest and Delete appear only
where agent-manager allows writes; an agent that comes from git gets a pull
request instead of a direct change. Update all skills to latest moves every
git skill of the agent to its repository's newest commit. A skill pinned
behind the catalog's newest commit shows "Update available"; the mark comes
from the skill catalog the page reads anyway.

### Skills

The catalog comes from the configured skill repositories, most-used skills
first. A skill's page is a single column. Its Overview says what the skill is
for and where it lives; the latest commit links to the skill's folder at that
commit on github.com. The Instructions tab renders the SKILL.md body without
raw HTML or remote images, and only when the portal can read the file. The
Used by tab lists the agents as the connector page does, and marks an agent
that pins an older commit.

- **Add skill** and **Edit** open a pull request against the skill's
  repository, authored as the person with their own GitHub account (connected
  once through muster if needed). Nothing changes until it is merged. Both
  write the SKILL.md only, and both work for github.com repositories only; a
  skill from another git repository has a read-only page. A `skillCreation`
  meta-agent adds **Create with <agent>** (Edit skill: **Edit with <agent>**),
  which starts a session with that agent about the skill (repository and
  draft, or path, commit and the fields the person changed) for complex,
  nested skills; the agent proposes those as a pull request itself.
- **Evaluate with <agent>** (with a `skillEvaluation` meta-agent) starts a
  session with that agent about the skill's repository, path and commit.
- **Update agents** appears when agents pin an older commit than the newest
  one. It runs Update all skills to latest for each selected agent, which
  re-pins every git skill of that agent, not only this one. An agent from git gets a pull
  request; an agent the person cannot update is listed with the reason.

### Connectors

Connectors are muster's MCP servers, on three sub-tabs by the
`agent-platform.giantswarm.io/tool-group` label the shipping chart sets on the
MCPServer, a family (`spec.family`, one row) and a single server alike:

- **Your connectors** (`/customize/connectors`): servers and families without
  the label, everything the installation or its users registered.
- **Infrastructure** (`/customize/connectors/infrastructure`): servers and
  families labelled `infrastructure`, those for the management clusters the
  platform runs on. `/customize/connectors/families` redirects here.
- **Internal** (`/customize/connectors/internal`): servers labelled
  `agent-platform` (agent-manager, model-manager, cluster-manager) and muster
  itself where it runs. muster's page shows its endpoint to copy for MCP
  clients.

**Add connector** probes the address, sets the sign-in mode (company login,
each person's own account, none, or AWS request signing) and registers the
server. Connectors managed through GitOps point to their source instead of
being editable.

A connector is named for people by the `ui.giantswarm.io/display-name`
annotation on its MCPServer, as agents, models and harnesses are: in the
Connectors list, its page's title, breadcrumbs and document title, the tool
page's breadcrumb, the connector wizard's edit frame, the command palette, the
agent wizard's Tools step and review, the agent page's tools, the reach line,
the session timeline, Usage → Connectors, the workflow pages, the inbox's MCP
sign-in row and the sign-in dialogs. One rule names it everywhere
(`connectorDisplayNames` in the muster plugin): a family takes the display name
its annotated members agree on, and members that disagree leave it its own name;
without a display name a connector goes by its family's name
(`spec.family.name`) or its MCPServer's; and connectors that would read the same
(two annotated alike, or one annotated like another's name, case aside) go by
their own names instead, so no two read alike. URLs, `server:` selectors and
tool names keep the technical name, which Technical details on the Details tab
still shows, and searches match both names.

Add connector keeps the name typed into its Name field as that annotation,
through the `displayName` argument of muster's `core_mcpserver_create` and
`_update` (muster v5.43.0 and later). The technical name derives from it as
before ("Stack Overflow" is registered as `stack-overflow`); a name that is the
technical name already (`jira`) sets no annotation. Editing a connector shows
its display name in the Name field and saves a changed one, sending
`displayName` only when it changes (back to the technical name removes the
annotation); the technical name stays fixed. A family member's Name stays
read-only: its members share one display name, which a rename of one would
split. Whether an installation's muster takes the argument is read from each
tool's input schema (`describe_tool`, validate's and create's or update's on
their own): on an older muster, which refuses unknown fields, the wizard
registers without it, the Name field then shows the technical name, and an
edit keeps it read-only, as before. A schema that cannot be read stops the
save with an error rather than dropping the name unsaid. The annotation can also be
set on the MCPServer directly, for example in its GitOps source or with
`kubectl annotate mcpserver <name> -n <namespace> ui.giantswarm.io/display-name="<Display name>"`;
an edit that does not change the name keeps it.

A connector's page opens on its Tools tab, a list of the tools it offers that
each link to the tool's own page,
`/customize/connectors/<installation>/<connector>/tools/<tool>`.
That page shows what the tool does (Reads or Changes things), its description
under "What it’s for", its calls, errors and p95 latency over the last 30 days
(from the connector's Usage tab's read), its input schema (folded),
a form that runs the tool through muster, and the result, in one column with
no facts beside it. The tool's address carries the tab's search and filter
(`q`, `effect`), so the breadcrumb back keeps them; the browser's Back also
restores how far the list was paged. Addresses under the old
`/agent-platform/connectors/` and `/agent-platform/mcp-servers/` prefixes
redirect, in one hop, to the same page under `/customize/connectors/`, the
installation moved from `?installation=` into the path.

A connector's Usage tab (`…/usage`, not on muster's own page) shows every
caller's tool calls to it over the last 30 days, from muster's dispatch
metrics narrowed to its MCPServers (a family's instances together): tool
calls, error ratio, p95 latency and how many of its tools were called, calls
per day by outcome, every tool it offers with its calls, errors and p95
(never-called tools included), and for a family each instance's. It links to
Usage → Connectors, whose connector table links back to it. Opened from there
it covers that view's window (`?window=7d` or `90d`, 30 days without one),
and its link back keeps it; Details and the tool pages stay on 30 days.

A connector's page ends with a Details tab: sign-in, health, calls over the
last 30 days (the Usage tab's figure) and when it was added, then a Technical
details fold-out with the GitOps
source, the MCPServer and the HelmRelease or Kustomization that applies it,
the configuration (type, URL, timeout, auto start, `spec.meta`), the auth
chain from `spec.auth` and muster's health detail from the status. The
fold-out opens on arrival while muster reports the connector failed. A family
shows one instance's technical details; each instance's own are on its
Instances tab. muster's own page has no Details tab.

### Models

Models are kagent ModelConfigs. **Connect a model** supports OpenAI-compatible
endpoints, Anthropic, Gemini and Ollama; the API key is optional and
write-only. Where the installation runs model-manager, **Model hosting** adds
running models, GPU capacity and the model cache.

### Workflows

Muster's workflows. The portal does not create, edit or delete them; agents
and Git do. A workflow's page splits into Overview, Run it, Usage (its run
statistics) and Details tabs; its ⋮ menu shows the Workflow CR as YAML and,
where Flux reconciles the workflow, where in Git to change it.

The Workflows list and a workflow's page say what a workflow does in the same
badges a tool has: Reads or Changes things. muster marks a workflow read-only
only when every tool its steps can reach is, so Reads holds for all its steps;
a workflow muster lists without that mark shows Changes things. Without a muster
session, or where muster offers the person no tool for the workflow, no badge is
shown. On a workflow, the badge's
tooltip says so ("Every step only reads." or "At least one step can change
things."), on hover, keyboard focus or a tap; a tool's badge has none.

Run it (`/customize/workflows/<installation>/<name>/run`) runs the
workflow as a tool's page runs a tool: muster exposes each workflow as the
tool `workflow_<name>`, and the tab shows that tool's input form and result,
and remembers the last inputs per installation, shared with the tool's own
page. The note beside Run says "Runs as you." when every step calls a
connector that acts with the person's identity, and "Nothing is changed." for
a workflow muster marks read-only. Connectors the steps call that wait for the
person's sign-in are named above the form, with their Sign in, because muster
refuses the run until then. The tab shows no form without a muster session (it
asks for one), on an installation without an `authProvider` (the portal
refuses runs there, since they would act as muster's shared identity), or
where muster lists no `workflow_<name>` tool for the person. A run, whether it
succeeds or fails, refreshes that workflow's run records: Usage, the last run
on Overview and the Customize list.

While a run is in flight, leaving the tab asks first, because its result shows
only there; muster finishes the run either way. The question covers the
page's tabs, clicks on links to other addresses (breadcrumbs, the rail, links
in the page) and, through the browser's own prompt, a reload or a closed tab.
The browser's Back, the command palette and navigation that code starts are
not held: the app's router has no navigation blocker.

## Usage

`/usage` reports over 7, 30 (the default) or 90 days:

- **Overview** — platform health and trends from the LLM gateway.
- **Cost** — spend from the gateway, by agent and model.
- **Connectors** — every caller's tool calls from muster's metrics. Only where
  the muster plugin is registered. Each connector in its table links to that
  connector's Usage tab on the selected installation and window; an instance
  of a family links to the family's, which lists each instance, and a server
  no connector page shows (one since removed) is not linked.
- **Your sessions** — the person's own usage from their kagent sessions,
  limited to kagent's window (`agentPlatform.kagent.sessionUsage.windowDays`,
  30 days by default); wider ranges are disabled there.

Gateway figures cover everyone's traffic and need the installation's metrics
(see the configuration page); without them, Overview and Cost say so and still
show the person's own session figures.

Each installation's metrics start on a different day. When the selected range
reaches back further than the records, Overview, Cost and Connectors say since
when calls were recorded and how many of the range's days that covers;
otherwise they say nothing. Cost shows the change against the previous range
only when the records reach back before it.

## Profile and settings

`/profile` shows who is signed in and the environments the portal
talks to. Other settings stay in the classic settings.

---

## Overview of the create flow

A wizard (`AgentWizardFrame`, bui). The portal composes nothing: the review is
agent-manager's dry run and the deploy is agent-manager's `create_agent`, both
called through the installation's muster as the signed-in person.

1. **Details** — `/customize/agents/new` (`NewAgentPage`). The installation
   select renders nothing on a single-installation portal. **More options**
   holds the model, the runtime, the technical name and extra egress origins.
   `CreateAgentAssist` appears when an `agentManagement` meta-agent resolves.
2. **Skills** — `/customize/agents/new/skills` (`NewAgentSkillsPage`); see
   "Skill discovery".
3. **Tools** — `/customize/agents/new/tools` (`NewAgentToolsPage`): the
   selectors that bound which gateway tools the agent can use.
4. **Review** — `/customize/agents/new/review` (`NewAgentReviewPage`):
   `validate_agent`, **Create agent** through `create_agent`, a pull-request
   variant where agent-manager reports the `commit` capability, and an "Install
   manually instead" fallback from the same values.

Only step 1 validates (name, slug, installation, model); later steps redirect
back to it when those are missing, so a deep link cannot strand the person.

Without `agentPlatform.skills.repositories` the Skills step is skipped, and a
deep link to it redirects onward. `hasRepositories` comes from config alone, so
the decision costs no request.

Editing (`/customize/agents/<installation>/<namespace>/<name>/edit`) is the
same wizard, prefilled, ending in an `update_agent` dry run (see "Editing an
agent").

Form state lives in `NewAgentFormProvider`; installations and their models load
once in `ModelConfigsProvider`; `useAgentManagerAvailability` decides which
installations offer creation (see "Feature detection").

### Model selection

`ModelConfigPicker` lists the selected installation's kagent `ModelConfig`s.
The preselection is the only model, else the installation's default, else the
first. `InstallationSelect` offers only installations known to have at least
one `ModelConfig`, resolved incrementally.

`ModelConfigsProvider` keeps the fleet-wide query cheap:

- **Only kagent installations are queried**
  (`useInstallationInventory().installationsWith('kagent')`, narrowed by the
  installation scope). The home installation is queried first, the others once
  it has answered; the query waits while the inventory probes.
- **API-version discovery is skipped** (`enableDiscovery: false`): the code
  types against `v1alpha3` (the kagent API v2 line) only, so discovery would add
  two round-trips per cluster.
- **Failures are surfaced.** Installations that fail (unreachable, or `403`:
  listing across all namespaces is admin-only) become
  `unreachableInstallations` and a warning, so an empty result is told apart
  from a failed one.

### Model management (the Models tab)

The Models list (`CustomizeModelsPanel`, Customize → Models at
`/customize/models`) lists the fleet's ModelConfigs through
`ModelConfigsProvider` and lets an admin create, edit and delete them. Status
combines the `Accepted` and `ResolvedRefs` conditions, named by the one that
failed: Not accepted (`Accepted` is False: kagent rejects the settings),
Incomplete (`ResolvedRefs` is False: it accepts them but cannot find what they
refer to, such as the key Secret) or Pending; a ModelConfig has no workload,
so there is no `Ready`. The controller's message sits in a hint beside the
status.

One model's page (`ModelDetailPage`) is at
`/customize/models/<installation>/<namespace>/<name>`, routed by the Models
tab's router (`ModelsRouter`); the old
`/agent-platform/models/<installation>/<namespace>/<name>` redirects there. It
splits into Overview (the serving status, the facts, then
a Technical details fold-out with the owning Helm release, the resource and
the conditions with their reason and message), Usage (`…/usage`: the gateway's
30-day figures and spend per day) and Used by (`…/used-by`, counted in the
tab: the agents that use it with their spend on it). The former `…/details`
address lands on Overview. A model agents cannot use yet says why at the top
of Overview in plain words (`modelProblem`): what is wrong and what to do,
from the reason kagent gives on the failed condition (a missing or incomplete
key, an endpoint address it cannot find, settings it rejects, an unsupported
provider, with a fallback per condition), offering Edit where the person may
edit and naming whom to ask otherwise. Reasons, condition names and the
controller's messages stay in Technical details, which open on arrival; the
alert's Show conditions reopens them and scrolls them into view.

The form (`NewModelPage`, `ModelConfigFormFields`; edit through
`EditModelPage` at `/customize/models/<installation>/<namespace>/<name>/edit`)
supports **OpenAI** (every OpenAI-compatible endpoint: vLLM, llama.cpp,
OpenRouter), **Anthropic**, **Gemini** and **Ollama**, with a per-provider
endpoint (`spec.openAI.baseUrl`, `spec.anthropic.baseUrl`, `spec.ollama.host`)
and `spec.tls.disableVerify` for self-signed endpoints. CRs using the CRD's
other providers (AzureOpenAI, Bedrock, the VertexAI variants, SAPAICore) are
read-only, and the detail page says why.

**Key Secrets follow the agentlab contract** (`platform.extraModels`,
giantswarm/agentlab#44): the Secret is `kagent-<model name>` in the
ModelConfig's namespace, with one key named after the provider's canonical
env var (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`). The name is
fixed because the kagent controller injects it as that env var and the ADK
runtime reads exactly those names. A model connected without a key still gets
a placeholder Secret, because an agent pod without the env var crashloops.
Ollama is the one keyless provider (no Secret).

**The API key is write-only.** The edit form's empty key field leaves the
Secret alone; a value replaces its contents (`data: null` plus `stringData` in
one merge patch). Changing the provider always rewrites the Secret, with the
key or the placeholder, because the old Secret holds the old env-var name. The
portal writes only Secrets named by its own convention: a CR referencing a
hand-provisioned Secret keeps that reference, and such a Secret is never
deleted with the model.

**Writes go through the Kubernetes proxy** (`createResource`, `patchResource`,
`deleteResource`) with the caller's own OIDC token, so nothing in between holds
the key and apiserver errors (`ConflictError` on a taken name) show inline. The
`SelfSubjectAccessReview` gates decide only what is shown.

**Ownership guards.** Edit and delete are withheld for CRs rendered by Helm,
applied by a Flux Kustomization, or labelled `app.kubernetes.io/managed-by` by
anything but the portal; the model page names the owner in a "Managed by"
fact. A CR without markers (applied with kubectl) is editable. The portal
labels what it creates `app.kubernetes.io/managed-by: giantswarm-backstage`.

For a Helm-rendered model, Technical details name the release from the
CR's `helm.toolkit.fluxcd.io/*` labels and `meta.helm.sh/*` annotations. Where
a Flux HelmRelease rendered it, the page reads that HelmRelease with the
person's token and shows its chart, applied version and Ready state, linked to
the gs deployment page (`deploymentDetailsExternalRouteRef`) when gs is
enabled. A release Helm installed without Flux has no resource to read, so
only its name shows.

**Delete refuses while referenced.** The mutation lists the namespace's
`Agent`s fresh and refuses while any references the model. A failed read also
refuses, because deleting a referenced model breaks every agent on it.

### The serving layer (Model hosting)

**Model hosting** (Customize → Models → Model hosting) shows what is served, or
downloaded and ready to serve, on installations with a serving layer. It merges
_serving sources_ in `ServingProvider` (`lib/serving.ts`: `ServedModel`,
`ServingCapabilities`, `ServingSourceSnapshot`, `findServedModel`,
`mergeServingSnapshots`):

- **KServe CRs** (`useKServeServingSource`): `LLMInferenceService`s
  (`serving.kserve.io/v1alpha2`), nodes and workload pods
  (`app.kubernetes.io/part-of=llminferenceservice`,
  `app.kubernetes.io/name=<object>`), read with the person's RBAC on
  installations serving `serving.kserve.io`. Read-only, plus the GPU capacity
  panel. The installation's model-serving discovery ConfigMap supplies the
  accelerator resource name and the models Gateway.
- **model-manager** (`useModelManagerServingSource`): on installations whose
  muster lists [model-manager](https://github.com/giantswarm/model-manager),
  read through its `x_model-manager_*` tools as the person
  (`ModelManagerApiClient`). model-manager fronts a serving backend (Ollama on a
  laptop agentlab, KServe on a GPU install) and reports **capability flags**
  (`list_backends`).

**Everything beyond the table follows the capability flags, never the backend
name.** `pull` adds _Pull model_ and the downloads list (with `search`, _Import
from Hugging Face_ instead); `load`, `unload`, `delete` and `wire` fill the row
menu; `nodeInventory` renders the GPU capacity panel. An Ollama backend without
a GPU panel, presets or fit check is therefore ordinary state. Optional columns
(Size, Memory, Features, Node, GPUs) appear only when rows carry the data.
Header actions are in `ModelHostingActions`, headline figures in
`ModelHostingKpis`. Each create flow is a page of its own
(`HostingFlowRoutes`): `serve`, `import`, `pull`, `add-backend` and
`capacity/add-pool` under `/customize/models/hosting`.
Serve model reads its seed (`installation`, `backend`, `cluster`, `pool`,
`model`) from the query.

**One actions menu per row** (`ServedModelActions`), following the
capabilities and the row's state. **Stop serving** goes through model-manager
where it operates the row (which also removes the ModelConfig it created), and
otherwise deletes the CR with the person's RBAC (ModelConfigs stay). _Remove
model config_ is withheld for a ModelConfig model-manager only recognises
(`modelConfig.managed: false`): it never deletes what it did not create.

**KServe through model-manager** (`backend: kserve`): the inventory is the
per-node download cache plus the LLMInferenceServices. A cached model nobody
serves is an `available` row named after its Hugging Face repository. A served
one is named after its LLMInferenceService and takes its readiness and serve
timeline. Where the person can also read the CR, the two rows are folded into
one (`mergeServingSnapshots`, by namespace and name, never by host, since every
routed model answers on the models Gateway's one host). The GPU panel adds each
node's memory budget and model cache (`list_nodes`).

**Import from Hugging Face** (`search` + `pull`; `ImportModelPage`) searches
the hub (`search_models`) and checks fit for a preset and node (`check_fit`:
weights from the hub's file tree plus the preset's overhead against the node's
memory budget). A model that does not fit cannot be submitted; a gated one
needs the installation's hub token. The download is a pre-warm `pull` with
`preset` and `node`. Serving it afterwards uses the same preset, whose name is
the LLMInferenceService's and the cache directory's, so the weights are found.

**Readiness** is backend-neutral: `ready`, `available` (downloaded, not in
memory; Ollama loads it on the first request), `notReady`, `pending`. A model
without the `tools` feature is flagged, because agents cannot use it.

**APIs a served model answers** (KServe, model-manager 1.1.0 or newer): a Ready
model reports the interfaces its server registered (Chat completions,
Responses, Messages, count_tokens, Embeddings, from vLLM's route list) and the
runtime version. With the platform's LLM endpoint (model-manager 1.2.0 or
newer) a model also reports its **public name**, the `model` a client sends,
and the endpoint URL; the ModelConfig reaches the model there. At Ready the
timeline offers one `curl` per interface with the right auth: the person's Dex
token on the models Gateway, an LLM-endpoint API key outside the cluster, none
in-cluster (`lib/servedModelApi.ts`).

**Pulling** starts a job (`pull_model`) that the downloads panel polls every
2 s (`list_jobs`) until it reports the outcome and the ModelConfig it wired.
Jobs live in model-manager's memory. A second pull of the same reference joins
the running job.

**ModelConfig linkage** uses one matcher (`findServedModel`), most exact first:

1. the ModelConfig the backend created for the model (`modelConfig`);
2. the endpoint hostname plus the ModelConfig's `model` id (an Ollama host
   serves every tag on one hostname; agentlab's `qwen35-local` resolves to
   `qwen3.5:9b` this way);
3. the endpoint path (`/<namespace>/<name>` on the models Gateway);
4. the single served model on that host.

A Gateway path naming no listed object, or a workload hostname nobody serves,
reads as a missing LLMInferenceService (`resolveClientServing`).

**Mixed installations.** Sources are merged: a model both list is one row,
capabilities are OR-ed per flag, GPU nodes are one row per node, and
model-manager decides the backend label. agentlab, with KServe CRDs next to a
model-manager, is exactly this case.

**How the portal reaches model-manager.** There is no model-manager URL, REST
client or proxy route. Every call is one `x_model-manager_<tool>` call through
`musterApi.callTool()` with the person's token for the installation's muster;
model-manager forwards the Dex token, so writes land as the person. An
installation has model-manager when its muster lists the `model-manager`
MCPServer (`core_mcpserver_list`, `useModelManagerInstallations`); no portal
config names it. Serving is `load_model` as the person: model-manager composes
the `LLMInferenceService` from the preset onto the platform's
`LLMInferenceServiceConfig`s and wires the ModelConfig. Refusals arrive as
`"<code>: <message>"` and map in `lib/modelManagerBackends.ts`:

| Code            | Error                     | Meaning                          |
| --------------- | ------------------------- | -------------------------------- |
| `not_found`     | `NotFoundError`           | —                                |
| `unsupported`   | `ForbiddenError`          | The capability was never offered |
| `conflict`      | `ConflictError`           | Name the backend                 |
| `does_not_fit`  | `PreconditionFailedError` | A verdict, not a fault           |
| `backend_error` | `ServiceUnavailableError` | —                                |

muster's "not connected" answers become `ModelManagerNotConnectedError`, shown
as an error rather than a connect flow.

**Try it** is the one model call the portal's backend makes itself
(`POST /served-models/try`, `tryRouter.ts`), because the browser cannot post to
the models Gateway cross-origin. It sends two chat completions to the endpoint
model-manager reports, for the ModelConfig's `spec.model`: one without a token
and one with the person's installation token
(`backstage-served-model-authorization`). The route accepts only endpoints
under the installation's `gs.installations.<name>.baseDomain` and sends the
token nowhere else.

### Skill discovery

Skills come from `agentPlatform.skills.repositories`: github.com through the
REST API, any other http(s) host through a depth-1 git clone
(`discoverAgentSkillsFromGit.ts`). A skill is any directory containing a
`SKILL.md`; its frontmatter `name` and `description` drive the picker. Listings
come from an in-memory cache (`SkillDiscoveryCache`), served stale when the
upstream fails, and carry `readAt`, `stale` and `truncated`.

Discovery runs in gs-backend (`GET /agent-skills?repoUrl=…`,
`src/agentSkills/discoverAgentSkills.ts`), authenticated with the GitHub
integration (public repositories also work anonymously). `useSkillCatalog`
aggregates all repositories, and one failing repository does not fail the rest.

The read routes (`/agent-skills`, `/agent-skills/content`,
`/agent-skills/content/file`) answer only for configured repositories and
return 400 for any other, because they read with the portal's own GitHub
token. On a cache miss, a read at a commit goes through `UpstreamReadGuard`
(`src/agentSkills/upstreamReadGuard.ts`): it remembers a 404, 409 or 422 for
five minutes, shares concurrent reads of one key, and runs at most two clones
and four GitHub reads at once. Up to 32 more wait per pool; past that the route
answers 503.

Skill selection is its own step because repositories get large (one internal
repository holds 100+ skills):

- **Grouped by repository, then subfolder** (`src/lib/skillGrouping.ts`): the
  skill's own directory and structural `skills` segments are dropped, so
  `plugins/gs-base/skills/registries` groups under `gs-base`. Root-level skills
  render without subgroups. No per-repository configuration.
- **Search keeps the grouping** (`matchesQuery` from `ui-react`, token-boundary
  prefix matching, AND semantics). Expansion is controlled and re-seeded when
  the query or the matching set changes: a search opens every matching
  repository; without a query only a catalogue up to `AUTO_EXPAND_MAX` opens.
  bui's `defaultExpandedKeys` applies only on mount, so without this a collapsed
  repository would hide its matches.
- **A selected count and the review summary** name the selection, because a
  query can hide every selected card.

`NewAgentPage` calls `useSkillCatalog()` to start discovery during step 1 and to
decide whether step 2 exists.

**Skills are pinned at discovery time.** The route resolves the ref to its head
commit (`GET /repos/{owner}/{repo}/commits/{ref}`, `sha` media type) and reads
the tree and every `SKILL.md` at that commit, so the listing is one snapshot
and every skill carries its `commit`.

A selected skill becomes a chart 1.x `skills[]` entry,
`{ name, path: <skill dir>, git: { url: repo, commit } }` (`lib/agentSpec.ts`,
`skillEntryOf`). The portal sends the commit, never a branch, so what the
person picked runs until they update it. Root-level skills omit `path`; agents
without skills omit `skills`. There is no per-skill credential (private skill
repositories are separate platform work).

### Adding, editing and evaluating a skill

Skills change only through pull requests. `AddSkillPage`
(`/customize/skills/new`) and `EditSkillPage`
(`/customize/skills/edit/<owner>/<repo>[/<dir>]`) call gs-backend's
`POST /agent-skills/pull-request` with the person's GitHub token
(`useProposeSkill`). The route accepts github.com repositories only, and
`canProposeSkillTo` (`lib/skills.ts`) mirrors that check in the UI.

- **Add** creates the branch `add-skill/<name>` and puts `<name>/SKILL.md`. The
  commit and the pull request are both `feat: add skill <name>`, so a squash
  merge follows conventional commits either way. It answers 409 when the skill
  name exists.
- **Edit** (`kind: 'update'`) creates `update-skill/<directory as a slug>` (the
  repository name for a root-level skill) and rewrites `<dir>/SKILL.md` with the
  file's blob sha, keeping frontmatter keys the form does not show. The commit
  and the pull request are both `fix: update skill <name>`. It answers 409 when
  the default branch's file changed since the pinned commit, 404 when the file
  is gone, and 422 when nothing changed.

Either way, 409 also means the branch exists. The edit form is prefilled from
`GET /agent-skills/content` at the pinned commit: through the contents API for
github.com, and from discovery's clone otherwise, which answers 409 once the
branch has moved on.

**Evaluate with <agent>** starts a session with
`metaAgents.skillEvaluation` (`useMetaAgentHandoff('skillEvaluation',
'skillDetail')`) and opens it (see "Starting a session"). The first message names the skill, repository, path, commit and branch, and
asks for a report and a pull request with improvements.

### The runtime is a Harness

The runtime picker (`HarnessPicker`, `lib/harnesses.ts`) lists the
`harnesses.api.kagent.dev` of the chosen model's namespace, read with the
person's RBAC. A card's title is the Harness's `ui.giantswarm.io/display-name`,
else its runtime family (`spec.kagent`, `spec.claude`, `spec.codex` or
`spec.byo`), with name and image beneath. The pick is the Harness name, which
an Agent sets as `spec.harnessRef.name` and agent-manager takes as `harness`.

The platform Harness (`get_info`'s `harness.name`) is listed first and is the
default; picking it leaves `harness` out of the request. Any other pick is sent
to `validate_agent` and `create_agent`. A single Harness shows read-only, none
shows no section, and a failed read shows a warning. Changing the installation,
or picking a model in another namespace, drops the pick. The Harness is fixed
at create; the edit page shows it read-only.

### Extra egress origins

An agent reaches its model, MCP servers, skill and plugin sources and telemetry
without configuration; everything else is closed. **Extra egress origins** (on
create and edit) lists further HTTP(S) origins, one per line, carried by
agent-manager as `egress` and rendered as `Agent.spec.egress`
(kagent-dev/kagent#3019). Examples: `https://github.com:443`,
`https://*.githubusercontent.com`. `*` matches exactly one host label and needs
two labels under it; nothing opens every host. `lib/egress.ts` applies the
CRD's rules client-side: an http(s) origin with a lowercase host and optional
port, no path, at most 270 characters each, at most 64 entries, no duplicates.

### The review page is agent-manager's dry run

The review page turns the form into agent-manager's create contract
(`lib/agentSpec.ts` → `AgentSpec`: `namespace` = the ModelConfig's, `name` =
the slug, `displayName`, `description`, `systemMessage`, `modelConfig`,
`harness` when not the platform Harness, `iconUrl` from the avatar rule,
`skills` pinned to commits, `toolset` from the Tools step, `egress` when set)
and validates it (`useValidateAgent` → `x_agent-manager_validate_agent`). The
answer is rendered verbatim:

- **`manifests.helmRelease`** and **`manifests.ociRepository`** — the Flux
  objects a create applies. The `OCIRepository` tracks the chart's **`1.x`**
  range (`DefaultChartSemver`), so an agent never moves to 2.0.
- **`errors[]`** — schema violations and failed preconditions (an unknown
  ModelConfig, an unpinnable skill, a malformed selector). **Create agent** is
  withheld while any is present; `notes` are shown as information.
- **`manifests.values`** — the composed values, offered as the manual
  fallback's `values.yaml` with a `helm install` command from `get_info`'s chart
  (`ociUrl`, `latestVersion`).

A full toolset adds a "Full gateway access" warning.

`get_info` (`useAgentManagerInfo`) supplies the chart's OCI URL and range, the
newest version, the platform Harness's name, the muster MCP URL (`muster.url`),
the Flux ServiceAccount and the capability flags. The portal has no chart
knowledge of its own; an empty system prompt is sent as absent, so the chart's
default applies.

### The seam: agent-manager over muster, as the person

agent-manager speaks MCP only. muster registers it as the MCPServer
`agent-manager` and exposes its tools as `x_agent-manager_<tool>`; the portal
calls them with `musterApi.callTool(name, args, installation)`
(`apis/AgentManagerClient.ts`), sending the person's token for that muster (the
main-login token at home, the brokered one elsewhere). agent-manager therefore
writes with the person's credentials: `managedFields` name the person, and
their RBAC decides. There is no agent-manager URL or REST client in the portal.

`classifyAgentManagerError` (`lib/agentManager.ts`) tells two failures apart:
agent-manager's refusals (`<code>: <message>`, such as `forbidden`, `conflict`,
`invalid_request`) become an `AgentManagerError` in its words; muster's "not
connected" answers become `AgentManagerNotConnectedError`, and the page offers
`ServerSignIn` for `agent-manager`. Reads use `['muster', 'agent-platform', …]`
keys (`lib/queryKeys.ts`): never persisted, and re-read after sign-in.

### Feature detection

Only installations whose muster lists agent-manager (`core_mcpserver_list`
through `musterApi.listServers`) are offered for creation
(`useAgentManagerAvailability`, `InstallationSelect`). One with models but no
agent-manager is named with the reason. There is no fallback write path.

### Deploy through agent-manager

**Create agent** calls `create_agent` with the validated spec
(`useCreateAgent`). agent-manager composes the `HelmRelease` (and the
namespace's shared `OCIRepository` when missing), pins the skills, validates the
values against the chart's `values.schema.json` and applies both as the person.
No scaffolder task, `kube:apply` or portal-minted token is involved.

On success the agent's page takes over (`useAgentCreatedHandoff`), and
`AgentCreationProgress` polls `get_agent_status` every 3 s until the agent's
Harness (`status.agent.harness`) has a verdict. The status card derives the
same verdict from `status.harnesses[]`. A `not_found` right after the create is
polled through. `ready` ends the poll. A `failed` verdict is shown but still
re-read every 5 s, the pace the page reads a converging Agent at, because right
after a create kagent can briefly report the agent's own tool server as an
unresolved reference, and that clears to Ready without a reload. A read error
ends the poll as before, and so does a `not_found` after a `failed` verdict:
the agent is gone. agent-manager reporting the transient state as `progressing`
is the proper fix (giantswarm/agent-manager#145). The installation's cached
`kagent.dev` lists are invalidated after the write.

A refused write stays on the review page with agent-manager's message:
`forbidden` (RBAC), `conflict` (existing name, or a GitOps-owned namespace),
`invalid_request`. The portal never passes `force`.

**Commit** (a pull request to the owning GitOps repository instead of an apply)
is `create_agent` with `mode: commit`, offered only when
`get_info.capabilities.commit` is `true`. The result is the pull request URL,
or `auth_required` with a link to connect the repository.

### Shared OCIRepository per namespace

agent-manager names the `OCIRepository` after the chart (`agent`): one
`OCIRepository/agent` per namespace, one `HelmRelease` per agent (named after
the slug). `create_agent` reuses an existing source
(`created.ociRepository: false`), and delete keeps it while another release
references it. Sharing is sound because every agent tracks `1.x`.

### Namespace

The `HelmRelease`, `OCIRepository` and rendered objects land in **the selected
`ModelConfig`'s namespace** (for example `kagent`): it exists, the platform
Harness watches it, and the agent sits next to its model. agent-manager accepts
only the namespaces it manages (`get_info.namespaces.managed`).

### Flux multi-tenancy ServiceAccount

Giant Swarm management clusters require a `HelmRelease` in a tenant namespace
to name its ServiceAccount. agent-manager takes it from
`flux.helmReleaseServiceAccount` (set by the Agent Platform chart, default
`kagent-flux`) and reports it as `get_info.flux.serviceAccountName`. The portal
keeps no copy.

### What is gone

Before 1.0 the portal composed manifests itself (`composeManifests.ts`,
`useAgentChart`) and applied them through the `agent-deployment` scaffolder
template (`useDeployAgent`). That code and the keys `agentPlatform.chart.*`,
`agentPlatform.fluxServiceAccountName` and `agentPlatform.deployTemplateRef` are
gone. `kube:apply` and `scaffolder-backend-module-gs` remain for other
templates; `agent-deployment` no longer exists in
`giantswarm/backstage-catalogs` main.

## The installation scope

Sessions, Agents, Models, Connectors, Workflows and Usage share **one
installation scope**: `'all'` (the default) or one pinned installation. It is a
module store in the `gs` plugin (`useInstallationScope`,
`plugins/gs/src/apis/installationScope/`) read through `useSyncExternalStore`,
not a React context, because the muster tabs are a different plugin with their
own providers.

The scope is set by `EnvironmentSelect` (and `UsageScopeBar` on Usage), shown
only with more than one environment. It offers every
installation whose inventory has kagent, muster or KServe, home first, with
its state; a portal with one installation renders no selector. "Not reachable
from this portal" comes from the kagent backend's probe on kagent-backed lists
and from the muster backend's probe on Connectors and Workflows.

- **Sources, in order.** `?installation=` wins while present. Otherwise the
  store, mirrored to localStorage as `muster-installation` (the muster picker's
  old key). A stored value naming the _home_ installation reads as `'all'`,
  because the old picker wrote its default there for everyone.
  `useInstallationScopeUrlSync` reconciles URL and store; `setScope` writes
  store, localStorage and URL at once.
- **Usage reads one installation, never the fleet.** Under `'all'` it reports
  on the home installation and says so; see
  [One installation at a time](#one-installation-at-a-time).
- **Home first.** Under `'all'`, `AgentsDataProvider`, `SessionsDataProvider`
  and `ModelConfigsProvider` query the home installation alone and the others
  once it has answered, so the person's own rows appear before any other token
  is minted. Every list is one flat table; failed installations are named in a
  warning below it. Tables drop their Installation column when rows can come
  from one installation only (`isSoleInstallation`,
  `lib/soleInstallation.ts`) and then sort by name (`useVisibleSort`).
  `sortAgentRows` and `sortSessionRows` put home rows first.
- **Pinning** narrows every tab (`applyInstallationScope`, `ServingProvider`
  included). Connectors and Workflows show the home muster under `'all'` and
  the pinned installation's muster otherwise; `MusterInstanceProvider` reads the
  scope and writes no default back.
- **Naming.** Detail pages carry an `InstallationChip`; the new-session picker
  names installations once agents span more than one (`agentOptionLabel`).

The tabs share one react-query client, so the inventory is read once per page
load.

## The Sessions tab

`/sessions` lists the person's kagent sessions across the fleet
(`SessionsTable`); a session starts on the shell's start screen (see "Starting
a session"). Renaming and deleting are described below.

### The first-run state

Neither Sessions nor Agents renders an empty table. Sessions shows
`ShellSessionsEmpty` only when the empty answer is final:

- **Nothing could be read** is not an empty history: the "couldn't read"
  warning stays. This is why the branch tests `unreachableInstallations`, not
  only `rows.length`.
- **Something must have been queried.** At least one scoped installation must
  be outside `notReachableInstallations`. Every installation need not be
  reachable, since a local portal almost always has unreachable ones.

### Why it needs a backend

kagent **sessions are not Kubernetes resources**. On the kagent API v2 line a
`Session` (one person's conversation with one `Agent`, which names its
`Harness`) lives in the controller's database and is served over **gRPC**:
`SessionService`, the A2A v1 `A2AService` for turns, and `SystemService` for the
caller's identity. Neither the Kubernetes proxy nor the browser can reach that
(gRPC needs a server-side client, and the host is cross-origin).

`agent-platform-backend` speaks native gRPC (connect-node, HTTP/2) to each
controller route and serves JSON and SSE. Identity is **the bearer only**: the
person's per-installation Dex ID token arrives in
`backstage-kagent-authorization` (`Authorization` carries the Backstage
identity, as in `muster-backend`) and becomes the gRPC `authorization`
metadata. The backend never sends an identity header: agentgateway derives the
caller from the token's `email` claim and drops inbound identity headers (plan
decision D4), so such a header would be useless through the gateway and
impersonation without it.

The origin is `https://agentgateway.<baseDomain>`, the connectivity chart's
controller route (`kagent.controllerRoute.hostname`, default
`agentgateway.<domain>`), whose `GRPCRoute` serves the controller's services and
which the chart itself writes as `apiBaseUrl`. It has no path (gRPC matches by
service) and is overridable in
`agentPlatform.kagent.installations`. `kagent.<baseDomain>` is the kagent UI's
`HTTPRoute` and carries no gRPC. An `http://` origin is plaintext h2c, for
in-cluster Service URLs only.

### Prerequisite: the connectivity chart's controller route

The backend requires a **kagent API v2 controller behind agentgateway's gRPC
controller route** with its JWT policy on (agent-platform 4.0's connectivity
chart, `kagent.controllerRoute.enabled`). That route is the whole
authentication: a refused token answers 401, and an `apiBaseUrl` that bypasses
it attributes every call to the controller's default user, which the identity
probe reports (see "User scoping").

### Earlier conversations are not here

Conversations were **not migrated** to the API v2 line (plan decision D9), and
the Sessions tab does not say so: a person whose sessions predate the migration
sees only newer ones, or the empty state.

### What the list can and cannot show

A kagent API v2 `Session` carries `id`, `creator`, `agent` (namespace and name),
`state`, `operation`, `failure`, `created_at`, `updated_at`, `name`,
`context_id` and runtime fields, and nothing about cost or outcome. The columns
are therefore Session, Agent, State, Environment and Last active; the
prototype's other columns and its summary band have no data. Environment is
dropped when rows come from one installation.

**Last active** is not `Session.updated_at`, which moves only at creation and on
`CREATING` → `READY`, never on a message. It is the later of the start and the
newest state change from the states summary, so a session the summary does not
evaluate shows its start. The detail page shows only the start, and no
Duration. Read the newest task's time from `ListSessions` once
kagent-dev/kagent#2397 exposes it.

- **Only the caller's sessions exist.** kagent lists with the caller as creator
  and has no cross-user endpoint.
- **Titles are ours.** The controller does not auto-title (see "Titles are ours
  to derive"); a session started elsewhere may have none.

#### Session ids come in two shapes, and neither is ours

The controller assigns ids when agent-manager's `start_session` creates the
Session; sessions started from Slack by klaus-gateway have another shape. An id
is **opaque**: never parse it or assume hex or a UUID. The code only
`encodeURIComponent`s it.

Creates carry a browser `request_id`, and the controller is idempotent on
(creator, request id), so a lost create answer returns the existing session on
retry (see "Create, navigate, then send"). An answer without an id fails
loudly and says to check the list.

### Fleet behaviour

Each installation is an independent kagent, so reachability and auth vary:

1. Candidates are the inventory's kagent installations
   (`inventory.installationsWith('kagent')`) within the scope, home first.
2. `GET /kagent/installations` says which have an endpoint and whether it is
   **reachable from the portal** (`reachable: true | false | 'unknown'`, from a
   cached unauthenticated probe; see the backend README). Session queries wait
   for it, because each doomed request would mint a Dex token first. A `false`
   installation is never queried and is listed as not reachable. If the
   allowlist fails, the inventory's kagent installations are used. It is cached
   under `kagentInstallationsQueryKey()`
   (`['agent-platform', 'kagent', 'installations', 'v2']`, versioned because the
   persisted shape changed, backstage#2264).
3. One react-query per installation; rows are merged and tagged.
4. `isLoading` is true only while no rows exist; later loading shows as a thin
   progress bar.

Failures are classified as **absent** or **unwell**:

- **Silent** — `404`, which the backend returns for every "no kagent here":
  kagent's own 404, an unknown-installation `400`, and connection failures (DNS,
  TLS, refused).
- **Reported** in `UnreachableInstallationsAlert` — everything else: kagent
  `5xx` or `429`, timeouts, unreadable bodies. Otherwise a degraded
  installation's sessions would vanish silently.

An in-band `{error: true}` on a `200`, or a `data` that is not an array, also
throws. A partial read keeps the readable rows and logs a console warning.

**Why `404`, not `5xx`.** `MiddlewareFactory.error()` logs `>= 500` at `error`,
and the root logger forwards `warn` and `error` to Sentry. With kagent on two of
fifteen installations, a `5xx` for "no kagent here" would raise about 26 Sentry
events per page view per user, one issue per installation. `500` is reserved
for the actionable case; logging at `debug` in the client does not help,
because the middleware logs the throw.

### Caching: user-scoped data is never persisted

The plugin persists its query cache to `localStorage` for an hour, which suits
installation state such as Agents and ModelConfigs.

Session rows, the identity probe's subject (an email) and a session's tasks
(the whole conversation) are excluded via
`dehydrateOptions.shouldDehydrateQuery`; otherwise they would outlive sign-out
on a shared workstation and rehydrate for the next user (with
`staleTime: 60_000`, without even a refetch). `session-tasks` is also too big:
a 4-turn session was about 500 KB against the 2 MB persisted budget. The
exclusions also cover `session-states`, `session-usage` and every `muster` key.
The filter composes with `kubernetes-react`'s `shouldPersistQuery`, so only
successful queries persist.

**The blob is versioned.** `PersistQueryClientProvider` gets
`buster: AGENT_PLATFORM_CACHE_BUSTER` (`api.kagent.dev/v1alpha3`) and discards a
blob with another buster, so a CR schema change (`kagent.dev/v1alpha3
AgentTemplate` to `api.kagent.dev/v1alpha3 Agent`) starts from an empty cache.
Query keys carry group, version and plural
(`['cluster', <installation>, 'list', 'api.kagent.dev', 'v1alpha3', 'agents']`),
so an old entry is never read as the new shape; the buster stops it being kept.
Shape checks on unversioned entries (`isKagentInstallationList`) stay. Bump the
buster with the next schema change; a change to one query's contents needs a
new query key.

### User scoping

A controller reached without identity in front attributes every caller to
`admin@kagent.dev`, presenting a shared list as the person's own. The
`/kagent/me` probe (`SystemService/GetCurrentUser`, answering
`{sub: <the email agentgateway set>}`) detects this per installation, and the
UI warns. The flag is **tri-state**: `undefined` means unknown, and the UI warns
only on an explicit `false`.

### Version tolerance

kagent ships no OpenAPI spec and the fleet runs mixed versions, so tolerance
lives in the parsing layer (`agent-platform-common`), not in version detection.
**Two wires are read**: the API v2 line's proto3 JSON (`{sessions: […]}`,
`{tasks: […]}` with `TASK_STATE_*` states and oneof parts, `StreamResponse`
frames) and the 0.10 REST envelope. The v1 shapes are parsed by their own
schemas (`kagentA2aV1.ts`, `kagentSessionRecord.ts`) and **normalised into one
internal shape**: `kind`-discriminated parts and events, lower-case hyphenated
states, agent artifacts merged into the history, and the HITL extension's
request rendered as the confirmation call the panel reads. Fixtures were
recorded on the pinned line (`__fixtures__/*.kagent-4a91c273.json`). Rules for
both:

- Permissive zod schemas: unknown fields pass, any field may be absent or
  retyped, and rows validate one at a time.
- Envelope tolerance: `data` absent (Go's `omitempty`, meaning no sessions),
  `data: null` or a bare array. An in-band `{error: true}` on a 200 is
  reported.
- Go zero time (`0001-01-01T00:00:00Z`) and unparseable timestamps are dropped
  and shown as a dash.

Version-matrix fixtures in `agent-platform-common`'s `__fixtures__/` (including
a live v0.9.9 capture and the API v2 recordings) assert identical
normalisation.

`source === 'agent'` (A2A subagent) sessions are excluded, though on API v2
`normalizeSessionRecord` always sets `source: 'user'`.

## The session detail page

`/sessions/<installation>/<id>` shows one session. The
installation is in the path because kagent ids are unique only within one.

### Two reads

| Route                  | RPC                                | Used for                                                        |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `…/sessions/:id`       | `SessionService/GetSession`        | the session: title, agent, runtime state, timestamps, existence |
| `…/sessions/:id/tasks` | `A2AService/ListTasks` (all pages) | the conversation, its state, and token usage                    |

Every A2A call is addressed the way the gateway routes: the Agent as `tenant`
(`<namespace>/<name>`) and the session as `contextId` (the controller keeps the
context equal to the session id; `ListTasks` filters by it). No metadata
routes anything. The backend learns a session's Agent from the preceding list,
create or read, and otherwise reads the Session once. User messages are in each
task's `history` and agent output in its `artifacts`; the common package merges
them by the controller's `kagent.dev/timeline-position`.

Timestamps exist per task, so the timeline shows them per turn, not per item.

### Refreshing

Both reads poll (`lib/kagentSessionPolling.ts`):

| Read             | Interval                                                                            |
| ---------------- | ----------------------------------------------------------------------------------- |
| the session      | a flat 60 s                                                                         |
| the conversation | **10 s** while the newest task is in an active A2A state and recent, 60 s otherwise |

The session object does not move while an agent works; it polls only so a
rename or delete elsewhere shows. The conversation's tier is decided from the
data in hand, as `getAgentRefetchInterval` does for agents.

- **There is nothing cheaper to poll.** No conditional read exists, and
  `updated_at` does not move on turns.
- **10 s, not the agents' 5 s**, because a poll moves the whole conversation
  (about 500 KB for four turns), re-parsed through `a2aTaskWireSchema` and
  deep-compared on the main thread.
- **The age bound is 5 minutes, not the agents' 3.** It stops an agent that
  died mid-turn from pinning the fast tier, and it tracks an agent turn, which
  can run minutes.
- **Past the bound the turn is stalled, not idle.** `readTurnProgress`
  (`agent-platform-common`) reports `working` while the newest task's timestamp
  moved inside the bound and `stalled` after; terminal, human-waiting and
  never-run sessions are neither. Stalled renders as its own row (see "Stopping
  a turn") because kagent still holds the task active and refuses a second
  message. The 2026-09-13 incident was this case: a turn cancelled at the
  caller's 30 s deadline left the task `submitted`, and the composer accepted a
  send that would 409.
- `input-required` and `auth-required` start on the fast tier, relax after the
  bound, and re-engage when the newest task's timestamp advances.
- **A terminal session relaxes to 60 s rather than stopping**, because a kagent
  session can still be continued, renamed or deleted elsewhere. 60 s equals the
  query client's `staleTime`.
- Polls fire only while the tab is **visible** (`refetchIntervalInBackground`
  is `false`; the focus manager keys off `document.visibilityState`). Offline,
  `networkMode: 'online'` pauses the queries without errors until the
  connection returns. Both were verified on an internal installation.
- Structural sharing keeps unchanged responses from re-rendering.

**A failed refresh does not replace the page.** react-query keeps `data` and
sets `error` on a failed refetch, and the client does not retry
`ServiceUnavailable`, `Unauthorized` or `Forbidden`. The fatal branch requires
having no session; otherwise a local `Alert` warns (the sessions router mounts
no `ErrorsProvider`). Three cases needed their own answer:

- **The conversation never loaded.** `hasConversation`
  (`tasksQuery.data !== undefined`) keeps the fatal branch while false, so a
  failed first read never claims "no activity". A session that never ran reads
  as `[]` and renders as such.
- **A 200 with no readable session.** `getSessionDetail` resolves `undefined`,
  which react-query rejects, so the query function coerces it to `null`. An
  empty read means "no such session" only before one was read; afterwards it
  means unreadable (for example an expired oauth2-proxy answering HTML with a
  200). A genuine 404 counts at any time.
- **A delete in flight.** An interval tick could 404 between kagent accepting
  the delete and navigation, so the page passes
  `enabled: !isDeleting && !isDeleted` and stops both reads.

### Session states, and why the backend derives them

`GET /api/agent-platform/kagent/session-states?installation=<name>` answers each
of the caller's sessions' state for the rail and the sessions list.

**This is one of two backend routes that interpret kagent rather than forward
it.** A `Session` reports its runtime state (ready, suspended, creating, failed,
deleting) but not what its newest turn is doing (working, waiting for a human,
finished). The backend therefore reads each candidate's tasks, **status only**,
and takes the newest task's state; where the runtime state already answers
(failed, creating, deleting), no task is read. It derives through the same
parser and state map the UI badges from (`agent-platform-common`), so the rail
and the page cannot disagree.

**There is no cross-session endpoint**: `ListTasks` is addressed to one session,
so there is one read per candidate, bounded and cached as below.

The response keeps apart:

- an entry with a `state`;
- an entry with `state: null` (tasks exist, none reported a state: created,
  never run);
- an id in `unreadable` (the read failed, so the state is unknown, not
  terminal);
- a `skipped` count for sessions past the cap or the pass budget. The activity
  window is a scope decision and is not counted, or "cannot tell" would be
  permanent on any account older than a week.

Terminal states come back unfiltered, so "terminal" stays distinct from "not
evaluated".

#### Bounding the fan-out

Before any conversation is read, subagent sessions are dropped
(`isListableSession`), then sessions with `updated_at` older than **7 days**;
the rest is sorted by last activity and capped at **20**. Everything dropped
counts into `skipped`. The window is generous because a session in
`input-required` can wait for days, which is what the WAITING group surfaces;
the cap is the real bound. A session without a usable `updated_at` is kept and
sorted last.

Reads run in a **sliding** pool of 4 (payloads range from 1.6 KB to 481 KB).
Each read gets 5 s (below the client's 10 s) and the pass 8 s (below the
frontend's 10 s poll). A complete pass measured about 500 ms. Each read is
caught individually; the failure count is logged at `debug` with the
installation as metadata, and the route answers **200 even when every read
fails**, to keep expected partial reads out of Sentry.

All bounds are configurable under `agentPlatform.kagent.sessionStates`, never as
query parameters: the fan-out is a cost lever the browser must not widen.

#### Caching

An in-process cache of 15 s, keyed by a **hash of the caller's token**. The TTL
exceeds the frontend's 10 s fast poll, so the fan-out runs at most four times a
minute per user and installation. The entry holds the in-flight promise, so two
tabs share one pass, and a failed pass is evicted. kagent scopes by the token's
subject, so the token is the right key; a rotation or sign-out makes the entry
unaddressable.

**Not `cacheService`**: it is pluggable, and pointed at Redis it would put
per-user chat-derived data in a shared store that outlives sign-out. Entries
hold only a session id, a state and a timestamp.

#### The State column on the sessions list

The Sessions tab and an agent's sessions card show the same summary as a
**State** column, through the `describeSessionState` map the rail and the page
use.

- **Fetched per installation that has a visible row**, under one query key
  per installation, so the lists and the shell's rail share one entry.
- **Polls on the baseline tier (60 s)**, because the list spans the fleet and
  is not read for progress.
- **Four outcomes, never a blank:** a state; `No activity yet`; `Unknown`
  (unreadable, or the installation's summary failed); `Not loaded` (past the
  window or cap, with a tooltip pointing to the session page). Merging the last
  three would let "we could not tell" read as "nothing is waiting".

### What the timeline shows

`lib/kagentTimeline.ts` builds the timeline from task history. Messages render
in full; the agent's internal work folds into work summaries; older turns page
behind "Show earlier activity".

User messages take the fill Send carries, `--bui-bg-solid` with
`--bui-fg-solid` (the shell's primary colour), and are **not** markdown,
because prompts quote logs and `#` lines verbatim. The solid tokens are
deprecated for `--bui-accent-*`, but the installed bui's primary Button still
paints them, and the shell's accent (`#009fff`) fails contrast under white
text; move the bubble when Send moves. Agent prose is GFM
markdown. JSON inside result strings is inlined. Streaming auto-follow applies
only while the page is scrolled to the end.

**A long user message is cut to 10 lines** of its own text (`10lh`, so the cut
follows the reader's font size) behind a fade, with _Show more_ centred in the
bubble under the fade, and _Show less_ in the same place at the end of the opened
text, in a row of its own so it never covers a line. It is a button with
`aria-expanded`, tied to the message by `aria-controls`, drawn in the bubble's
foreground (`CollapsibleToggle`'s `onSolid`: the bubble's `--bui-fg-solid` for
the label and focus ring, a wash of it on hover). A continuation's opener
carries the whole earlier conversation, and a pasted log or file can run to
thousands of lines; either would bury the answer under it. A message that fits, or would hide no more than
two lines (a fifth of the cut, `collapseSlack`, the rule `ShowMore` pages by),
is shown whole with no control. The cut is visual only: the whole text stays in
the page for screen readers, selection and copying, and keyboard focus or find
in page reaching past the cut opens the message where the match is. _Show less_
on a message read to its end brings it back into view rather than leaving the
reader in a later turn.

`SessionTimeline` holds which messages are open, keyed by kagent's
`messageId`, so a message stays open when kagent's copy replaces the optimistic
one after sending and when its turn leaves the turn window and comes back with
"Show earlier activity". A reload starts every message cut again. The agent's
messages, tool output and the composer are never cut. The same applies in the
create-agent assist panel, which renders its conversation with
`SessionTimeline`: its opener quotes the system prompt drafted so far, which
can be long.

The pieces (`useCollapsible`, `CollapsibleViewport`, `CollapsibleToggle`) live
in `ui-react` and are the same ones `CollapsibleMarkdown` uses for an agent's
instructions, whose toggle likewise sits centred in its own row under the cut;
the bubble sets `--bui-bg-inherit` to its own fill so the fade
matches it. Tests lay them out with `mockCollapsibleLayout` from
`@giantswarm/backstage-plugin-ui-react/testUtils`.

| Entry                | Where it comes from                                                        |
| -------------------- | -------------------------------------------------------------------------- |
| User / agent message | `role` plus text parts, rendered as markdown                               |
| Reasoning            | a text part flagged `{adk,kagent}_thought` (history before harness 1.1)    |
| Tool call            | a `function_call` data part, with its `function_response` folded in        |
| Delegation           | a `function_call` whose name contains `__NS__`, plus the child's own usage |
| Approval             | ADK's `adk_request_confirmation`, with the user's verdict                  |
| Failed turn          | a task in state `failed`/`rejected`, with the reason from `status.message` |
| Attachment           | a file part, previewed only when its own bytes say it is an allowed image  |

**Calls through Muster are unwrapped** (`unwrapProxiedCall`,
[klaus-gateway#163](https://github.com/giantswarm/klaus-gateway/issues/163)), so
a row names the real tool. In plain rows the badge is the tool's connector as
Customize names it (from the installation's `MCPServer` CRs, the family for a
family member) and the title drops the connector's prefix; technical rows keep
the exact name and a `via Muster` badge. The payload must be only
the wrapper: a non-empty `name` and no key besides `name` and `arguments`.
Anything else shows the proxy call intact rather than losing arguments.
`{ name }` without `arguments` still unwraps.

Approvals never fold into work summaries, because they record the user's own
decision. kagent repeats each user message under the **same `messageId`** every
turn, so session-wide dedupe is required; one message can carry prose and
several tool calls, text first.

#### Attachments

A file part renders beside its message and never folds into a work summary.

**The bytes are untrusted and rendered in our origin**, so the declared
`mimeType` is ignored. `readAttachmentPreview` rejects, in order: no payload, a
location instead of bytes, over 8 MB by length, invalid base64. Only then does
it decode the first 30 bytes to sniff the type and dimensions. Images over 50
megapixels are not previewed. Unpadded, URL-safe and line-wrapped base64 are
normalised. The allowlist is PNG, JPEG, GIF and WebP, and the `data:` URL uses
the **sniffed** type. Decisions are cached on the part object.

**SVG is never previewed**, as defence in depth against a future inline
renderer and SVG's denial-of-service surface; sniffing catches SVG declared as
PNG. A preview opens at natural size in an in-page dialog. Anything else is an
inert chip with name, declared type, size and the reason. There is **no
download link**, and bytes never pass through the markdown renderer.

**A file kagent only linked to is not fetched**, since the host is chosen by
the sender.

No CSP change is needed: `img-src` already has `data:`. Backstage replaces
config arrays, so a deployment overriding `img-src` must re-list `data:`.

**Only the poll renders attachments.** The first stream event of a turn with a
file part (`StreamTurn.carriesFile`) triggers one tasks re-read for that turn.
An image the person sent shows as a thumbnail (see
[Images in a message](#images-in-a-message)); one the agent sent shows at up
to 480 px high.

**Unreadable messages are counted.** `skippedMessages` counts history entries
that failed the schema (artifact and status updates excluded), and the warning
renders even when every entry failed.

### What it cannot show

kagent stores no **tokens/second**, **team**, **trigger**, **linked work
item**, **results** or **evaluation**; do not re-add them speculatively.
Delegation entries are inert, because the child session id is unreliable and
subagent sessions are filtered out.

### The cost + context popover (`SessionCostPopover`)

Costs use `gs.installations.<name>.currency`, USD otherwise.

**Token counts are cumulative billed usage.** Every model call re-sends the
context, so a 4-turn session reached 1.4M prompt tokens across 14 calls. There
is no combined total, because input and output are priced differently.

**Context used is the newest turn's largest model call against a configured
window.** No platform component reports a hosted model's context window, so
the denominator is `agentPlatform.models.contextWindows` (model-name patterns
with `*`, the most specific match wins, served through the signed-in config).
The numerator is `buildTimeline`'s `context`, read by `readUsageReport`:

- ADK writes a usage bag per model call. A call's figure is its reported
  total, else prompt plus output: the output is in the context from then on,
  and both must fit the window.
- A turn's figure is its largest call, never the sum of its calls. Each call
  re-sends the whole context, so the sum over a long turn runs to several
  times the window. The largest call is the newest root-agent call, and a small
  auxiliary or sub-agent call recorded later in the turn cannot undercut it. A
  compaction mid-turn keeps the pre-compaction size until the next turn.
- The newest turn with a figure wins as soon as its first call reports, so the
  indicator moves mid-turn on the API v2 line. Delegated agents' nested usage is
  excluded.
- The claude Harness writes one bag per turn, summed over its calls
  (`numTurns`, with `costUsd`). Only a bag with `numTurns` exactly 1 is one
  call's; any other, a missing or malformed count included, reads "Not
  reported".

No share shows beside a raw count, and a line under the row says why: the
table names no window for the model, or the call was larger than the
configured window (the setting may be too small, or the turn ran on a model the
agent has since left). The share is never capped at 100%.

Some sessions' `adk_usage_metadata` has only `promptTokenCount` and
`candidatesTokenCount`; the total is then derived. A reported total wins,
because it includes separately billed thinking tokens.

**Est. cost** multiplies the tokens by the $/token this agent (else the
installation) achieved over the last 7 days, because gateway metrics carry no
session label (see
[One cost is measured, the other is estimated](#one-cost-is-measured-the-other-is-estimated--and-the-labels-say-which)).
It reads `—` without a usable price. It takes two Mimir queries, so
`mimirEnabled: false` removes only this figure.

**Reported cost** sums the claude Harness's `costUsd` from the
`kagent.dev/a2a/usage` bag of each turn's final status message, deduplicated by
message id. ADK reports no cost, so the platform Harness shows no row. A turn
cancelled before Claude Code reports usage is missing from the sum.

### Work summaries and technical detail in place

Each run of consecutive reasoning, tool calls and delegations folds under one
summary (`segmentTurn`, `summarizeWork` in `SessionTimeline/helpers.ts`):
tools counted by name, calls by call, `load_skill` as skills, delegations as
agents; no duration, since kagent records no per-call timing. A single call
folds too (T40). Approvals, questions, messages, attachments and turn endings
never fold. A summary is open while its run is in progress and collapsed after.

**Technical detail is a fold-out in place, never a view-wide toggle** (PO,
2026-10-10). A row outside a summary reads plainly (`humanizeToolName`) and
folds out its exact call. The pending approval card always shows the exact
arguments Allow would run.

**"Show tool activity" hides the work, not detail** (PO, S9). One small
switch at the end of the header's meta line, after "Started …", on by default
and stored per person (`useShowToolActivity`, key `showToolActivity` in the
`agent-platform` bucket). Off, the timeline keeps
messages, attachments, turn endings, questions and the approval the session is
waiting on (`openApprovalId`: the newest one, unanswered, while the session
awaits input), and drops work summaries, lone reasoning and every other
permission request (`isConversationSegment`). A turn left empty shows no
marker; the "Working…" row stays. The conversation and the switch wait for the
stored choice (cached for the app load, the default after 3 s), so the work
never shows and then hides.

**The composer is docked** (T40): `position: sticky` at the end of the
conversation column, offset by `--agent-shell-mobile-bar-height` on phones, and
the column is at least the view's height (`useDockedComposerLayout`).

### Pin

The pin toggle uses `usePinnedSessions`, the store the rail and list read.

### The Notification inbox

The shell's inbox (`packages/app/src/modules/agentShell/NotificationInbox`) is
mounted once per shell, around the rail, and shows nothing on classic pages.

- **Bell.** On the rail's Profile row, right of the Profile trigger (above the
  avatar when the rail is collapsed), with a red unread count. It opens an
  overlay of about 400 px beside the rail. On a phone the bottom bar keeps its
  five items: the Profile item carries the count, and its menu starts with
  "Notifications (n)", which opens the overlay as a full-width sheet.
- **Rows.** One per session at most, derived in the browser from the shell's
  own `session-states` read through the row rule
  (`deriveSessionNotificationRow`, agent-platform-common) with the session's
  Notification level and origin: Waiting (any session), Failed and Turn
  finished (portal-started sessions, the latter at All activity only). A row
  shows the agent's Avatar and Display name, the event, the session's name,
  its age, a failure's reason class and a state chip (Waiting, Failed,
  Finished), newest first. Clicking a row opens the session and marks it
  read; its ⋯ menu has "Mute this session". "Mark all read" is one write to
  the seen marks. No text of the conversation enters a row.
- **MCP sign-in row.** One for the person's home installation while any of its
  MCP servers waits for their own sign-in or grant (`auth_required` or
  `reauth_required` in muster's per-user `auth://status`): "2 MCP servers need
  your sign-in", naming the servers by display name, above the session rows (it
  has no time to sort by), with **Sign in**, which marks it read, closes the
  overlay and then opens muster's sign-in dialog over the page (loaded on the
  first sign-in). Muster's `McpSignInProvider` reads the status under the muster
  plugin's query client, every five minutes and when the tab regains focus, and
  quietly: the read never asks for the portal sign-in, stops while the portal
  session is gone (a focus checks again), and the servers' display names are
  read once. A sign-in finished in the dialog or on a muster page removes the
  row through the same read. Only the home installation is read, and the dialog
  opens only for it: another installation's muster needs a brokered token, and
  its servers are signed in to where they are used. The row replaces muster's
  corner card and its "Not now": marking the row read is the way to put it
  aside.
- **Read.** A row is unread until its identity is the session's seen mark in the
  notification record. The MCP sign-in row's identity is the installation and
  the set of waiting servers; it is unread while a server waits that the seen
  mark does not name, so a server that starts to wait makes it unread again and
  a sign-in that leaves fewer waiting does not. A server muster then reports
  connected leaves the mark (`replaceSeenMark`, written only while the stored
  mark is still the one read, so a newer mark from another tab or device is
  kept, and tried again a minute after a failed write), so a server signed in to
  and later waiting again (an expired grant) is unread again; a server that
  merely drops out of muster's list stays in it. The session on screen counts as
  seen while the person works in that window (visible and focused); a session
  parked in a background tab, or in a window behind another application, still
  notifies. Opening a row (the MCP row: its Sign in) reports
  `AgentPlatform.notificationOpened`, "Mark all read"
  `AgentPlatform.notificationsMarkedRead`. The unread count prefixes the
  document title through `ShellDocumentTitle` (`useShellDocumentTitleCount`,
  ui-react).
- **Rows from the upstream notifications store.** What other portal features
  send the person through the standard Backstage notifications service
  (`notificationService` in a backend plugin, or a template's
  `notification:send` step) shows as a plain row: a bell icon, the title, the
  description on one line, the age; clicking it follows the link (a link out
  of the portal, protocol-relative ones included, opens in a new tab; a
  same-origin URL loses the app's base path, which the router adds). The
  upstream notifications backend stores them; the shell reads them through the
  upstream `NotificationsClient`, registered by `agentShellNotificationsApi`
  (`modules/agentShell/notificationsApiExtension.ts`) without the upstream
  notifications frontend plugin, whose page and home widget the portal does
  not ship. `useUpstreamRowSource` reads the newest 20 and the newest 50
  unread (a notification sent again for an older scope keeps its first
  `created`, by which the store sorts) when the inbox mounts, again on every
  change the backend announces on the `notifications` signals channel (a
  burst restarts one read), when the overlay opens and when the tab comes
  back into view more than 30 s after the last read. It keeps its own query
  client (`inboxQueryClient`), never persisted: the agent-platform client the
  inbox renders under writes its queries to `localStorage`. These rows keep the
  store's read state: opening one marks it read there, as does the very page
  it links to on screen (its toast followed; a page below it does not count,
  and a toast is still raised there), and "Mark all read" reads the store's
  unread ids and marks those (the store has no call for all of them). A toast
  of a row linking out of the portal opens the overlay instead, since the
  toast's plain link would leave the shell in this tab. A notification sent
  again for the same scope is a new, unread row. A read of the store that
  fails leaves the session rows as they are and shows the plain rows of the
  last read that worked.
- **Sources.** Each source (`InboxRowSource` in `NotificationInbox/types.ts`)
  says how its rows are read: `markRead`, `markAllRead` and `isOnScreen` (the
  page a row is about, which both the toasts and the on-screen marking use).
  The inbox only dispatches. "Mark all read" writes to every source with
  unread rows, waits for all of them and reports
  `AgentPlatform.notificationsMarkedRead` once if any marked something;
  opening a plain row reports `AgentPlatform.notificationOpened` with
  `kind: plain`.
- **Reading.** `useNotifiableSessions` (agent-platform) reads the same query
  keys as the rail's dots: every 10 s while the tab is visible, and on the
  60 s baseline tier while it is hidden. A state for a session the sessions
  list does not know reads that installation's list again, once per session,
  so a session started elsewhere can be named in a background tab too.
- **Interruptions.** The tab's first read is every installation's sessions and
  states; the MCP sign-in row joins when muster answers, quietly unread if that
  is later. Rows unread then are catch-up: one summary toast at most ("2
  sessions need your attention", or "notifications" once a row that is not a
  session's is among them; "Open notifications" opens the overlay) and no
  desktop notification. The tab keeps what it read in `sessionStorage`, so a
  return from a classic page or a reload does not catch up again. A row that
  appears, or changes identity, after that is news when its session was already
  read by the tab or its state changed after the first read; an old wait an
  installation reports late stays quietly unread. News raises a toast in the
  visible tab ("Open session"), none for the session on screen, and more than
  three at once are one toast (the Sessions list on its Waiting filter when they
  all wait). A toast closes once its row goes or is read, or its page is opened.
  The MCP sign-in row is news when a server starts to wait; fewer servers
  waiting only narrows it and raises nothing. Its toast's **Sign in**
  (`#mcp-sign-in`) opens it in place like its button, and so does its desktop
  notification; in the address, `#mcp-sign-in` waits for the sign-in status.
  Toasts stand above the phone's bottom bar, the session's docked composer and a
  wizard's footer (`agent-shell.css`). The upstream toast renders its links as
  plain anchors; the inbox follows a plain click on one inside the app instead
  of reloading the portal, and acts on `#notifications` and `#mcp-sign-in` in
  place.
- **Desktop notifications.** Opt-in per browser from the switch at the foot of
  the overlay (`localStorage`); the browser's permission prompt follows that
  click only. Raised for news while the window does not have focus, silent,
  with the row's identity as the `tag` so several tabs show one, and only for
  rows still unread in the record. A hidden tab can still notify about a
  session another tab shows; the plan accepts that duplicate.

Rows are `InboxRow`s (`NotificationInbox/types.ts`), the shape the bell, the
overlay, the title count and the interruptions read, so a later producer (the
MCP sign-in row, any further producer) adds a source of its own. The session
rows (`useSessionRowSource`) and the MCP sign-in row (`useMcpSignInRowSource`)
are read through the Seen record, together (`useSeenRecordSource`, so "Mark
all read" stays one write to the seen marks); the plain rows
(`useUpstreamRowSource`, `kind: 'plain'`) through the upstream store.

#### Sending a test notification locally

No portal feature sends to the store yet. To see a plain row, send one to
yourself through the notifications backend's API, which takes service
credentials only. Give the local backend a static token for it: add an entry
to `backend.auth.externalAccess` in `app-config.local.yaml`, next to any entry
already there:

```yaml
backend:
  auth:
    externalAccess:
      - type: static
        options:
          token: local-notifications-test-token-0123456789
          subject: local-notifications-test
        accessRestrictions:
          - plugin: notifications
```

Then, with the shell open in a browser, send a notification to the entity ref
of the user you are signed in as (or `"type": "broadcast"` for everyone):

```bash
curl -X POST http://localhost:7007/api/notifications/notifications \
  -H 'Authorization: Bearer local-notifications-test-token-0123456789' \
  -H 'Content-Type: application/json' \
  -d '{
    "recipients": { "type": "entity", "entityRef": "user:default/alex.example" },
    "payload": {
      "title": "Template run finished",
      "description": "Create a Go service",
      "link": "/create",
      "severity": "normal",
      "scope": "local-test"
    }
  }'
```

The row appears, with a toast, through the signal. Send it again with the same
`scope` to see it turn unread again.

### Notification level and the notification record

The actions menu (on the page and on each Sessions-list row) has a
**Notifications** submenu: Default, All activity or Muted, the current one
ticked. Default notifies when the session waits for the person or fails; All
activity also when a turn finishes; Muted never. The submenu opens beside the
menu, towards the page, and over it on a phone. The composer has no control.

The level lives in the person's **notification record**
(`lib/notificationRecord.ts`, `hooks/useSessionNotificationRecord.ts`), kept in
the `agent-platform` user-settings bucket as two keys, so the frequent writes
never touch the rare ones:

- `sessionNotificationSettings`: per `${installation}/${sessionId}`, `origin:
'portal'` when the portal's `start_session` started it (`useCreateSession`
  writes it on success; kagent's Session names no starting surface) and the
  level (`all` or `muted`; absent is Default). Muting a session without an
  entry creates one without making it portal-started; Default drops an entry
  that held only the level.
- `notificationSeenMarks`: per session, and per installation for its MCP
  sign-in row, the mark of the last row the person has seen. The mark is the
  inbox's row identity, opaque to the record. "Mark all read" is one write.

Both keys are bounded per installation, under the user-settings backend's
100 kB request limit: the newest 40 seen marks (a row exists only for the 20
sessions the session-state reader evaluates, so no mark of a row still shown is
older than 39 others), and the newest 200 entries that only record a portal
start (a level the person chose is always kept).

The storage writes one whole value per key, last write wins, so the app's
user-settings storage is our own `RoamingSettingsStorage`
(`packages/app/src/modules/app`), not upstream's `UserSettingsStorage`: a read
the backend does not answer is "unknown", never "absent", and no read is
cached. Every write reads the key first (`useStoredSetting`) and refuses to
write on a read that was not answered, so a tab that wakes up offline erases
nothing. A shown value stays until a read answers. The storage is created with
the signals API, so a write in one tab reaches the person's other tabs, and
the record is read again whenever a tab becomes visible. Two tabs writing the
same key within one read-and-write still race: the backend has no
compare-and-set.

`SessionsDataProvider` prunes the entries of sessions that are gone, one
installation at a time, when its set of sessions changes and the record names
a session the list does not. It reads the record, then the installation's
sessions afresh through `listSessionsIfComplete`, which answers only for a
complete read (no row skipped, the listing not cut at the backend's 20-page
limit, which the backend flags as `truncated`). Only entries that were in the
record before that read started, and that it does not list, are dropped: no
clock decides. The fresh read happens at most once per installation every 10
minutes.

### The compact header

Once everything above the conversation has scrolled out of view, the header
turns into one compact row at the top of the view: the session's name in a
smaller font, its state, the agent, "Show tool activity", the pin and the
actions menu. The environment and the start date are left out
(`ShellPageExpandedOnly`); scrolling back up restores the full header. At
phone width the switch is left out too: beside the state and the agent it
wraps the row to a third line over the conversation.

It is `ShellPage`'s `compactHeader` option, so another long page can opt in.
It is the same header, not a copy: the h1 (the rename button) and the actions
stay mounted once, so focus on them survives the switch and assistive tech
never meets them twice. Compact, the header is `position: sticky` against the
page, and a spacer after it takes the height it gives up, set before paint, so
the conversation does not move. `useScrolledPast` watches a sentinel that
reaches from where the content starts up past the top of the document (the
document scrolls, not a container), so even an instant jump to the top is
seen. The header stays expanded while focus is on a part the compact row
leaves out. A `scroll-margin-top` on everything but the header keeps
whatever is scrolled into view below the compact row, and its fade is off
under `prefers-reduced-motion`. It is a margin on the content rather than a
`scroll-padding-top` on the document: padding counts the stuck header's own
top as hidden, so pressing the switch, whose input react-aria focuses on
every press, scrolled the page to the top for a frame and back, a flicker.

The switch stays usable mid-session: toggling it adds or removes work
summaries above and below the place being read, so `useReadingAnchor` records
the first entry in view that survives the toggle (a message or a turn marker,
never a work summary) and its offset, turns the browser's scroll anchoring off
for that change, and scrolls back by however far the entry moved, before
paint. The header, its spacer and the sentinel are `overflow-anchor: none`:
anchored on the sticky header, the browser would scroll the page when it turns
back into the expanded header, which turns it compact again, a flicker. The
compact header also expands only once the content's start is 24px back in
view (`useScrolledPast`'s `hysteresis`), so a reflow that nudges it a few
pixels cannot flip it.

### Timestamps are absolute here

The detail page shows absolute times (`28 Jul 2026, 10:07 UTC`), because
relative times printed "1 day ago" on every turn of a three-minute session.

### Renaming a session

`useRenameSession` and `SessionRenameDialog`, opened from the actions menu or
the page title (a real `<button>`, with a MUI tooltip because bui's wires only
its own focusable components). The dialog's open state lives on the page
because both triggers share it. kagent truncates derived titles to 20
characters, which is why renaming matters.

**The write is kagent's own rename.** `PUT /kagent/sessions/:sessionId` calls
`SessionService/UpdateSessionName` (`KagentClient.updateSessionName`), scoped to
the caller. The controller allows at most 200 characters, no control characters
and no surrounding whitespace; a rejected name answers 400, and a missing or
foreign session 404. The route and the dialog enforce the same limit
(`SESSION_NAME_MAX_LENGTH`) and trim the name.

Unlike the delete, the invalidations **refetch** and are awaited, so the dialog
closes onto the new name.

### Deleting a session

`useDeleteSession` and `SessionDeleteDialog` (`ConfirmDialog` from `ui-react`).
`DELETE /kagent/sessions/:sessionId` calls `SessionService/DeleteSession` with
the same installation resolution, token and status mapping as the reads. The
controller moves the session to `DELETING`, suspends the runtime and ends it
`DELETED` (reason `user_requested`). The delete is soft: record, tasks and
events stay in the controller's database, and every read answers 404 from then
on. A missing session answers 404.

**There is no permission gate.** A session is not a Kubernetes object, and the
controller derives the acting user from the token, so the action is always
offered on a loaded session and the route **requires** the token. Where
`isUserScoped === false` (see "User scoping"), the dialog warns that the
session may be someone else's.

**Cache handling.** The sessions list is invalidated normally. This session's
own reads are invalidated with **`refetchType: 'none'`** and disabled, because
a refetch would race the navigation and flash "Session not found". Success
returns to the list with a toast; failure keeps the dialog open with the
message.

### Continuing a session

`SessionComposer` and `useSendMessage`.

A message is A2A v1 `SendMessage` or `SendStreamingMessage` addressed to the
Agent (`tenant`) with the session as `message.contextId` (or the task a reply
names); a message with neither would start a new session, and a mismatched
context is refused. The route is `POST /kagent/sessions/:sessionId/messages`;
`KagentClient` builds the A2A request, so the frontend never sees A2A. **One
active task per session**: a second message during a turn is refused (409), so
Send is withheld while the agent works.

**The agent's namespace and name come from the `Agent` resource, never from
decoding `agent_id`**, because kagent's encoding rewrites `-` to `_`
irreversibly. `SessionRow` carries `agentNamespace` and `agentTechnicalName`; a
session whose agent matches no CR has no addressable agent.

**A unary send answers only when the turn ends**, and the turn survives a cut
connection. `agentPlatform.kagent.turnTimeoutMs` is therefore **30 s**, short
enough to answer before a 60 s proxy in front of Backstage fires a 502/504.

On a timeout or transport failure the backend **checks instead of guessing**:
it reads the tasks (`A2AService/ListTasks`, `hasMessageLanded`) for the
`messageId` it generated. Present answers **202** (dispatched, running); absent
or unreadable keeps the original failure. Only transport failures
(`mapConnectError`) are verified; kagent's own answers (`NotFound`, 401, 403, a
rejection) are decisions. 202 also keeps long turns out of Sentry.

**A failed turn is still a 200**, with the reason in `status.message` (for
example an unreachable MCP server, or a provider's `404 … model_not_found`). The
timeline closes such a turn with a failed-turn entry carrying the reason, and
the stream reducer does the same for a failing terminal `status-update`.

**The turn streams as a preview, never as a second source of truth**
(`POST /kagent/sessions/:sessionId/messages/stream`; see "Streaming the turn").
The unary routes remain for other callers, and their verify-not-report contract
is what a cut stream degrades to. The page sends messages over
`…/messages/stream` and answers over `…/answer/stream`.

**A 409 is explained**: the client raises `ConflictError`, and the page says the
session is still working on the previous turn and offers to cancel the poll's
newest task. The refused text returns to the box.

### A session whose runtime is lost

A session whose turn ends by asking the person something is **paused**: the
gateway has Substrate checkpoint the actor on the worker's _node_, which holds
the only copy of the agent's working state until the person answers. The
transcript is in kagent's database and survives. When the node goes (spot
interruption, consolidation, node roll), the resume fails, and the gateway
records the turn **failed** with the runtime's text (`actor "ai-…" request timed
out`, or `failed to connect to Session runtime`). Every retry does the same, as
on gazelle on 2026-09-15 (giantswarm/giantswarm#37795).

`readRuntimeLoss` (`agent-platform-common`) recognises two cases:

- **Reported.** kagent marks the `Session` with a `Failure` whose reason is
  `RUNTIME_LOST` and ends such a turn with an A2A error starting
  `runtime lost: <cause>`. Feature-detected; older kagent marks nothing.
- **Suspected.** The newest turn (or a run of turns) failed with one of the
  runtime's texts, or the send's error carries one. The text match is narrow,
  so provider or tool failures keep rendering as themselves. `attempts` counts
  consecutive failures.

`RuntimeLostNotice` explains the loss in the portal's words, with the runtime's
text as evidence only; the failed-turn entry does the same.

**The way out is a new session with the same agent**: "Continue in a new
session" inside the notice (`ContinueInNewSessionButton`, under the notice's
text rather than in bui `Alert`'s `customActions`, which would squeeze the text
at phone width), the same button an answer kagent did not take offers. While
the loss is only suspected, since a cold worker can time out once, the box and
Send stay for the retry and the button is secondary. Once kagent reports the
loss the session takes no more messages: the page shows no box (only the cost
chip under the notice), and the button is the one way on. The new session
carries this one on, as after an answer kagent did not take (see "Carrying the
session on in a new one"): its first message holds the conversation and the
open question if the session waits on one, with any answer the lost runtime
never took. Nothing the box holds goes along. A failed send the transcript does
not hold (kagent refused it before it recorded the turn) is carried as the
newest message, once (`withFailedSend`). The images of the message that never
got its answer (the newest message, with no reply or request after it) go
along, since the conversation names them. It is titled `Continued: <title>`,
and the notice says what the first message will hold and shows the answer,
except while the question card is up and holds it. It follows create, navigate,
send (see "Starting a session"). `SessionDetailRoute` keys the page on the
session, so the new one mounts fresh.

**Only a reported loss marks the session** (`Runtime lost` in the header, the
Sessions table and the rail card); the suspected reading belongs to the notice.

**Deleting** a lost session fails as `Unavailable: Failed to delete Session`,
because kagent's delete suspends a runtime on a node that no longer exists.
`describeSessionDeleteFailure` explains this; a kagent update that skips the
suspend for lost runtimes fixes it.

`e2e/agentlab/session-runtime-lost.spec.ts` proves this with kagent's answers
for one session stubbed at the browser.

### Streaming the turn

`SendStreamingMessage` answers one `StreamResponse` per event: a `task` snapshot
when the turn is accepted, `statusUpdate`s, `artifactUpdate`s (the Go ADK
streams text this way, stamped `{adk,kagent}_partial`) and occasional bare
`message`s. The backend relays each as an SSE `data:` frame with its proto3
JSON and requests the HITL extension (`a2a-extensions` metadata) on every turn.

**The backend relays; the frontend owns the schema.** The streaming route shares
the messages route's reader, opens the stream through
`KagentClient.streamMessage` and interprets nothing; `agent-platform-common`
translates v1 frames and derives the `final` flag from the state. Two transport
details are load-bearing:

- Backstage's global `compression()` buffers `res.write()` until `res.end()`, so
  the relay flush-wraps `res.write`, as `ai-chat-backend`'s router does.
- The first event is awaited under the ordinary request timeout, since the
  gateway sends the `task` snapshot before the agent works. After it, only a
  generous duration cap and a client hang-up abort the read; neither stops the
  turn. A stream that dies mid-turn ends with one `{error}` frame.

### Stopping a turn

Cutting the stream does not stop a turn, so **Stop** takes Send's slot while the
agent works and the running task is known (from the stream's `task` snapshot or
the poll). It calls `POST /kagent/sessions/:sessionId/tasks/:taskId/cancel` →
`A2AService/CancelTask`: the controller cancels at the harness or quiesces the
actor and records the task cancelled, so the turn stays stopped after the tab
closes. Cancelling a finished turn is not an error. `useCancelTask` invalidates
the conversation. Stop is withheld while a confirmation is open. A failure shows
as **Could not stop the turn**; a 401 (for example after a Backstage pod roll) adds that a
reload signs the tab back in.

**A stalled turn** (no progress for the 5-minute bound, see "Refreshing")
replaces "Working…" with the time of the last progress and a cancel action;
Send stays withheld and Stop stays. Cancelling restores the unanswered message
as a draft (the composer's `restore` path). The page never shows an idle
composer while the newest task is active. A stream silent for the whole bound
counts as stalled too.

**The frontend folds events into a live overlay** (`lib/kagentStreamTurn.ts`)
of `TimelineItem`s plus a live text buffer, mirroring kagent's own UI. Both
executors' dialects are handled: the Python flow streams text on non-final
status-updates with a complete terminal message; the Go flow streams
`partial: true` artifact chunks, a `partial: false` complete message and a
`lastChunk` sentinel. A reply repeated on the terminal status-update is deduped
by adjacent identical text, because only one copy carries a `messageId`.

**The poll stays the source of truth.** A streamed item whose `messageId` a poll
delivered is dropped, and the overlay is discarded once the send's awaited
invalidation shows the canonical history. This also reconciles hidden tabs,
where polling pauses but the stream continues.

**A lost stream is not a lost message**, mirroring the backend's rule:

- Any event means the turn was dispatched; a later failure (the 60 s gateway
  door, a network drop, an in-band A2A error) only ends the preview.
- A **transport** failure before any event (`StreamTransportError`: dead
  connection, 5xx, not a stream) triggers one history read for the sent
  `messageId`. Present resolves as dispatched; absent or unreadable keeps the
  failure.
- A **decision** (4xx, or a gRPC status before the first event) is reported.

**Confirmations do not stream.** The answer panel works from the polled task's
`status.message`, which is what can resume the task. Answers stream through
`POST …/answer/stream` (`useAnswerConfirmation`).

**Gateway timeouts.** agent-platform-standalone's backstage and kagent
controller routes set `timeouts.request: "0s"`. An internal installation's
`agent-platform-connectivity-ui` route has a 60 s Envoy `BackendTrafficPolicy`,
so a long turn's stream ends at 60 s and the poll takes over. Streaming is
strictly additive.

**The sent message appears at once and vanishes by recognition.** The composer
generates the `messageId`, so the optimistic copy is dropped when a poll returns
it (`TimelineItem.messageId`; `id` is positional). "Turns" lags by one until
kagent confirms.

**"Working…"** takes two signals, because neither spans a turn: the in-flight
send covers the first poll's delay (up to 10 s), and `isAgentWorking`
(`plugins/agent-platform-common/src/kagent/kagentSessionState.ts`) covers the
rest. `isAgentWorking` requires:

1. the newest task in an active state;
2. not one of `AWAITING_INPUT_STATES`, compared on the normalised `state.key`,
   never `state.raw`;
3. a state change within `ACTIVE_MAX_AGE_MS`.

The badge still reads "Working" in case 3, because it reports kagent's state.
The age is judged against `dataUpdatedAt`, not `Date.now()`, so it expires
without a re-render and never claims progress without data.
`ACTIVE_MAX_AGE_MS` and `readNewestTaskState` live in `kagentSessionState` so
the indicator and the poll tier agree, except that a state without any usable
timestamp counts as working but polls on the baseline.

**The composer is withheld with a reason** on a read-only shared session
(`detail.readOnly`), when the agent cannot be found, and when a pending request
cannot be read. During `input-required` or `auth-required` it stays disabled
with the answer card attached, because a plain message would leave the task
pending. During a turn only sending is withheld: the box stays editable, and a
failed send's text goes back ahead of any new draft.

**Focus.** The composer takes focus when the page was reached by starting the
session (`autoFocus`). A question takes focus when it appears; an approval
never does, so a stray Enter cannot approve a tool call. Focus returns to the
composer afterwards, which is why the panel is passed as the composer's
`attachment` instead of a separate branch.

**Keys.** Enter sends, Shift+Enter inserts a newline, Cmd/Ctrl+Enter also sends,
and an Enter committing an IME composition is ignored (`lib/sendKey.ts`, shared
by both composers and the answer panel). The field clears on submit; on failure
the text returns, keyed by attempt id, without overwriting an edit.

**Limits.** Messages are capped at 32,000 UTF-16 code units (ours; kagent
validates nothing), in the route and the box. The backend's JSON body limit is
256 kB, so 32,000 CJK code units (about 96 kB) never hit a 413; the routes
under a session's `messages` take 5 MB, for images.

#### Images in a message

Both composers take images, pasted or dropped on the box. They show as
removable thumbnails above the text and go with the next message as A2A `raw`
parts (`mediaType`, `filename`) after its text part. The session page's
composer, the home and Sessions composer (`StartNewSession`) and the New
session dialog take them; the meta-agent hand-offs and `CreateAgentAssist`
stay text only. A new session's images travel to the session page with the
prompt, held in memory under a key in the router state
(`stashHandoffImages`, emptied once read), never in the router state itself.
There is no button to attach images with.

- **Paste** attaches only a clipboard without both plain text and HTML: a
  spreadsheet or word processor copies a picture of the selection beside its
  text, and there the text is pasted as before. A pasted image is called
  "Pasted image" (browsers call each one `image.png`); a name already
  attached gets " (2)", " (3)", … so every remove control is announced apart.
- **Drop** reacts to drags that carry files only, so dragged text still lands
  in the box. While the composer is on the page — also while it is disabled
  or a session is being created — a file dropped anywhere else is refused
  instead of opened by the browser in place of the page. Desktop only; on a
  phone, paste remains.
- **Types** are read from the bytes (`sniffImageType`), never the name: PNG,
  JPEG, GIF, WebP — what the transcript previews. Anything else is refused
  with a message naming them.
- **Every image is drawn and encoded again** (`prepareImage`), which strips
  its metadata (a photo's GPS position, device and times would otherwise reach
  the model provider and the transcript, which share links show; the recorded
  orientation is applied first) and bounds it to 2,000 px on its longer side:
  models scale larger images down themselves, and Anthropic refuses images
  over 2,000 px in a request with more than 20 and over 8,000 px in any.
  PNG, JPEG and WebP keep their format, falling back to PNG where the browser
  cannot encode one; a GIF is sent as a PNG of its first frame, all the models
  read of one. A browser without `createImageBitmap` and canvas encoding cannot
  attach images and says so.
- **Caps** (`kagentMessageLimits.ts`): 2 MiB per image, 4 images and 3 MiB per
  message, 50 images and 16 MiB per session (the person's images; a file the
  agent produced does not count). The message cap is kagent's narrowest hop:
  the controller relays to the runtime over gRPC with the 4 MiB default. The
  session caps exist because every turn sends the model the whole
  conversation, base64-encoded: Anthropic refuses a request over 32 MB or with
  more than 100 images, and agentgateway buffers an LLM request up to 32 MiB.
  The composer checks them as images are attached and again before sending
  (a failed message's images put back beside newer ones can be too many
  together, which blocks Send with the reason). The backend checks them all
  again: each image's bytes against its type and its header's dimensions, and,
  for a message with images, the session's own (one read of its tasks).
- **Agents that cannot take images** (`imagesUnsupportedReason`): kagent's
  Claude Code and Codex runtimes accept one text part per message and fail
  the turn otherwise, and its Go ADK runtime hands images only to OpenAI,
  Azure OpenAI, Foundry, Anthropic (also on Vertex AI) and Gemini models; its
  Ollama, Bedrock, Mistral and SAP AI Core adapters drop them silently. The
  composer says so on a paste or drop, from the agent's Harness runtime
  (named or inline) and ModelConfig provider. While either is not read yet,
  it says it cannot tell yet rather than guess. A custom (`byo`) runtime is
  given images. Whether a given model takes images is recorded nowhere in
  kagent: an OpenAI-compatible endpoint serving a text-only model refuses the
  turn, and the failure path hands the text and the images back to the box.
- **Sent again.** A stalled turn's message comes back with its images when
  the turn is stopped, and a lost runtime's new session takes the unanswered
  message's images with the conversation.
- **The transcript** shows a sent image after the message, as a thumbnail
  (at most 240 × 160 px) that opens at full size; the optimistic copy of a
  message in flight shows its images the same way, from the composer's
  preview. Each poll re-reads the images with the conversation, which the
  session caps also bound. A conversation too large for one `ListTasks`
  answer (the controller's 16 MiB) is read in halved pages; the size that
  fitted is kept for the session's next reads, and a read makes at most 100
  calls. The page token is the last task's id, so it holds across sizes.

The chart's ingress raises `nginx.ingress.kubernetes.io/proxy-body-size` to
`6m`, because ingress-nginx refuses a body over 1 MB by default. A deployment
that replaces the chart's ingress annotations, or fronts the portal with
another proxy, must allow the same.

### Answering the agent's question

A question is a task in `input-required`, and only an answer moves the session
on. The detail page attaches an **answer card** to the docked composer (T40)
and disables the box, as kagent's own UI does. The card prints the question,
pages several questions and sends all answers together. The timeline keeps the
question and the reply or decision.

#### A reply that does not name the task strands the agent

The controller decides what a message continues from the task it names
(`SendMessageRequest.message.taskId`, set by `KagentClient` for an answer).
Without a task id, kagent opens a new task: the agent reads the words, but the
suspended call never gets its function response, the old task stays
`input-required`, and the model history keeps a `tool_use` without a
`tool_result`.

**klaus-gateway had this bug when observed** (on the earlier JSON-RPC wire): it
sent `params.taskId` (`pkg/a2a/kagent_client.go`), which no A2A version has. On
an internal installation, three questions answered from Slack left seven tasks,
three stranded; the same session answered here held one task. The fix is to
move the id onto the message.

Naming the task requires a matching `contextId` and a non-terminal task, so an
ordinary reply sends **no** `taskId`.

#### The wire format

Human-in-the-loop is the negotiated A2A extension
`https://kagent.dev/extensions/hitl/v1`. The backend requests it on every turn
(gRPC metadata `a2a-extensions`). A suspended task's `status.message` then
carries in its `metadata`, under the extension URI (also listed in
`message.extensions`), either a `tool_approval_request` (`tools[]` with `id`,
the proposed `call_id`, `name`, `args`) or an `ask_user_request` (`id`,
`questions[]` with `question`, `choices`, `multiple`). Without the negotiation
there is nothing to answer.

The reply names the task (`taskId`) and carries the typed response in the same
place. The page sends it over `SendStreamingMessage`
(`POST /kagent/sessions/:sessionId/answer/stream`, `useAnswerConfirmation` →
`useStreamedTurn`); the unary `…/answer` remains. Prefer the stream: a unary
answer is held for the 30 s turn timeout and returns `202 pending`, and on the
kagent API v2 line that deadline cancelled the resumed turn.

```json
{
  "message": {
    "messageId": "<uuid>",
    "role": "ROLE_USER",
    "taskId": "<the input-required task's id>",
    "parts": [{ "text": "Rideable proof-of-concept" }],
    "extensions": ["https://kagent.dev/extensions/hitl/v1"],
    "metadata": {
      "https://kagent.dev/extensions/hitl/v1": {
        "type": "ask_user_response",
        "id": "<the request's id>",
        "answers": [{ "answer": ["Rideable proof-of-concept"] }]
      }
    }
  }
}
```

The controller validates a reply **strictly** (every tool decided once, every
question answered, the `id` echoed), so the backend builds it from **the
request the controller recorded** (`GetTask` first), never from the browser's
claims. The browser sends only approve or reject and, for questions, the
answers in order.

- **A tool approval decides every requested tool at once**: the one verdict
  applies to every `tools[].id`. A rejection carries the reason on each; an
  approval carries none, since the controller refuses one.
- **`answers` is positional**, and each `answer` is an **array even for one
  choice**. Fewer answers than questions is a 400. A question cannot be
  rejected, because the controller refuses an empty answer.
- **An answer carries the choice's text, not its index.**
- **The text part is transcript-only**: the user's words, or a plain rendering
  of the decision.

`agent-platform-common` translates the typed request into the ADK-style
confirmation call the panel and timeline read (`adk_request_confirmation`,
`ask_user`), and the typed reply into the `decision_type` part, so nothing above
the parsing layer knows the extension.

#### What the question looks like, and what the panel does with it

`readPendingConfirmation` (`lib/kagentHitl.ts`) reads the suspended task's
`status.message`, never `history`, because a request stays in history after it
is answered. It reads **the task whose state is the session's state**
(`findNewestStatefulTaskIndex`), not the newest `input-required` task: sessions
answered through klaus-gateway hold stranded `input-required` tasks behind a
completed newest one.

`originalFunctionCall.name` discriminates:

- **`ask_user`** — questions, each a choice list (checkboxes when `multiple`)
  or free text.
- **anything else** — a tool permission, answered with Allow or Decline.

Enter sends from any answer control (Shift+Enter for a newline), handled per
control rather than on the `<form>`, where react-aria would also turn Enter on
Decline into an approval. In the decline reason box Enter confirms the decline.

**Every question gets a free-text box.** Choice lists are not exhaustive, and
typed words reach the agent inside the `answer` array (only the message's text
part is discarded). A question can be answered with a choice, text or both,
sent choices first.

When the session waits but the request cannot be read (unrecognised payload, or
no task id), the panel is withheld and the page says so.

#### An answer kagent does not take

The streaming answer route answers `202 pending` when the resumed turn sends no
event within the request timeout (`timeoutMs`, 10 s): an approved tool can run
that long before the agent speaks. kagent answers the same way when it cannot
resume the session at all, and the answer then never reaches the task. Observed
on a session left waiting for three days: the task stayed `input-required`
with no answer in its history, and the session carried no failure.

So an answer whose stream says nothing (a 202, or a stream that ends without an
event) is checked against the history (`useAnswerConfirmation`,
`ANSWER_TAKEN_WAIT_MS` 15 s, read every 3 s through the conversation's own
query). It counts as taken once it is in a task's history, or once the answered
task has left `input-required` or asks in a different status message (a
follow-up question keeps the task id; `PendingConfirmation.askedIn` names the
message that asked). A read that does not show the task, or a wait whose reads
all failed, cannot tell and leaves the turn to the poll; a read that fails
after one that could tell does not overturn it. A task still waiting on the
same request without the answer at the end of the wait fails the answer with
`AnswerNotTakenError`.

While that request stands, the page treats it as the end of the session, as it
does a reported runtime loss: "Could not resume this session" replaces the
answer card, the page shows no box, and the notice offers "Continue in a new
session". The notice shows a question's answer and says what the new session
will start with; the answer goes when a late resume moves the task on, and the
notice with it. Where no new session can be offered, the notice says where else
to go. No retry is offered, because a second answer goes the same way. Any
other answer failure (a refusal, a 5xx, a lost connection) keeps the card with
"Answer not sent" and its retry. kagent marks nothing, so the session keeps its
"Waiting for you" state in the list and the rail, and a reload shows the card
again.

#### Carrying the session on in a new one

A new session has an empty model history, so the new session's first message,
after an answer kagent did not take or a lost runtime, carries the
conversation (`buildContinuationPrompt`, `lib/continuationPrompt.ts`), built
from the page's timeline, which holds the whole task history:

- a first line naming the session it continues,
  `[Continues session <installation>/<session id>]` (see below);
- a short framing for the model: this continues a session that could not be
  resumed, the earlier conversation follows, oldest first, then the open
  question and the answer;
- every message as `User:` or `Assistant:`, each cut at 4,000 characters;
  questions the agent asked once (its prose echo of an `ask_user` is dropped),
  and tool approvals with their verdict;
- tool and agent calls **by name only**, consecutive ones on one line
  (`[Assistant used tools: read_file, search (2×)]`): results can be any size,
  and the new session can call a tool again rather than trust a stale result;
- attachments by name and failed or stopped turns, one line each; not the
  model's reasoning;
- the open question with its choices, then the answer when there is one. An
  approval's words are never carried, and nothing the person types: the
  session shows no box once it cannot go on, so the person writes their next
  message in the new session.

The message stays within `MESSAGE_TEXT_MAX_LENGTH` (32,000 characters), the
send route's bound. The question (each cut at 4,000 characters, as are its
choices) and the answer come first; the conversation gives way from its oldest
end and says how many messages it left out, and the notice says how many of
them the new session gets, or that none fit; the page builds the message once,
so the start sends what the notice counted. The framing says what the message
ends with: the question and the answer, the question alone, or the
conversation. The open question is found in the timeline by what it asks,
so an answered question whose verdict the timeline could not read stays in the
history. A session that was itself a continuation is carried on with its first
message expanded into entries (its earlier conversation, question and answer),
not clipped as one long message; an older continuation's `## My reply` (the
box's text, which earlier versions carried) comes back as the person's message.
The session is titled
`Continued: <this session's title>`, with one prefix however often it is
carried on.

**The marker line.** The first line is one bracketed line, so it reads plainly
to the model and wherever the raw text shows (Slack, kagent's UI). The session
page recognises it only at the very start of the session's first user message
(`readContinuationMarker`, `splitContinuation`), takes it out of the message
and shows a "Continued session" banner above the conversation instead: "This
session is a follow-up to an earlier session on <installation>", linked through
`sessionDetailRouteRef` (the installation may differ from the session's own).
The one-visit "Prepared by the portal" caption is not used for it. The rest of
the message, the carried conversation, is cut like any long user message. Links
inside any bui `Alert` in the shell are underlined and take the shell's link
colour (`agent-shell.css`), so they read as links on every alert background. An
installation or session id outside `[a-z0-9-]` and `[A-Za-z0-9._-]` is not
written, so a marker always reads back as written.

### Starting a session

A session starts from a **composer** with a prompt and an agent; there is no
separate new-session form. Both composers use `ComposerFrame` from `ui-react`.
Every entry point creates through `useCreateSession`: the home screen at `/`
(`AgentPlatformHome`), the command palette (`NewSessionDialog`), the sessions
list's first-run card (`StartNewSession`), the agent page's dialog, a lost
runtime's or a failed resume's "Continue in a new session", the meta-agent
hand-offs ("<verb> with <agent>", `useMetaAgentHandoff`) and
`CreateAgentAssist`. The composer grows with its content and never shrinks back.
Enter starts.

#### Create, navigate, then send — in that order

1. **agent-manager's `start_session`**, through muster as the person
   (`AgentManagerClient.startSession`, `musterApi.callTool(…, installation)`),
   with the agent's namespace and technical name, the title as `sessionName`
   and a **`requestId`**, and **no message**: agent-manager creates the
   Session (`CreateSession` on the Agent, which names its Harness) and sends
   nothing.
2. Navigate to the session's page with the prompt in the router state.
3. The **detail page** sends the prompt as the first message.

**One way to start a session.** Every surface (the portal, Slack, any MCP
client) starts sessions through `start_session`, the one place where an agent
and, optionally, a workspace grant meet, so no surface can skip a workspace's
access check. The portal sends no grant yet: an absent grant is the plain
session. The backend has no create route; reads, sends, rename and delete stay
on the kagent proxy. Refusals are agent-manager's, classified as its other
tools' are (`AgentManagerError` with its code); a portal without the muster
plugin cannot start a session.

**Why without a message.** `start_session` can send the first message
itself, but then the first turn is neither streamed to the person nor sent
with the human-in-the-loop extension, so an approval-gated tool call in it
could not pause the way the page shows it. Creating only and sending from the
detail page keeps the first turn exactly like every reply.

**The create is idempotent.** `useCreateSession` mints one `requestId` per
submission and reuses it when the same prompt to the same agent is retried; the
controller answers the existing instance for a repeated `(creator, request_id)`
and 409 for a repeat with other parameters.

The composer does not send because a send lasts the whole turn (see "Continuing
a session"): awaiting it would hold the person on the list for up to
`turnTimeoutMs`, and not awaiting it would lose the optimistic echo, which lives
in the unmounted component. Handing the prompt over reuses the reply machinery:
the optimistic message, "Working…" and failure handling. The agent's namespace
and name travel with the prompt, so the send goes out on the first render.

The router state is consumed once and cleared with a replacing navigation
(`useNewSessionHandoff`), because router state survives reload and Back and
would otherwise start a second paid turn.

A meta-agent hand-off marks its prompt `prepared`, and the detail page captions
that first message "Prepared by the portal". kagent stores no such flag, so a
later visit shows the message plain.

A tab closed between create and send leaves an empty but working session in
the list.

#### Titles are ours to derive

The controller does **not** auto-title. `deriveSessionTitle` collapses
whitespace, cuts to 60 characters at a word boundary where that keeps most of
it, and strips trailing punctuation before the ellipsis. It is mechanical on
purpose (no model call), and the title is renameable (`UpdateSessionName`, at
most 200 characters).

#### The agent implies the installation

An agent's identity is installation/namespace/name, so picking one picks the
installation. The start sends the namespace and the **technical** name (the
`Agent` resource name) as `start_session`'s `namespace` and `name`, never the
display name.

The picker offers **ready agents only**, grouped by installation when there is
more than one, with search past eight agents. Non-ready agents are omitted,
except on the home screen (`AgentPlatformHome`), which shows them disabled with
the reason, groups by namespace and is always searchable. It puts a "Recent"
group first and a "Favorites" group second: every agent starred on Customize →
Agents, uncapped, in display order. An agent that is both is listed in both, so
the favorites do not change with what was used last. Both groups keep what they
held when the picker opened, so a late read of the favorites never moves rows
under the pointer, and both give way to a flat list of matches while a search
is typed. `isStartableAgent` is shared, so the picker and the decision to offer
one agree.

A single offered agent is preselected and the control disabled, but still named
to confirm the target. `InstallationSelect` does the same for one installation.
A lone non-ready agent is never preselected.

The start screen tells apart three reasons for having no composer: nothing
could be read, nothing is deployed, or nothing deployed is ready.

**Only agents appear here.** `AgentsDataProvider` lists `Agent`s only; on kagent
API v2 there is no other workload kind. An Agent rejected by its Harness is
`failed` and never offered.

#### The default agent is the last one used

`useLastUsedAgent` stores the agent's id per browser in `localStorage`
(`use-local-storage-state`) and re-resolves it against the live fleet; a deleted
or unready agent resolves to nothing. There is no preselection on first use:
the first agent alphabetically would be arbitrary and could act on a cluster
after a hasty Enter.

#### What is not carried over

The prototype's visibility/team selector has no kagent equivalent: a session
has one owner, and kagent's shares (read-only and read-write, behind the
backend's `/shares` routes) are not offered in the composer. The home picker
offers "Recent" first and favorites second.

## The agents list

The list is Customize → Agents (`CustomizeAgentsPanel`, `/customize/agents`;
the old `/agent-platform/agents` and the short `/agents`, with anything below
them, redirect to the same place under it), showing 25 rows at a time; its
search matches name, technical name, description and model.

The list reads kagent **API v2** objects only (`api.kagent.dev/v1alpha3`). This
is a hard cut (bumblebee-plans#51 D12): an installation still on the
`kagent.dev` group shows no API v2 agents and is never read through a second
code path.

### What a row is

An **`Agent`** is a template (model, system prompt, tool bindings,
commit-pinned skills), inline under `spec.template` or named by
`spec.templateRef`, paired with the **Harness** named by `spec.harnessRef`; the
controller compiles it into a revision. The Generic chart renders one per
release, with the display name in `ui.giantswarm.io/display-name` and an
optional `ui.giantswarm.io/icon-url`. Unless the toolset is `preset:none`, the
chart also renders a **`RemoteMCPServer` named after the agent**, pointing at
the muster gateway with the toolset in the static `X-Muster-Toolset` header: the
toolset's _carrier_. A row is an Agent **joined with its carrier**:
`AgentsDataProvider` lists both kinds per installation (`useResources(Agent)`,
`useResources(RemoteMCPServer)`, cluster-wide, discovery off) and `toAgentRow`
reads the header (`lib/toolset.ts`, `toolsetOfAgent`). Both lists are sticky per
installation, so a transient miss neither drops rows nor flips a toolset.

In `kubernetes-react`, the `Agent` class (`agents`) reads the inline template,
and `getTemplateRef` names an `AgentTemplate` used by reference.
`RemoteMCPServer` reads `spec.headersFrom` as a literal value only (a header
from a Secret is never guessed). `ModelConfig` is `v1alpha3` with `Accepted` and
`ResolvedRefs`. There is no `spec.type`: a bring-your-own runtime is a Harness
on API v2.

### Readiness

Readiness lives on `Agent.status`: conditions `Accepted`, `ResolvedRefs`,
`Compatible` and `Ready`, plus `desiredRevision`, `latestSuccessfulRevision` and
`warnings` (compile downgrades). `Harness.status` is never written, and an
`AgentTemplate` has no status. `deriveAgentReadiness` (`Agent.ts`) matches
agent-manager's `get_agent_status`:

| Readiness  | When                                                           |
| ---------- | -------------------------------------------------------------- |
| `ready`    | `Ready=True`                                                   |
| `failed`   | `Accepted=False`, `ResolvedRefs=False` or `Compatible=False`   |
| `notReady` | `Accepted=True` and `Ready != True` (the Harness is compiling) |
| `pending`  | no conditions yet, or a status that lags the stored generation |

Polling (`getAgentsRefetchInterval`) is 5 s for an installation with a
converging agent and 60 s otherwise, with a three-minute bound so a durably
broken agent does not pin the fast tier.

### Absence

Only installations whose inventory has `api.kagent.dev`
(`inventory.installationsWith('kagent')`) are asked, so one without kagent, or
on `kagent.dev`, shows **no API v2 agents**, not an error. A 404 for `agents`
reads as empty. Chat reachability is the sessions side's
`GET /kagent/installations` probe.

## The agent detail page

`/customize/agents/<installation>/<namespace>/<name>`; all three segments
are the agent's identity.

Each tab is its own URL, in a `ShellPage`:

| Tab      | Path                 | What it holds                                                                 |
| -------- | -------------------- | ----------------------------------------------------------------------------- |
| Overview | the agent URL itself | what it's for, instructions, skills, connectors; model and environment beside |
| Sessions | `…/<name>/sessions`  | your sessions with this agent                                                 |
| Tools    | `…/<name>/tools`     | the declared toolset and the exact tools it resolves to for you               |
| Usage    | `…/<name>/usage`     | its spend, tokens and model calls; your sessions with it                      |

The Tools tab is there only for an agent with tools (`toolsetHasTools` in
`lib/toolset.ts`): it binds the muster gateway (`gatewayBindings`: its carrier
`RemoteMCPServer` or the shared gateway server), which is how an agent reaches
connectors and Platform tools, and its carrier does not declare `preset:none`.
The wizard renders a chat-only agent without the binding. Servers bound
directly are listed in the Overview's Connectors section. For an agent without
tools, `…/tools` lands on the Overview. While the agent is read, the strip
draws the Tools tab only on `…/tools`, so a deep link keeps its tab selected;
elsewhere the tab joins once the agent is read.

Skills fold into the Overview (`…/skills` lands on it), and the GitOps,
configuration and status cards sit in a Technical details fold-out that starts
open for an agent that is not ready. The Usage tab reads the Usage screen's
sources for 30 days: the gateway's by-agent figures (everyone's calls) and
kagent's session summary (yours, with any runtime-reported cost).

**Overview is the index**, not a redirecting `/overview`, because the create
flow and Update skills hand their write over in `location.state` for
`AgentCreationProgress`. Update skills navigates to the page it is on, so
`useAgentCreatedHandoff` picks up a handoff whenever it appears, not only at
mount. `AgentsRouter` mounts the page at `:installation/:namespace/:name/*` and
the edit wizard at `edit/:installation/:namespace/:name/*` (the static segment
ranks higher); the old `…/<name>/edit` redirects. `AgentsRouter.test.tsx` holds
both rankings.

Every write goes through agent-manager over muster as the person (see the
sections below); the plugin performs no Kubernetes write for agents.

The agent is fetched with **one targeted `useResource`**, so a deep link works
without the list. It polls 5 s while converging and 60 s otherwise
(`isAgentConverging`, shared with the list).

### Layout

Creation progress sits above the tabs. Reads live in the page component, so
switching tabs refetches nothing; the toolset's muster queries run only on
`…/tools`.

### Sections

- **Creation progress** (`AgentCreationProgress`) appears only after a write
  (consumed once) and polls `get_agent_status` until the Harness reports
  ready, re-reading a failed verdict every 5 s.
- **Header** — Edit and Use this agent are buttons; the actions menu offers
  `Update all skills to latest…` and `Delete agent…` where agent-manager is
  available, and always the **manifest dialog**: the `Agent` as YAML without `metadata.managedFields` and the
  `last-applied-configuration` annotation. It shows what the page does not
  (`plugins`, `promptTemplate`, labels, raw `status`).
- **GitOps** — `GitOpsCard` from `flux-react`, only when the desired state is in
  Git (see "GitOps provenance").
- **Status** — readiness, the failing condition, both generations when stale,
  the Harness and the revision it compiles, its warnings and the conditions
  (`ConditionsList`), so a broken agent is debuggable without `kubectl`.
- **Configuration** — Harness (`spec.harnessRef.name`), model, installation,
  namespace, the owning HelmRelease (linked to the gs deployment page), each
  same-namespace `RemoteMCPServer` binding with its allowlist (`tools`) and
  `requireApproval`, the gateway carrier, and each sub-agent
  (`subAgent.templateRef`, a same-namespace `AgentTemplate` compiled into the
  agent's runtime).
- **Instructions** — `spec.systemPrompt`; when it comes from
  `spec.systemPromptFrom`, Technical details names the ConfigMap key.
- **Toolset** — the carrier's declaration and what it resolves to for the
  viewer: declared, implicit full access (carrier without header), no gateway
  (`preset:none`), **not readable** (the `RemoteMCPServer`s could not be read)
  or **gateway server missing** (no server of the bound name). The last two are
  never mistaken for full access. `useAgentToolset` decides from the queries'
  terminal state, not from `isLoading` or `errors` (a `RejectedError` is
  filtered out of `errors`). A chat-only agent shows **No tools** at once.
- **Skills** — each `spec.skills[]` entry with its repository (or OCI
  reference, or bucket object), path and **pin** (short commit or digest), in
  the create flow's card grid as read-only `StaticCard`s. Moving a pin is
  explicit (agent-manager's `refreshSkills`).

### Deleting an agent

`AgentDeleteDialog` calls **`x_agent-manager_delete_agent`** as the person
(`useAgentDeletion`). agent-manager deletes the **`HelmRelease`**, so
helm-controller uninstalls it and its `Agent`, and deletes the namespace's
shared `OCIRepository` only when nothing else references it. The portal never
passes `force`.

**agent-manager decides everything**: the owning release, the Kustomization
guard (a live delete of a GitOps release would be undone), the suspended guard
(Flux drops a suspended release's finalizer without uninstalling) and the
sibling check (`internal/agents/service.go`). A refusal (`conflict:`) shows
verbatim; a viewer gets the apiserver's `forbidden:`. The old `useDeleteAgent`
is gone.

**What is offered follows feature detection**, not an access review: Edit,
Update skills and Delete appear when the installation's muster lists
`agent-manager` (`useAgentManagerAvailability`) and are withheld while the
server list loads. `View manifest` is always there.

**It also follows whether the agent can be written.** `get_agent`
(`useAgentManagerAgent`, shared with the edit page and the update-skills
dialog) returns `managed`. An agent whose `HelmRelease` a Flux Kustomization
applies is `managed: 'gitops'`, and agent-manager refuses live writes. With the
`commit` capability, all three actions run in commit mode (`agentWriteMode`):
the change becomes a pull request. Update skills then dry-runs with
`mode: commit`, confirms through `update_agent` with `refreshSkills` and
`mode: commit` (reported as `agentUpdated` with `mode: commit`,
`change: skillsRefreshed`) and shows the pull request. Without the capability,
all three are withheld.

Withheld actions are left out of the menu, not shown disabled; the Overview's
"Managed through GitOps" card explains. `agentManagerAbsenceReason` remains for
a deep link into `EditAgentPage`.

Use **agent-manager's verdict**, not `isGitOpsManaged()`, which is true for
every agent this plugin deploys. When the read settles without an answer (not
connected, refused), the actions stay offered and agent-manager still refuses
on confirm. While it is in flight they are withheld, so a GitOps agent is never
briefly writable.

**The dialog says one thing:** deleting ends every running session with the
agent, including other people's, which kagent never lists for the caller.

**On success** the list toasts "Deleting", not "Deleted", because the
`HelmRelease` has a finalizer and the row may linger. `requestedBy` and
`ociRepositoryKept` are not shown (see the toast rule in `docs/ui.md`). On
failure the dialog stays open with the message.

**Commit** (`delete_agent` with `mode: commit`, giantswarm/agent-manager#24)
opens a pull request removing the agent's files, behind
`get_info.capabilities.commit`. `auth_required` shows as a refusal.

The dialogs render in the **page body**, because the header slot is outside the
plugin's `QueryClientProvider` and the mutations, dry runs and `ServerSignIn`
need its providers.

### Editing an agent

Editing **is the create wizard**, prefilled.
`/customize/agents/<installation>/<namespace>/<name>/edit` (`EditAgentPage`,
steps `…/skills`, `…/tools`, `…/review`) reads
**`x_agent-manager_get_agent`**, agent-manager's availability, the commit
capability for git-applied agents and the skill catalog, then mounts the
wizard's steps under a **second `NewAgentFormProvider` in edit mode** (`edit` +
`initialState`), so a create draft is untouched. `useAgentWizardLinks` answers
the edit addresses.

`formStateOfAgent` (`lib/agentEdit.ts`) seeds the wizard. The model is
preselected and limited to the agent's namespace, because an update cannot move
the agent. Each catalog git skill is selected **at the agent's pinned commit**;
other skills (another repository, an OCI digest) are kept as pinned unless
removed. The technical name, installation and **Harness are fixed**, and the
assist is not shown. An agent without a declared toolset keeps implicit full
access until something is selected.

**The review is agent-manager's dry run.** `editStateOfForm` and
`lib/agentEdit.ts` derive the changed fields and `update_agent` arguments that
carry **exactly those**:

- an emptied string field is sent as `""` (back to the chart default; omitted
  means unchanged);
- `toolset`, `skills` and `egress` replace their whole list (an empty `egress`
  removes every extra origin);
- an empty toolset is sent as `preset:none`, never an empty list, which
  agent-manager refuses;
- untouched skills are written back verbatim;
- an untouched technical name in the Name field is not a display name.

The review lists the changes and asks **`validate_agent` with `update: true`**.

**Save changes** calls **`x_agent-manager_update_agent`** with the changed
fields (`useUpdateAgent`, reported as `AgentPlatform.agentUpdated`) and returns
with `action: 'updated'`, so the progress element polls `get_agent_status`
until the new revision is ready. agent-manager stamps the person into the
HelmRelease's `requestedBy` annotation. A suspended agent's dry run returns
`conflict:` and locks Save; a viewer gets `forbidden:`. A git-applied agent,
behind the commit capability, gets **Propose changes as pull request**
(`update_agent` with `mode: commit`), locked once its pull request is open.

### Updating an agent's skills

Skills never move by themselves (D8), so an agent's behaviour cannot change
because someone pushed to a skills repository. `AgentUpdateSkillsDialog`
moves them explicitly.

The dialog dry-runs `validate_agent` with `update: true` and
`refreshSkills: true`: agent-manager re-resolves every git skill to the head of
its repository's **default branch** (the ref `list_skills` reads). `lib/skillRefresh.ts`
pairs the result with `get_agent` by repository and path and shows, per git
skill, the pinned commit and the head. Digest-pinned skills stay. With every
skill at its head, confirm is locked. Generic chart 1.x has no
`skills[].git.ref`, so a skill pinned from another branch is refreshed only
through the edit flow.

Confirming calls **`update_agent` with `refreshSkills: true` only**, so nothing
else moves, and the page polls `get_agent_status` (`action: 'skills-updated'`).

A repository agent-manager cannot read returns `invalid_request:` from the dry
run (GitHub 404: missing repository, unknown ref, or a token that cannot read
it), and nothing is written. A suspended agent returns `conflict:`. GitOps
agents never reach the dialog. agent-manager does **not** check that a skill's
`path` still exists at the new head; the Harness then reports
`ResolvedRefs=False`, which the status card shows.

### The model is read directly, not from the fleet list

The ModelConfig is fetched by name in the agent's namespace, because
`ModelConfigsProvider` lists across all namespaces, which is admin-only (see
"Installation / ModelConfig querying"). A failed read shows the reference name.

### GitOps provenance

Provenance detection is **one implementation** in `kubernetes-react`
(`lib/k8s/provenance.ts`): `readProvenance`, `isGitOpsManaged`,
`provenanceReleaseId`, `isManagedByFlux`, the Kustomization label readers, and
`getHelmReleaseName` / `getHelmReleaseNamespace`. `flux-react` and `muster`
re-export them unchanged.

`isManagedByFlux` (Kustomization labels only) is **false for agents**, which
carry `helm.toolkit.fluxcd.io/*`. `GitOpsCard` therefore follows the owning
`HelmRelease`'s labels to the Kustomization and GitRepository, and takes any
`KubeObject` as `resource`.

**Reconciled by Flux is not GitOps-managed.** Where the chain ends without a
Kustomization, the card renders nothing: an agent created through the portal is
reconciled by Flux, but no file in Git describes it. "Deployed by" stays. The
page pre-gates on `isGitOpsManaged`; the gs cluster and deployment pages gate on
`isManagedByFlux` and are unchanged.

### Sessions are yours, not a usage metric

The tab reuses `SessionsTable` (agent and installation columns hidden) over a
**single-installation** query sharing the Sessions tab's cache key, and lists
all sessions. kagent scopes sessions to the caller, so the copy says "your";
on a kagent in `unsecure` mode the `/me` probe detects shared lists and the
copy changes.

### What it cannot show

The prototype's stats (sessions all-time, last 30 days, success rate) have **no
data behind them**: kagent keeps no per-agent counters and scopes sessions to
the caller. Do not add a stats strip. The agent's Usage tab differs because it
labels its figures as one person's own (see [the Usage tab](#the-usage-tab)).

## The Usage tab

`/usage` has routed tabs, Overview at the bare path; an unknown view redirects
to Overview, and the old `/agent-platform/usage/…` addresses (`overview`, `mcp`,
`technical`) redirect to their view. `UsageScopeBar` sets the
environment and the window (7, 30 or 90 days, in `?window=`,
`lib/usageWindow.ts`).

| View          | Path                   | Source                          | Whose            |
| ------------- | ---------------------- | ------------------------------- | ---------------- |
| Overview      | `/usage`               | agentgateway metrics, via Mimir | everyone's       |
| Cost          | `/usage/cost`          | agentgateway metrics, via Mimir | everyone's       |
| Your sessions | `/usage/your-sessions` | kagent's stored conversations   | the caller's own |

The tabs separate _whose_ usage each view reports; a sentence in a description
was too easy to skip. The path is the tab's label, `your-sessions`, so it is
not mistaken for `/sessions`; telemetry keeps reporting it as the `conversations`
view (see [It can only ever be personal](#it-can-only-ever-be-personal)).

### Where each number comes from

|                                       | agentgateway (Mimir)                | kagent                   |
| ------------------------------------- | ----------------------------------- | ------------------------ |
| tokens, cost, models, latency, errors | exact, all users                    | tokens only, caller only |
| per agent                             | exact                               | yes                      |
| per model                             | exact — the model that _answered_   | no (see below)           |
| **per user**                          | possible — `user` label, unread yet | implicitly, one user     |
| **per session**                       | **impossible** — no `session` label | yes                      |
| sessions, turns, tool calls           | not a concept                       | yes                      |

The metrics carry `gateway`, `listener`, `agent_namespace`, `agent`,
`gen_ai_request_model`, `gen_ai_response_model`, `gen_ai_token_type`, `status`
and `user` (the caller's email). There is no session dimension; adding one is a
platform change. `user` is recent, so a window reaching back before a gateway
upgrade cannot be fully attributed.

`agent` is the name the runtime sends (for calls outside the platform's egress,
the calling pod's ServiceAccount). The Cost tab therefore joins
`agent_namespace`/`agent` to each `Agent` CR's namespace and technical name,
not to kagent's encoded `agent_id`, which Your sessions uses. kagent names each
agent's ServiceAccount after the agent, so both agree (checked on `gazelle`,
2026-09-10). A label matching no CR shows as `namespace/agent`, marked
**Removed**, and stays in the totals; the gateway's `unknown` (no Pod matched
the caller IP) reads as Unattributed.

### Tokens per second is the median call, not the mean

The figure inverts the median of
`agentgateway_gen_ai_server_time_per_output_token` (one value per streamed
call): `1 / histogram_quantile(0.50, …)`. The mean (`_count / _sum`) is
unweighted by reply length, so short replies dominate it: on `graveler`
(2026-09-22, 30 days) the median call ran at 63 tok/s, but 1% of calls at
≥ 2.5 s/token pulled the mean to **2 tok/s**. `gazelle` hid the defect (197 by
the mean, 200 by the median).

**It is a rough rate.** The histogram buckets are `0.001, 0.01, 0.025, 0.05,
0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 2.5` seconds per token, so
`formatTokensPerSecond` prints two significant figures. The first bucket caps
the figure at 2000 tok/s, and a median in the overflow bucket (2.5 s/token)
renders as `<1/s`.

It measures model generation only, not an agent's turn, and only streamed
calls. With nothing streamed the quantile is `NaN` and the strip shows `—`. A
token-weighted throughput (38 tok/s on `graveler`, 81 on `gazelle`) was
rejected because its denominator includes prefill and the wait for the first
token.

### One cost is measured, the other is estimated — and the labels say which

- **Per agent and per model** (Cost tab, Overview tiles, an agent's and a
  model's Usage): **Spend** ("Est. spend" when converted to another currency),
  in tiles and tables alike. The gateway prices each call from its catalogue as
  it happens; this is measured. Every tile says whose calls it covers.
- **Per session** (the cost popover): **Est. cost**, kagent's tokens times
  a gateway-derived $/token over 7 days, so the rate reflects the current model
  mix. See the tier chain below.
- **Per agent on Your sessions**: **Est. cost** at one rate, the installation's
  blend across all models, because the table is one query. Its footnote points
  to the session page.
- **Per session, reported** (the cost popover): **Reported cost**, the runtime's
  own per-turn figure, summed. Only the claude Harness reports one.

Keep this naming: the gateway figure is as good as its catalogue, and the
session figure cannot be exact.

#### The rate tier chain, and why a known model never falls back

`useTokenRates` resolves in this order; `describeCostBasis` explains the winning
tier in a tooltip.

| tier           | when                                               | what it is                                                             |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `model`        | the session's model has observed traffic           | that model's own $/token — the only tier that prices a model correctly |
| `none`         | the model is known and has **no** observed traffic | nothing. `—`, with the tooltip naming the unpriced model               |
| `agent`        | no model resolvable, but this agent has traffic    | that agent's blend across whatever it ran                              |
| `installation` | neither                                            | a fleet blend across every model                                       |
| `none`         | nothing was priced anywhere                        | `—`                                                                    |

**A known model without an observed price stops the chain.** The measured
failure behind this rule:

> Session `01a05872-…` on `gazelle` runs `grill-master`, whose ModelConfig is
> `claude-opus-5`. It totals 59,865 input + 4,018 output = 63,883 tokens. The
> installation's 7-day blend was $3.0376/1M — derived **entirely from
> `claude-sonnet-4-6`**, the only model with gateway traffic — so the strip
> read **$0.194**. The gateway's own catalogue prices Opus at $5/1M input and
> $25/1M output, i.e. **$0.40** for this session, an effective $6.26/1M. The
> estimate was understated 2.06x, and nothing on screen said so.

The rate was another model's, and the 7-day window did not overlap the session
(31 Aug to 7 Sep; gateway metrics begin 9 Sep).

The model is `SessionRow.agentModel` ← `AgentRow.modelName` ←
`ModelConfig.getModel()`. Do not price with `AgentRow.model`, a display label
that falls back to the ModelConfig's resource name and never matches
`gen_ai_response_model`. It is the agent's model now: kagent pins no model to a
session.

**A model without a usable price contributes no cost, not an error.** Only
`agentgateway_cost_catalog_lookups_total` tells zero spend from unpriced spend,
which is why the Cost tab has a pricing-coverage alert and an unpriced-models
table. `deriveTokenRates` returns no rate for zero cost, so the UI shows `—`,
never `$0.00`.

**The two per-agent cost figures differ by design**: the Cost tab sums
everyone's calls; Your sessions prices only the reader's tokens.

### The daily charts: one row per day of the window, and today comes from its own query

- **A point is labelled by the day it covers.** A daily `counterIncrease` over
  `[1d]` (`llmUsageQueries.ts`) at UTC midnight totals the previous day, so
  `reduceDaily` shifts keys back one day.
- **Today comes from a separate instant query.** A future point makes
  `increase()` extrapolate a partial day. `dailyRangeWindow` stops at today's
  midnight, and an instant query per chart,
  `increase(...[<elapsed-since-midnight>])`, fills the last row
  (`applyTodayPartial`). The Cost tab's spend change compares whole windows
  (`previousCost`, an offset query), and only when
  `dataBeforePreviousWindow` finds records before the previous window starts.
- **The axis is the window.** `reduceDaily` renders every day of
  `dailyWindowDayKeys()`, zeros included; otherwise recharts drew a one-day
  metric as one bar across the chart. `StackedBarChart`'s `maxBarWidth` is the
  floor for sparse frames.
- **Query keys must be stable.** `start`, `end` and `step` are part of
  `useMimirRangeQuery`'s key, and a moving key refetches forever (this happened
  with raw elapsed seconds). `todayPartialRange` snaps down to five minutes.
  `dailyWindowDayKeys` and `todayDayKey` take the range instead of reading the
  clock, so they cannot straddle midnight.
- **The cost metric has no `gen_ai_token_type`.** Tokens split four ways
  (`input`, `output`, `input_cache_read`, `input_cache_write`); spend does not.
  `deriveTokenRates` returns only `blended`; its per-type branch waits for a
  gateway release that adds the label. Check with
  `count by (gen_ai_token_type) (agentgateway_gen_ai_client_cost_usd_total)`.

### Chart colours are validated, not chosen

`assignSeriesColors` (`ui-react`) uses eight hues in a **fixed order** that
passes colour-blindness checks against the card surfaces in light and dark
mode; re-validate before changing it. Past seven identities the rest pool into
a grey "Other". Some slots are below 3:1 contrast, so every chart has a legend
and the tables repeat the figures.

Numeric columns use `DataBar` (`ui-react`), scaled to **the column's own
maximum**, coloured per _measure_ (`lib/measures.ts`, `useMeasureColor`), not
per position. Measures that mean the same thing share a slot (`cost`, `calls`,
`ratio`), which is safe only because they never share a table;
`measureColors.test.tsx` pins this per table. Error counts use the status red.
Bars grow from the left, so those columns are left-aligned. Per-column scaling
makes bars comparable down a column only, which is why hues differ. The number
is always rendered, and the bar is `aria-hidden`.

muster's MCP tables duplicate the slot numbers (`barColors.test.ts`; `columnMax`
from `ui-react`) rather than import them, because the plugins do not depend on
each other; keep them in step. Its tables stack instead of sharing a row.

### Why the numbers have to be derived

kagent stores **no usage summary** (its only collector is `kagent_build_info`);
tokens exist only as per-message metadata in task payloads. Totalling them
means reading every conversation, so it happens in the backend:
`GET /kagent/session-usage`, the second route that interprets kagent. It shares
the fan-out machinery with the session-states route (`sessionFanOut.ts`) and
its arithmetic with the timeline (`reduceSessionUsage` in
`agent-platform-common`). `usageAgreesWithTimeline.test.ts` asserts both give
equal sums on every fixture.

### It can only ever be personal

`SessionService/ListSessions` answers the caller's sessions only (the backend
reads all pages), with no date filter and **no cross-user endpoint**. A team or
fleet view needs another data source, and the copy must never imply one.

On a kagent in `unsecure` mode the list is everyone's; the `/me` probe detects
it, the copy drops "your", and a warning says the numbers are not scoped to the
reader. It triggers only on a strict `false`.

### Why input and output are two charts, not one stack

Input runs about a hundred times output, so a stack or shared y-domain would
flatten output. The charts have **independent y-scales**.

### One installation at a time

The scope resolves to one installation: the pinned one if it runs kagent, else
home, else the first candidate. A pinned installation without kagent resolves
to **nothing**, so no one's usage is misattributed.

There is no fleet fan-out: each installation costs the plugin's most expensive
read, a cross-installation total answers no question (bills and agents are per
installation), and the MCP section cannot fan out either. A totals-only fleet
strip would be `?installation=all` on the backend route, not a browser
`useQueries`.

### By model comes from the gateway now, not from a frontend join

The Cost tab's By model table groups on `gen_ai_response_model`, the model that
answered each call. The former frontend join (by each agent's current
`ModelConfig`) misattributed history after a model change and was removed, with
`toByModelRows` and `ByModelTable`. Restoring it needs kagent to record a
per-session model first.

### The honesty line

- `skipped` — should have been evaluated and was not (past the cap or the pass
  budget).
- `unreadable` — asked and failed; only this is retryable.
- `undatedTurns` — tasks without `status.timestamp`, counted in totals but in
  no day bucket, so charts can sum to less than the tiles.

The activity window is in neither count, as a scope decision. `evaluatedAt` is
always shown, because the summary is cached for five minutes.

### Caching

`'session-usage'` is never persisted to `localStorage`: it details what one
person ran. Server-side it is a five-minute in-process cache keyed by a hash of
the caller's token, never `cacheService` (see
[Caching: user-scoped data is never persisted](#caching-user-scoped-data-is-never-persisted)).
Nothing polls it.

### One window control for the whole screen

The 7, 30 or 90-day toggle (`USAGE_WINDOW_OPTIONS`; 30 is the default and stays
out of the URL) drives every view. Gateway views query the window directly.
Your sessions narrows kagent's `windowDays` answer client-side (`narrowDaily`)
and disables wider choices; its by-agent and top tables still cover kagent's
full window. muster's MCP section passes the window to `/usage` as hours
and buckets it by day. `windowDays` and `windowStart` travel in the response,
so no heading hardcodes a window.

**Where the records start is read from the data**, never configured. A note
shows only when the records start after the window's first day _and_ nothing
was recorded in the week before the window (`usageDataStart` in
`agent-platform-common`):

- Gateway views: `firstSampledDay` takes the earliest day any daily range
  answer (cost, tokens, calls) has a point for; with none, but window totals,
  it is today. A zero is a day the series existed, so it counts.
  `usage.dataStart` feeds `DataStartNote` on Overview and Cost.
- One definition of "the data reaches back to here" (`dataBefore` in
  `llmUsageQueries.ts`): `count(last_over_time(<tokens>[7d] offset X))`,
  scoped like the page. `dataBeforeWindow` (offset: the window) gates the
  note; `dataBeforePreviousWindow` (offset: twice the window, only with
  `comparePrevious`) gates the spend delta. Tokens, not cost, so unpriced
  calls count. An answer is read from the data whenever there is any, so a
  failed refetch keeps it; without data the note stays away and the delta is
  dropped.
- Connectors: muster-backend's `/usage` reads its outcome query from a week
  before the window and returns `data_start`, the first bucket the chart
  fills from a sample, unless the week before held one. Narrowed to some
  connectors (`?server=`, repeatable), it still reads that query for the whole
  installation: a quiet connector's first call is not where the records
  start.

A series exists only from its label set's first call since the gateway or
muster pod started. Prometheus cannot tell a source that was not exporting yet
from one that restarted and then saw no calls, so the notes say what was
recorded ("has recorded model calls only since …"), which is true either way.
The week's lookback keeps a restart followed by a quiet weekend from reading as
missing data.

`sessionUsage.maxAgeMs` defaults to `windowDays` plus one day. Set explicitly,
it does not follow `windowDays`: a value below the window drops sessions idle
for longer than it, though their turns are inside the window. `maxSessions`
(60) does not scale with `windowDays` either; past it the oldest sessions are
`skipped`, so raise it with a wider window.

### Your top connectors is prefix-derived

muster names aggregated tools `x_{family|toolPrefix|name}_{tool}`
(`MCPServer.getToolNamePrefix`), so the segment after `x_` is the server; a
multi-segment prefix collapses to its family (`x_kubernetes_gazelle_*` →
`kubernetes`). Exact resolution needs `MCPServer` CRs the backend cannot read.
muster's Overview section resolves servers exactly from `mcpserver_name`.

### The MCP section is contributed, not imported

muster attaches it with `createExtension` to `page:agent-platform/usage`,
input `sections` (declared with `PageBlueprint.makeWithOverrides` and
`createExtensionInput`); sections render at the bottom of Overview. This is the
mechanism muster uses for its Connectors and Workflows tabs on the app's
Customize page (`page:app/agent-shell-customize`, input `pages`). An import
would load muster's bundle where muster is off and leave nothing to disable.
The id contract is commented on both ends. A second contributor should promote
this to a blueprint exported from an `alpha` entry point, as in
`plugins/flux-react/src/alpha/blueprints/`.

The Customize page orders its tabs itself (`CUSTOMIZE_TAB_IDS`), because
attach order cannot interleave two plugins' tabs.

### What it cannot show

- **Per-user spend.** The gateway's `user` label makes it possible, but showing
  one colleague's spend to another is an unmade decision.
- **Exact per-session cost.** No session label (see
  [One cost is measured, the other is estimated](#one-cost-is-measured-the-other-is-estimated--and-the-labels-say-which)).
- **Agents that bypass the gateway.** An agent calling a provider directly
  produces no `agentgateway_*` series; only its sessions appear on Your
  sessions, and a large gap between the two is the symptom.
- **Tokens/second and context-window usage from kagent.** kagent records only
  `promptTokenCount` and `candidatesTokenCount`. The gateway's figures cover
  only its own calls, so neither maps to a session. `totalTokens` is still read
  from kagent, because thinking tokens can make it exceed its parts.
- **Time to first token.** Emitted only for streamed responses and redundant
  with the per-output-token histogram, so it is not registered.

kagent 0.10 can prune sessions older than a configured number of days,
**deleting them**. Set below the window, Your sessions becomes silently
incomplete. Nothing configures it on the fleet today; Mimir's retention is
separate.

## Configuration

Every configuration key is in
[Agent Platform configuration](agent-platform-configuration.md).

## Provisional / placeholder aspects

Agents are releases of the **`agent` chart** (`github.com/giantswarm/agent`,
`helm/agent`, `oci://gsoci.azurecr.io/charts/giantswarm/agent`) in the `1.x`
range, composed and validated by agent-manager against `values.schema.json`.
The portal does not carry the values shape.

- **Commit** (`mode: commit`) is offered only where
  `get_info.capabilities.commit` is reported. The result is `pullRequestUrl`;
  `auth_required` shows as a refusal. The shape follows
  giantswarm/agent-manager#24 and may change.

---

## Open TODOs

### Installation / ModelConfig querying

- **The cluster-wide ModelConfig list is admin-only** (`GET …/modelconfigs`
  across all namespaces). Non-admins get a clear warning but cannot use the
  flow. The fix is a namespace-scoped strategy, after the platform defines the
  RBAC a non-admin needs outside Backstage.
- **Reachability coupling.** `useReachableInstallations` (used by
  `ServingProvider` and `useModelBackendControls`) imports `gs`'s
  `clusterAccessStatusApiRef` directly. Move the apiRef and types to a shared
  package if more plugins need it.

### Deployment

- **The muster URL is agent-manager's** (`get_info.muster.url`). A portal
  `musterMcpUrl` key would have no consumer, since `create_agent` takes no
  muster argument.

### Features

- **Name-conflict pre-check.** A taken name is refused only at Deploy
  (`conflict`). Asking `get_agent` from step 1 would surface it earlier.
- **Skills.** Private skill repositories need a platform answer (the create
  contract has no per-skill credential). Discovery reads the **default branch**
  and offers no per-skill `ref`.
- **An empty session is possible** between create and send. Avoiding it needs
  a server-side route that dispatches a turn without waiting.
- **The agent version is not pinned to the session.** The prototype's
  `model-session.md` requires it, but kagent's record has only `agent_ref`, so
  upgrading an agent changes every existing session. Raise upstream.
- **The composer cannot offer to create an agent** when the fleet has none. A
  link would help.
- **Batch decisions are not supported.** Answers send the uniform
  `decision_type: 'approve'|'reject'`, never `'batch'` with a `decisions` map,
  because kagent suspends on one confirmation at a time and a batch key that
  matches no `originalFunctionCall.id` **defaults to approve**. If parallel
  calls arrive in one confirmation, use `originalFunctionCall.id` (the inner
  ids for sub-agent HITL) and implement it deliberately.
- **Sub-agent HITL is untested.** `toolConfirmation.payload.hitl_parts` should
  receive the uniform decision too, but no fleet agent has produced one.
- **Sending needs a token muster also accepts.** Agents forward `Authorization`
  to their MCP servers (`allowedHeaders: ["authorization"]`), so a token kagent
  accepts and muster does not fails the turn at tool-listing
  (`failed to list MCP tools … Unauthorized`).
- **Streaming covers only this tab's turn.** Turns started elsewhere arrive by
  the 10 s poll; `tasks/resubscribe` exists, but knowing when to call it needs
  incremental session reads (giantswarm/giantswarm#37361).
- **No manual refresh on the session detail page.** The control belongs in the
  page header, outside the plugin's `QueryClientProvider`, so it needs
  `refresh` and `isRefreshing` on `SessionDetailView` through the `actions`
  memo. Copy `plugins/muster`'s `FreshnessIndicator`, ported to bui and moved to
  `ui-react`.
