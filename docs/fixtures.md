# Fixture modes

A fixture mode swaps a plugin's frontend API for an in-memory implementation,
so its pages render made-up data without their backends: for local
development, design reviews and layout checks. Fixture code never ships in a
production build.

| Flag                           | Plugin                                                                                                        | Fixture implementation                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `plans.fixtures: true`         | plans (Hive, the plan list)                                                                                   | `plugins/plans/src/apis/PlansFixtureApi.ts`, `plugins/plans/src/lib/hiveFixtures.ts`   |
| `roadmap.fixtures: true`       | roadmap (Hive's Roadmap tab)                                                                                  | `plugins/roadmap/src/apis/RoadmapFixtureApi.ts`                                        |
| `muster.fixtures: true`        | muster (`MusterApi`), and every tool call through it                                                          | `plugins/muster/src/apis/fixtures/`, plus the fixture MCP servers of other plugins     |
| `agentPlatform.fixtures: true` | agent-platform (`KagentApi`, `ModelManagerApi`, `AgentManagerCredentialsApi`)                                 | `plugins/agent-platform/src/apis/fixtures/`                                            |
| `gs.fixtures: true`            | the Kubernetes API of the installations (`kubernetesApiRef`), their cluster access, and Mimir (`mimirApiRef`) | `packages/app/src/modules/kubernetes/fixtures/`, `plugins/gs/src/apis/mimir/fixtures/` |

Set the flags in `app-config.local.yaml` and run `yarn start`. In a production
build (`NODE_ENV=production`, what `backstage-cli package build` and the image
use) the flags have no effect.

## Fixture mode

`yarn fixtures start` runs the portal with the Agent Platform's fixture flags
(`gs`, `muster`, `agentPlatform`) on and the guest signed in, without a
cluster or a person (`app-config.fixtures.yaml` on top of `app-config.yaml`;
no `.env` and no `app-config.local.yaml`). The Organizations pages' browser
flag (`agent-platform-organizations`) starts on in a browser that never had
fixture mode set it, and stays where the person's toggle puts it after that.
It is made for agents checking pages, several at a time, each in its own
checkout:

```bash
yarn fixtures start     # prints the portal's URL once it answers
yarn fixtures status    # the running server's state, as JSON
yarn fixtures stop
```

- The ports come from the operating system, never 3000 or 7007;
  `FIXTURES_APP_PORT` and `FIXTURES_BACKEND_PORT` choose them instead. Both
  servers bind `127.0.0.1`.
- The state is in `.fixtures-server.json` at the checkout's root (the URLs, the
  ports, the process ids, a token), the generated port config, the log and a
  lock in `.fixtures-server/`. Both are gitignored.
- `start` in a checkout whose server runs reuses it and prints its URL; `start`
  and `stop` take the lock, so concurrent starts spawn one server. A process
  counts as the checkout's server only while its command line carries the
  state's token, so `stop` never signals a process that took over a stale
  process id.
- The server stops on its own once no `start` has asked for it for
  `FIXTURES_IDLE_MINUTES` (default 60), and at once when `.fixtures-server.json`
  no longer names it. A start that fails stops what it started. Stop the
  server when you are done: a frontend and a backend per checkout are heavy.
- `--config <file>` adds a config on top, for example to turn on Hive and its
  fixtures (`app.extensions` must then repeat `app-config.yaml`'s list, which
  Backstage replaces rather than merges). A relative path is read from the
  directory you run the command in; from a workspace directory, run
  `yarn run -T fixtures …`.

### Scenarios

The `fixtures` query parameter switches the data set of the Agent Platform's
fixture APIs (muster, kagent, agent-manager's credentials, model-manager), of
the fixture Kubernetes API, of the fixture Mimir and of the Plans fixtures (Hive,
see "Plans") without restarting the server: load any page
with `?fixtures=<scenario>`. The Roadmap fixtures do not take part:
they serve their own data in every scenario.

| Scenario     | What those fixture APIs serve                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`       | The base data set (see "The data set"). The default.                                                                                                                                                                                                                                                                                                                                                                        |
| `empty`      | The three installations, with nothing in them: no organizations, agents, sessions, connectors, workflows, workspaces, toolchains, skill repositories, model backends or clusters (not even a management cluster).                                                                                                                                                                                                           |
| `many`       | Hundreds of items in each list a page shows: per installation about 250 agents, 200 connectors, 120 workflows and their executions, 300 sessions, 100 hosted models, 100 clusters, and dozens of pools, workspaces and toolchains.                                                                                                                                                                                          |
| `long-names` | Every name as long as a Kubernetes name may be (63 characters), display names as long in whole words. Except: GPU clusters 40, so their pools' names, which start with them, stay apart; the mounted cache claim, `hf-cache` as the serving slice names it; executions, named by their id; model backends, which model-manager names by their kind and the pages read as it; and the installations, which the config names. |
| `loading`    | No call ever answers.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `error`      | Every call fails (below).                                                                                                                                                                                                                                                                                                                                                                                                   |

The app reads the scenario as it starts, before any redirect can drop the
parameter, and keeps it for the page load (`fixtureScenarioOfPage` in
`@giantswarm/backstage-plugin-gs-common`); the tab keeps it too
(sessionStorage), so a reload after the app's own navigation, which drops the
parameter, serves it again. `?fixtures=base` goes back. A name fixture mode does
not know serves `base`, for the tab too, with a console error. The data sets
are `fixtureDataSet()` in `@giantswarm/backstage-plugin-gs-common/fixtures`
(`plugins/gs-common/src/fixtures/scenarios.ts`), which the fixture APIs and
tool handlers read instead of `baseDataSet()`; each fixture API's factory wraps
it with `withFixtureScenario` for `loading` and `error`. A module that keeps a
state built from the data set registers how to drop it with
`onFixtureScenarioReset`, so a test that switches the scenario with
`setFixtureScenarioForTests` gets one built from the new data set.

In `error`:

- muster fails in its own words, by installation: on `meadow` with
  muster-backend's 401 (a tool call asks for the sign-in to the tool's server,
  `server_sign_in_required`; any other call has its token refused,
  `token_rejected`); on `fennel` the person is signed out (the session-expired
  `MusterTokenMintError`); `tarragon` is not reachable, as in every scenario
  (503, and `unavailable` from the background reads). As the real client,
  `signIn` reports `false` rather than throwing, and `authHeaders`, which only
  resolves a token, fails only on `fennel`. muster-backend's list of
  installations answers: it is configuration, not a call to a muster.
- The Kubernetes API fails every read of objects with a 500, and every read by
  entity; the installations, discovery and access reviews answer, so the pages
  go on to their muster and kagent calls and show how those fail.
- Mimir fails every query with a 503, as the gs backend answers when Mimir
  does not, and the person's model cost falls back with kagent.
- kagent, agent-manager's credential operations and model-manager's
  `tryModel` fail with a 500. model-manager's other calls go through muster
  and fail as muster does.
- Plans fails every call that reaches GitHub as plans-backend does when
  muster does not answer: a 503, `ServiceUnavailableError` in the client,
  "meadow did not answer: …". The plans repositories and the magazine's place
  answer: plans-backend reads them from its configuration.

The plugins persist their query caches to localStorage and restore them as a
page loads, before any fixture API answers. Each provider adds the page's
scenario to its cache's `buster` (`fixtureScenarioCacheBuster`, outside
production builds and for every scenario but `base`), so a cache written under
another scenario, by this tab or another one, is never restored.

Customize · Skills reads the portal's own skill source through
`SkillDiscoveryFixtureApi`, which serves the base data set in every scenario
(see "gs-backend's skill routes").

### The installations

Fixture mode serves three made-up installations, `meadow`, `fennel` and
`tarragon` (`FIXTURE_INSTALLATIONS` in
`@giantswarm/backstage-plugin-gs-common`, which every fixture API reads; a
test checks that `gs.installations` in `app-config.fixtures.yaml` names them
and no other). muster and kagent report `tarragon` as not reachable from the
portal, as the base data set says. A call for any other installation fails
with a console error, in every fixture API. With `gs.fixtures` the fixture
Kubernetes API answers for each without a cluster: `/version` answers, `/apis`
lists the API groups of the portal's resource classes (kagent's, muster's and
Cluster API's among them; model hosting's is left out, so that component reads
as absent in the installation inventory), discovery answers
the versions the classes support (the newest preferred), a list or a read of
one object answers the objects the plugins' fixtures hold (see "Objects in the
Kubernetes API"), every other list is empty and any other object not found,
and access reviews are allowed, except that only an organization's admins may
create its models (`ModelConfig`), so Connect a model offers an organization
as owner only to them. Their cluster access is healthy from the start. Any
other request, a write among them, fails with a 501 and a console error.
Their Mimir is the fixture one (`mimirEnabled: true`, see "Mimir").

If the backend fails with "Invalid app bundle schema", a production build of
the app in `packages/app/dist` predates a config schema change: delete the
directory and start again.

### muster

The fixture `MusterApi` serves each installation's muster from the data set:
its connectors (MCP servers) in every state muster knows, live and in the
person's sign-in status (`auth://status`), and one connector, `wiki`, in each
ready organization's namespace, which muster names `<namespace>/<name>` and
whose tools it names `x_<namespace>_wiki_<tool>`; the catalogue, with the tools,
resources and prompts of the connectors that serve the session (Connected and
Running), the available workflows' `workflow_<name>` tools (an unavailable
workflow has none, as muster lists no invalid one) and muster's own `core_*`
tools, each described with its input schema; toolsets resolved within the
catalogue (`filter_tools` with `toolset`) and the presets, the built-in ones
and the installation's own; the workflows, their executions with their steps
and their run statistics; and MCP usage and tool latency over any window,
narrowed to some connectors or one tool. A connector's tools are named after
its tool prefix, or its name without one, and derived from it
(`connectorToolsOf`), so every read names the same ones. The tools of the
data set's connectors have no handler: running one fails as described
below. Of muster's own tools, `callTool` answers the two the New connector
flow calls before it saves, the transport probe (`core_mcpserver_detect`: a
reachable streamable-HTTP server without OAuth, except at a host under
`.invalid`, which no probe reaches, in muster's words) and the definition
check (`core_mcpserver_validate`, which passes), and the writes to
connectors. The catalogue describes them all, the definition tools
with the arguments the flow asks about (`displayName`, `tags`).

The connector writes (`core_mcpserver_create`, `_update`, `_delete`,
`core_service_start`, `_stop`, `_restart`) are kept in memory until the page
reloads, in one state per scenario that every muster read takes its data
from (`plugins/muster/src/apis/fixtures/musterFixtureState.ts`): the
`MCPServer` and `Workflow` objects, the servers list, the connector names,
the person's sign-in status, the catalogue with its workflows and presets,
the executions and the usage. An installation's reads are worked out again
only after a write there.

- A workflow's steps call the tools they were written against, from the data
  set's serving connectors; it is available while a serving connector offers
  each of them. Deleting, turning off or failing a connector makes the
  workflows that call its tools invalid (`Step <n> calls <tool>, which no
connector offers.`) and takes their `workflow_<name>` tools out of the
  catalogue. Past executions are records: they read as they ran, whatever
  the connectors do since. Usage counts the tools of the connectors there
  now.

- A connector a write starts (registered with `autoStart`, edited while
  active, turned on, reconnected, or signed in to) is `Connecting` for two
  seconds (`CONNECT_MS`, shorter than the pages' follow-up read after a
  write), then settles where its definition leads: `Failed` at a host under
  `.invalid` (RFC 2606), `Auth Required` with OAuth until the person signs
  in (`signInServer`; signing out asks again), `Awaiting Session` with OAuth
  that forwards the person's token, `Connected` otherwise, with six tools. A
  data set connector that is failed, disconnected or running keeps that
  state when it connects again, until an edit changes its URL or its
  sign-in; the starting and connecting ones stay as they are until a write
  starts them. An edit of a connector never started (registered without
  `autoStart`) leaves it stopped.
- Turning a connector off sets `spec.suspended`, as muster does, and the data
  set's stopped connector is off from the start; turning it on and
  reconnecting set `spec.restartRequestedAt`. Every write to the spec bumps
  `metadata.generation`, as the API server does, and the `Ready`
  condition's `observedGeneration` catches up once the connector has settled
  (at once when it is turned off), so the Test step shows an edit being
  applied. An edit merges onto the stored definition: a field left out, the
  type included, keeps its value.
- The writes are checked and answered in muster's words: a name taken
  (`MCP server '<name>' already exists`, a 422 like muster-backend's
  `connector_refused`), a connector not found, a reconnect of one turned off
  (`use core_service_start to resume it`) or waiting for the person's
  sign-in, which only `core_auth_login` connects, and a start or stop of one
  already in that state.

In `error` the writes fail as every call does, and in `loading` they never
answer. A scenario's writes start from its own data set.

The unreachable installation's reads fail as muster-backend refuses them, with
a 503 "<installation> did not answer: not reachable from this portal", and its
background reads (connector names, server info, sign-in status) answer
`unavailable`. Its `MCPServer` and `Workflow` objects stay readable: the portal
reaches its Kubernetes API, not its muster.

### agent-manager

agent-manager's tools answer from the data set
(`plugins/agent-platform/src/apis/fixtures/agentManagerFixtureState.ts`), and
so does the fixture `AgentManagerCredentialsApi`: the organizations with the
person's role in each, their members, models, connectors and egress policies,
and their agents, read back as `get_agent` reads them and listed as `Agent`
objects, each with its carrier `RemoteMCPServer` (the toolset), beside each
organization namespace's models (`ModelConfig`) and platform `Harness`.
`get_info` reports as `managed` the platform's namespace (`kagent`) and the
namespaces of the organizations whose role lets the person create agents
there, except one being erased: Connect a model reads its owners from them
(narrowed by the access reviews above), and the agent lists read agents from
them. The New agent form takes its owners from `list_organizations` instead.
Each namespace's default model carries the
`agent-platform.giantswarm.io/is-default-model-config` annotation, as
`list_model_configs` reports it (`default`), and the mark moves with
`set_organization_model`'s `default`. Its settings (`maxTokens`,
`promptCaching`, `cacheTTL`) are written and listed as agent-manager does: a
new Anthropic model caches for `5m`, an omitted setting keeps its value, and a
setting the provider's block lacks is refused with the field it names; every
organization's OpenAI model has a token limit of 8192. On `fennel`, whose
agent-manager predates model operations, the tool's schema lists none of them.
Arguments and answers cross as JSON, as
over MCP and HTTP, so no page shares the fixture's objects. The writes are
checked as agent-manager checks them (a person with the user role may not
create agents, a name taken is a `conflict`, a model the namespace lacks fails
the dry run, the last admin of `organization-admins` stays, nothing is written
in an organization being erased) and kept in memory until the page reloads:

- creating, editing and deleting an agent: an agent created or changed
  reports its new generation at once and the controller's verdict on it four
  seconds later (`SETTLE_MS`), so the pages show the progress before the
  result;
- adding and removing members, and erasing an organization, which goes
  through one erasure step per four seconds (`ERASURE_STEPS`) and is then
  gone, with its agents and models;
- adding a model or asking for a new key of a model or a connector: the tool
  prepares a credential operation, the credential form reads and saves it,
  and the save writes the model. The Models page opens the form at
  `/customize/models/credentials/<installation>/<namespace>/<operation>` for
  both scopes, as agent-manager's `credentials.uiURL` names it; the form reads
  the organization or the installation from the operation. An operation
  expires after 30 minutes
  (`OPERATION_TTL_MS`). A Vertex AI model's key is a service-account JSON of
  its project (`inputFormat: google-service-account-json`), checked on save;
  a write with `create` of a model that exists is `already_exists`;
- the installation's models, in `kagent`, in platform scope (the person is a
  cluster admin): `endpoint` and `noCredential` apply only there, and only
  `tenant-credential-*` Secrets are replaced;
- deleting a model (`delete_organization_object`), and its dry run, which
  decides whether the model page offers the deletion.

Each organization has two models: `default`, which its agents use, and
`gemini-vertex` on Vertex AI, which none uses, so its deletion completes.
Each installation's `kagent` namespace has `platform-default`, its default,
which a Helm release renders: agent-manager refuses to change it, delete it or
move the default off it (`gitops_owned`). `fennel`'s agent-manager predates
model credential operations: its `set_organization_model` schema lacks the
model fields, so the portal refuses every model write there.

`set_organization_model`, `replace_organization_credential` and
`start_session` honour their idempotency key (`requestId`): a retry answers
what the first call answered. This agent-manager writes live only: it reports
no `commit` capability, and a write in mode `commit` is refused as
`unsupported`.

`start_session` creates the session in kagent's fixture (see "kagent"), so
the session page it leads to opens it and sends the first prompt.

### kagent

The fixture `KagentApi`
(`plugins/agent-platform/src/apis/fixtures/kagentFixtureState.ts`) serves
each installation's sessions from the data set, with their conversations, and
the sessions agent-manager's `start_session` creates. The answers go through
the parsers the real client's go through, so the pages read what they read
from kagent.

- The conversations are the recorded kagent API v2 answers in
  `@giantswarm/backstage-plugin-agent-platform-common/testFixtures`, recast
  onto a session (its ids, its agent, its times;
  `plugins/agent-platform/src/apis/fixtures/kagentConversations.ts`). A
  session's newest turn is in the state its `turn` says: completed (tool calls
  the person approved, an answer, and the recorded PNG attached to the
  prompt), working (a reply being written, kept current), waiting on an
  approval or on answers to questions, failed (the model provider's refusal),
  canceled, and failed because kagent lost the session's runtime (reported on
  the session too). The states no v1 recording has are derived from one, with
  the words of the older recordings of that state.
- The session states summary (the session lists and the rail) and the
  usage summary (Usage · Your sessions) are computed with the backend's own
  code, shared through agent-platform-common (`kagentSessionRollups.ts`):
  the same selection (the sessions of the last seven days, at most twenty;
  of the last 31 days, at most sixty), the same state of each session and
  the same rollup of its turns. A session's record moves with its turns: a
  new turn, an answer or a cancel makes it ready and moves its `updatedAt`.
- A new turn replays the recorded stream, one frame per 300 ms (`FRAME_MS`),
  with a reply that says it is a replay. The turn runs on a timer, so it goes
  on when its stream is cut, as a real one does, and a subscription follows
  it again. A second message while a turn runs is refused as kagent refuses
  it, and so is a turn on a session whose runtime is being created, deleted
  or failed. Answering an approval, a question or a sign-in resumes the
  waiting turn, checked as the backend checks an answer (the request answered
  already, another request since, a question rejected, an answer missing);
  an approved tool call adds its recorded result before the reply. The seeded working
  turn has no end: its stream stays open until it would be cut (55 seconds,
  `STREAM_CUT_MS`), and stopping it cancels it.
- Renaming, deleting and canceling are kept in memory, refused in the
  backend's words; a cancel reaches the streams following the turn at once,
  and a deleted session ends its streams and is gone from every read.
- kagent on the unreachable installation fails every call as a timeout.
- The person's model cost (Usage · Your sessions) runs agent-platform-backend's
  queries through the fixture Mimir (`fixtureModelCost.ts`), and the backend's
  own decision (`modelCostOf` in agent-platform-common) reads their answers:
  partial on `meadow`, where some calls name no one, and
  `identity-unreadable` on the unreachable installation.

### workspace-manager, toolchain-manager and skill-manager

The three managers' tools answer from the data set too, so the Workspaces,
Toolchains and Skills tabs, their detail and edit pages, and the New session
dialog's workspace and toolchain pickers show data. agent-manager's `get_info`
reports the `toolchains` and `defaultWorkspace` capabilities, which the
dialog and the agent form ask for. Arguments and answers cross as JSON, as for
agent-manager.

- workspace-manager
  (`plugins/agent-platform/src/apis/fixtures/workspaceManagerFixtureState.ts`)
  lists the workspaces of the ready organizations the person is a member of,
  in every state (synced, syncing, failed, pending its first sync, being
  deleted), with their mirrors and the Session directories of the
  organization's sessions. A sync mirrors everything a workspace selects, as
  the manager fetches with the workspace's own credentials; the person's
  access counts when they start a Session. Its two provider instances are one
  the person granted and one they have not, which one workspace of each
  installation selects from; the access check before a Session answers
  granted, refused (a repository the person cannot read, a workspace not
  synced yet or being deleted) or connect_required (that workspace). The
  repository picker pages, searches and filters the owners' repositories
  from the manager's own listing, whatever the person's grant, and the
  preview resolves a selection as workspace-manager does. Creating, editing,
  syncing and deleting a workspace are kept in memory: a sync runs for four
  seconds (`SETTLE_MS`), a sync requested or an edit saved while one runs is
  served after it, a workspace being deleted syncs no more, and a deleted
  workspace goes once no Session directory is left on it.
  Refusals use workspace-manager's wording (`<operation>: permission denied:
…`, `not found`, `already exists`, `invalid workspace`, and the stale
  `resourceVersion` of an edit as a conflict), so the client classifies them
  as it classifies the real ones.
- toolchain-manager
  (`plugins/agent-platform/src/apis/fixtures/toolchainManagerFixtureState.ts`)
  lists the toolchains of the offered sources at their newest version, one
  name published by two sources, and an offered source it cannot read as
  unreachable; describes any published version; lists the sources, configured
  and added, approved and pending. Adding a source, searching packages,
  writing a Dockerfile from them and opening its pull request are kept in
  memory: the pull request moves on one build state per four seconds until it
  waits for a merge. Its refusals are toolchain-manager's: a name two sources
  publish, described without its source; a toolchain name or a Dockerfile
  label the contract check would refuse; a source its App does not reach;
  a toolchain the source has, or one with an open pull request.
- skill-manager (`plugins/agent-platform/src/apis/fixtures/mcpServers/skillManager.ts`)
  lists each installation's skill repositories in every state (readable,
  private, read-only, failed, failed with its last listing kept, and private
  and hidden from the person), with their skills and a plugin, and reads a
  skill and its files. It writes nothing, as skill-manager does not. The
  pages of one installation read it: an agent's page and the agent form. A
  new or changed skill is a pull request, which fixture mode opens in memory
  (see below).

### gs-backend's skill routes

The pages reach gs-backend's skill routes through the `SkillDiscoveryApi`
(`plugins/agent-platform/src/apis/SkillDiscoveryApi.ts`): the reads of the
portal's own skill source, `agentPlatform.skills.repositories`, and the pull
request that proposes a skill to any source. In fixture mode
`SkillDiscoveryFixtureApi` answers them from the data set, so nothing reads
from or writes to GitHub, and no GitHub token is asked for.

- The reads. Customize · Skills reads the home installation's skills, and
  fixture mode has no home installation (it sets no `gs.authProvider`), so
  the tab, a skill's page and Add skill read the portal's own source.
  `app-config.fixtures.yaml` configures the skill repositories of `meadow`,
  one in each state (`portalSkillRepositories` and `portalSkillSourceOf`; a
  test checks the URL, `path` and `readOnly` of each entry). The portal reads
  with its own credentials, as gs-backend does, so both private repositories
  are listed and marked private, whoever asks (the one skill-manager hides
  from the person has no skills in the data set). The read-only repository is
  off GitHub and scans `skills/`. A failed repository fails as the route
  forwards GitHub's 503 (`Failed to discover skills: …`), and a stale one
  answers its last listing with `stale: true` and the time it was read. A
  skill and its files are read at the commit asked for, as skill-manager's
  fixture reads them: a GitHub repository at another commit answers 404 (the
  data set holds only the current one), a git repository whose branch moved on
  409, and an unknown branch 404, in the route's words. A repository the data
  set lacks fails with a console error.
- The pull request. Proposing a new or changed skill, to the portal's source
  or through an installation's skill-manager, is checked as the route checks
  it (a skill name that is no slug, a repository off GitHub, read-only or not
  among the sources, a name taken, an edit started from an older commit, a
  pull request already open from the branch) and answers a made-up pull
  request on the repository, numbered from 101, kept in memory until the page
  reloads.

### model-manager and cluster-manager

Model hosting (Customize · Models · Model hosting: Running models, GPU pools,
Model cache, and its Serve, Import, Pull, Add backend and Add GPU node pool
flows) answers from one state
(`plugins/agent-platform/src/apis/fixtures/modelHostingFixtureState.ts`),
which model-manager's tools, cluster-manager's tools and the fixture
`ModelManagerApi` share, as the two managers share an installation: the nodes
model-manager places models on are the ready nodes of cluster-manager's pools,
and a cluster's first pool registers its KServe backend.

- model-manager runs a KServe and an Ollama backend in each installation
  (`fennel`'s Ollama host unhealthy, so its failure shows beside the other
  backend's models), with models served, starting, failing and downloaded,
  pulls running and failed, the presets, the nodes with their budget and
  cache, and a made-up Hugging Face Hub to search. A serve moves through its
  phases (`scheduling` to `ready`, two seconds each), a pull finishes after
  `PULL_MS`, and both are refused where model-manager refuses them: a model
  that fits no node (`does_not_fit`), a model on none or several backends, a
  served model deleted, a backend the chart configures, mode `commit`.
  Refusals keep model-manager's `<code>: <error>` wording, so the client
  names them as it names the real ones.
- The fixture `ModelManagerApi` is the real client over the portal's
  `MusterApi`, so its reads and the serving tools go through the same muster
  and the same parsers; only `tryModel`, which the portal's backend carries
  out, is answered by the fixture (401 without a token, the model's answer
  with one). KServe weights stay only in a cluster's model cache: on a
  cluster without one, a model is served or not listed.
- cluster-manager lists the GPU cluster under each KServe backend, with its
  GPU operator and serving slice, its pools in every phase and its model
  cache claims (mounted, kept, pending) with their prices. Adding a pool
  prices its sizes and the presets each hosts in the dry run, and the pool
  comes up after a while; deleting one is refused while a model is served on
  its nodes, naming them, unless forced; removing the cache is refused while
  a served model reads from it. It offers mode `apply` only, and not the
  Clusters page's `create_cluster` and `delete_cluster`.
- `create_node_pool` is described with its input schema (the accelerators,
  zones and cache the Add GPU node pool form offers): a fixture MCP server
  declares the schemas a page reads in `inputSchemas`.

Cost (Usage · Cost) reads the gateway's metrics from Mimir, not these
managers (see "Mimir").

### Mimir

The fixture `MimirApi` (`plugins/gs/src/apis/mimir/fixtures/`) answers each
fixture installation's agent gateway metrics, which Usage (Overview, Cost and
the rates of Your sessions) reads. The series are derived from the data set
(`gatewayUsage.ts` in gs-common): the ready agents of ready organizations,
the ones with sessions, call the organization's default model
(`FIXTURE_AGENT_MODEL`, the default ModelConfig's model) at its list price;
the person (`FIXTURE_PERSON_EMAIL`) through their sessions on the days each
ran, and two teammates on most working days of the 100 days before, busier
in some weeks than others; on `meadow` a share of one agent's calls names no one. Cost, tokens
by type, calls, durations, output speed, the inference listener's statuses
and price lookups all count the same calls. Each series starts on the day of
its first call, as the gateway creates it.

The figures are fixed for a seed and a time: the series count back from the
data set's time (`now`), and the fixture Mimir evaluates instant queries at
it, so a page shows the same figures however long it stays open. A load of
the page builds the base data set at that moment, though, so figures over a
window that ends now ("the last 30 days", "this month") move with the clock:

- within a day, by a few percent from midnight to midnight: the window takes in
  more of today's calls and less of its first day's;
- from day to day, by a few percent more: the window slides by a day, and the
  person's sessions, dated back from the data set's time, move with it.

A day in the past keeps its calls whichever day the data set is built on
(the teammates' calls depend on the calendar day, not on the window), and
nothing depends on the browser's time zone: days are UTC days. A figure to
check is therefore one with data, not a fixed amount; a test pins the amount
for a fixed time (`MimirFixtureApi.test.ts`). A page restored from the query
cache shows the previous load's figures until its queries answer again.

The fixture Mimir needs no token: the Mimir hooks pass the person's token
for the installation as they find it, and the real `MimirClient` refuses to
ask without one.

The queries are evaluated, not matched (`promql.ts`): selectors with
`offset` and `@ <time>`; `increase`, `rate`, `min_over_time`,
`max_over_time`, `avg_over_time`, `last_over_time`, `label_replace` and
`histogram_quantile`; the aggregations with `by` or `without`; `or`, `and`,
`unless`, arithmetic and comparisons, with `on` or `ignoring` and
`group_left` or `group_right`. That covers the gs pages' Mimir widgets too.
A metric without fixture series answers no series, as Mimir does; so does a
query the evaluator cannot read, with a console warning that names what it
could not read: extend the evaluator, or the series a new page reads.

### Plans

The fixture `PlansApi` (`plugins/plans/src/apis/PlansFixtureApi.ts`, the
magazine and the knowledge documents in `plugins/plans/src/lib/hiveFixtures.ts`)
serves Hive's Now, History, Plans and Knowledge tabs and a plan's review. Hive
is off in plain fixture mode; turn it on with the layout check's config for it:

```bash
yarn fixtures start --config .agents/skills/layout-check/specs/plans.app-config.yaml
```

Its data is its own, not the data set's: plans and magazine cards, not
Kubernetes objects. It follows the page's scenario
(`plansFixtureData` and `hiveFixtureMagazine`):

| Scenario     | What the Plans fixtures serve                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`       | One plans repository, `example/bumblebee-plans` (Hive's default team's), with three open plans and two merged ones; the magazine's Now (four lanes, plans to review, blockers, other teams' work), three weeks of History and six knowledge documents. Names are made up, epic titles are public roadmap issues.     |
| `empty`      | The same repository and the team's data set, with nothing in them: no open or merged plans, lanes without cards, no plans to review, nothing moved and no knowledge documents.                                                                                                                                       |
| `many`       | A plans repository for each of Hive's teams (a picker in the header for all teams), 300 open and 300 merged plans, 200 comments and 120 review comments on each plan, 75 cards in each lane of Now, 120 plans to review, 100 other teams' cards, 150 groups in History and 100 knowledge documents in each category. |
| `long-names` | The base data with every title as long as GitHub allows (256 characters, in whole words), every login as long (39), every plan folder, branch and knowledge document's file name as long as git allows a path segment (255), and people and customers named in 80 characters of whole words.                         |
| `loading`    | No call ever answers.                                                                                                                                                                                                                                                                                                |
| `error`      | Every call that reaches GitHub fails (see `error` above).                                                                                                                                                                                                                                                            |

### Objects in the Kubernetes API

The pages read some objects from the installation's Kubernetes API, not from
the plugin's API: muster's `MCPServer` and `Workflow` objects, for example. The
fixture Kubernetes API (`KubernetesFixtureApi`) lists and reads the objects of
`FIXTURE_OBJECTS`, one function per plugin that returns the objects of an
installation. A plugin exports its function from a `fixtures` subpath of its
own, as muster does with `musterKubernetesObjectsOf` in
`@giantswarm/backstage-plugin-muster/fixtures` and agent-platform with
`agentPlatformKubernetesObjectsOf` in
`@giantswarm/backstage-plugin-agent-platform/fixtures`, which only fixture
modules and tests import. A function answers the same array while its objects
stay the same and a new one after a fixture write changed them: the fixture
Kubernetes API indexes them again only then.

### Tool calls through muster

Most Agent Platform backends (agent-manager, workspace-manager,
toolchain-manager, skill-manager, cluster-manager, the model-manager tools) are
MCP servers the pages call through `musterApi.callTool()`. In fixture mode the
fixture `MusterApi` dispatches each call by its name, `x_<server>_<tool>`, to a
handler of a fixture MCP server, and lists those servers as connected and their
tools in the catalogue. A call no handler answers fails with "Fixture mode has
no handler for the tool …", in the console and as the page's error state, never
as an empty result: add the handler.

A plugin contributes its servers with an extension that attaches to
`FIXTURE_MCP_SERVERS.attachTo` (`api:muster/muster`, input `fixtureServers`)
with a data ref of the id `FIXTURE_MCP_SERVERS.dataRefId`, both from
gs-common, and loads its handler modules with a dynamic `import()` behind the
production check, as agent-platform's
`muster-fixture-servers:agent-platform` does (`plugins/agent-platform/src/plugin.tsx`):
one module per server under `src/apis/fixtures/mcpServers/`, a `FixtureMcpServer`
whose `tools` map a tool's own name to its handler. The handlers live with the
plugin that calls the tools, and each declares the answer type its client
reads (`ListWorkspacesAnswer`, `ToolchainList`, …), so a change to it breaks
the fixture's build.

A unit test in agent-platform and in muster keeps the handlers in step with
the calls (`fixtureToolCoverage.test.ts` under each plugin's
`src/apis/fixtures/`). Both use `fixtureToolCoverage` from
`@giantswarm/backstage-plugin-muster/testUtils`, a subpath only tests import,
which reads the plugin's source with the TypeScript compiler: it finds every
call to `MusterApi.callTool` and `callToolWithProgress`, in any form (a type
argument, a destructured or bracket access), and works out the tool names it
can call. A name resolves when it is a string literal, a constant or a
property of one, a template literal or concatenation of such parts, either
branch of a conditional, or what a function returns; a parameter resolves
through every call of its function in the plugin, so wrappers such as
`callManagerTool` and the clients' `call` methods resolve to what their
callers pass, and a component's prop to what its JSX elements pass. Anything
else resolves through its type when that is a string literal or a union of
them. A test fails:

- when fixture mode has no handler for a tool a page calls, unless the test
  lists it as not served, with a comment saying why;
- when a call's tool name cannot be worked out, unless the test lists the call
  (`<file>: <expression>`), with a comment;
- when a listed tool is answered or no longer called, or a listed call now
  resolves.

A pull request that calls a new tool adds its handler, or lists it. The guard
covers the Agent Platform and muster pages only. bot-prs also calls tools
through muster (`MargeClient`), but it has no fixture mode and is outside the
first scope of fixture mode (giantswarm/giantswarm#39251), so nothing checks
its calls.

### The data set

Every fixture API and tool handler reads one data set (the scenario's, see
"Scenarios"), so the pages tell one story: the agents an organization lists are the agents whose sessions kagent
lists. It is in `@giantswarm/backstage-plugin-gs-common/fixtures`
(`plugins/gs-common/src/fixtures/`), a subpath of its own that only fixture
modules and tests import (`giantswarm/no-fixture-imports` fails on any other import):

- `baseDataSet()` is the base data set, built once from a fixed seed: the
  three served installations (`tarragon` unreachable), and in each
  organizations, agents, connectors, sessions, workflows and executions in
  every state their pages know, and what the platform managers serve
  (`managerBuilders.ts`): the provider instances' owners and repositories,
  workspaces, toolchain sources and toolchains, and skill repositories; and
  model hosting (`hostingBuilders.ts`): model-manager's backends, their GPU
  clusters with pools and cache claims, and their models; and the Cluster API
  clusters (`clusterBuilders.ts`): each installation's management cluster,
  named after it, workload clusters of its ready organizations, ready,
  creating (no node pools yet) and deleting, on three releases (the oldest's
  Kubernetes 1.30 past its end of life in `app-config.fixtures.yaml`), and the
  GPU clusters among them. gs maps them onto Cluster, AWSCluster,
  AWSClusterRoleIdentity, KubeadmControlPlane, MachinePool and AWSMachinePool
  objects (`gsKubernetesObjectsOf` in `@giantswarm/backstage-plugin-gs/fixtures`),
  which the Clusters pages and the Platform section's list read. The
  person has each role in the ready
  organizations of each installation (admin, editor, user, so the New agent form's "needs the
  editor role" shows), manages the orphaned, pending-erase and deleting ones and is no
  member of the pending one. Only ready agents of ready organizations have
  sessions, and one pending agent has a failed release. Each session's `turn`
  says what its newest turn came to; besides the sessions of each agent, every
  installation has one session per turn state (`SESSION_TURNS`, the
  `turnSessions` setting), moved in the last two days, drawn after every other
  list so adding them changed none. Each installation's
  muster has three toolset presets made from its connectors and workflows
  (`buildToolsetPresets`, which draws no numbers): one that resolves in full,
  one that builds on `preset:read-only`, and one whose selectors match nothing
  for the person. Names are made of plant words, never a real installation,
  customer or repository.
- `createFixtureDataSet(settings)` builds another one: per list a `count`
  (per parent, such as agents per organization), a least `nameLength` (cut at
  63, a Kubernetes name's limit; display names keep their words whole) and
  the `states` the items take in turn. The served installations keep their
  names whatever the length; any beyond them have made-up names and are not
  served. The same `seed` and `now` build the same data set.
- The records are plain, not any client's answer. Each plugin maps them onto
  the types its clients read, next to its fixtures, through the parsers the
  real answers go through where there are any: muster's in
  `plugins/muster/src/apis/fixtures/musterFixtureData.ts` (MCP servers as
  objects and as muster lists them, their tools, resources, prompts and the
  person's sign-in status, installations, workflows as objects and in the
  catalogue, executions with their steps, run statistics, usage),
  agent-platform's in
  `plugins/agent-platform/src/apis/fixtures/agentPlatformFixtureData.ts`
  (Agent objects and their carriers, ModelConfig and Harness objects,
  agent-manager's agents and organizations, kagent sessions), kagent's
  conversations in `kagentConversations.ts`, and the managers' states next to
  them (`workspaceManagerFixtureState.ts`,
  `toolchainManagerFixtureState.ts`, `mcpServers/skillManager.ts`).

A page that reads a new field or shows a new state extends a builder or a
mapper in the same pull request, and the base data set gets the state.

### The layout check

The [`layout-check`](../.agents/skills/layout-check/SKILL.md) skill measures
pages of the running fixture mode in a headless Chromium of its own, at
several widths and in the states a spec steps through, and reports overflow,
overlapping elements, misaligned rows, squeezed or cut-off text, controls that
move or resize between states and content off its control's centre. It reads
the portal's URL from `.fixtures-server.json`:

```bash
node .agents/skills/layout-check/layout-check.mjs --page /customize/agents
```

## Adding a fixture mode

The pattern keeps the fixture code out of the production bundle, fixed at build
time rather than by config:

1. The fixture class implements the plugin's API interface, so a change to the
   interface breaks its build.
2. Fixture modules are named `*FixtureApi.ts` or `*Fixtures.ts`, or live in a
   `fixtures/` or `__fixtures__/` directory. Nothing imports them statically
   but tests, stories and other fixture modules: the lint rule
   `giantswarm/no-fixture-imports` (`.eslintrc.js`) fails on such an import
   anywhere else, the `apis` barrel included.
3. The API factory checks `process.env.NODE_ENV !== 'production'` before the
   config flag, in the factory itself, not in a helper. The bundler replaces
   `process.env.NODE_ENV` with a constant, so in a production build the branch
   is dead and dropped, with the `import()` inside it: the fixture chunk is
   never emitted.
4. API factories are synchronous, so the factory returns `lazyApi` from
   `@giantswarm/backstage-plugin-ui-react`, which loads the implementation with
   the dynamic `import()` on its first call. Every member of the API must be a
   required method returning a promise; the type of `lazyApi` refuses
   anything else. The wrapper answers each method name with one stable
   function, and behaves like a plain object otherwise (`String`,
   `JSON.stringify`, `await`, Jest's equality).
5. Add a string that only the fixture code contains, with its source file, to
   `MARKERS` in `scripts/check-bundle-fixtures.mjs`.
6. Document the flag in the plugin's `config.d.ts`, saying it has no effect in
   a production build.

```ts
factory: ({ configApi, discoveryApi, fetchApi }) => {
  if (
    process.env.NODE_ENV !== 'production' &&
    configApi.getOptionalBoolean('example.fixtures')
  ) {
    return lazyApi(async () => {
      const { ExampleFixtureApi } = await import('./apis/ExampleFixtureApi');
      return new ExampleFixtureApi();
    });
  }
  return new ExampleApiClient({ discoveryApi, fetchApi });
},
```

A unit test of the factory (`plugins/plans/src/plugin.test.ts`) covers both
sides: with the flag it serves fixture data, and with `NODE_ENV` set to
`production` it returns the real client.

## The checks

The lint rule catches the static import, the usual way fixture code leaks. The
bundle check is the backstop for the rest, such as a factory whose branch the
bundler could not drop: the `node-build` job builds the app for production and
then runs `yarn ci:bundle-fixtures` (`scripts/check-bundle-fixtures.mjs`),
which fails when any built file under `packages/app/dist` contains one of the
markers. It also fails when a marker's source file no longer contains it, so a
reworded fixture cannot disable the check unnoticed. To run it locally:

```bash
NODE_ENV=production yarn workspace app build --config ../../app-config.yaml
yarn ci:bundle-fixtures
```
