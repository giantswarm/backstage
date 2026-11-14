# Fixture modes

A fixture mode swaps a plugin's frontend API for an in-memory implementation,
so its pages render made-up data without their backends: for local
development, design reviews and layout checks. Fixture code never ships in a
production build.

| Flag                           | Plugin                                                                                 | Fixture implementation                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `plans.fixtures: true`         | plans (Hive, the plan list)                                                            | `plugins/plans/src/apis/PlansFixtureApi.ts`, `plugins/plans/src/lib/hiveFixtures.ts` |
| `roadmap.fixtures: true`       | roadmap (Hive's Roadmap tab)                                                           | `plugins/roadmap/src/apis/RoadmapFixtureApi.ts`                                      |
| `muster.fixtures: true`        | muster (`MusterApi`), and every tool call through it                                   | `plugins/muster/src/apis/fixtures/`, plus the fixture MCP servers of other plugins   |
| `agentPlatform.fixtures: true` | agent-platform (`KagentApi`, `ModelManagerApi`, `AgentManagerCredentialsApi`)          | `plugins/agent-platform/src/apis/fixtures/`                                          |
| `gs.fixtures: true`            | the Kubernetes API of the installations (`kubernetesApiRef`), and their cluster access | `packages/app/src/modules/kubernetes/fixtures/KubernetesFixtureApi.ts`               |

Set the flags in `app-config.local.yaml` and run `yarn start`. In a production
build (`NODE_ENV=production`, what `backstage-cli package build` and the image
use) the flags have no effect.

## Fixture mode

`yarn fixtures start` runs the portal with the Agent Platform's fixture flags
(`gs`, `muster`, `agentPlatform`) on and the guest signed in, without a cluster
or a person
(`app-config.fixtures.yaml` on top of `app-config.yaml`; no `.env` and no
`app-config.local.yaml`). It is made for agents checking pages, several at a
time, each in its own checkout:

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

### The installations

Fixture mode serves three made-up installations, `meadow`, `fennel` and
`tarragon` (`FIXTURE_INSTALLATIONS` in `@giantswarm/backstage-plugin-gs-common`,
which every fixture API reads; a test checks that `gs.installations` in
`app-config.fixtures.yaml` names them and no other). muster and kagent report
`tarragon` as not reachable from the portal, as the base data set says. A call
for any other installation fails with a console error, in every fixture API.
With `gs.fixtures` the fixture Kubernetes API answers for each without a
cluster: `/version` answers, `/apis` lists the API groups of the portal's resource classes
(kagent's and muster's among them; model hosting's and Cluster API's are left
out, so those components read as absent in the installation inventory),
discovery answers the versions the classes support (the newest preferred),
a list or a read of one object answers the objects the plugins' fixtures hold
(see "Objects in the Kubernetes API"), every other list is empty and any other
object not found, and access reviews are allowed. Their cluster
access is healthy from the start, and they have no metrics backend
(`mimirEnabled: false`). Any other request, a write among them, fails with a
501 and a console error.

If the backend fails with "Invalid app bundle schema", a production build of
the app in `packages/app/dist` predates a config schema change: delete the
directory and start again.

### muster

The fixture `MusterApi` serves each installation's muster from the data set:
its connectors (MCP servers) in every state muster knows, live and in the
person's sign-in status (`auth://status`); the catalogue, with the tools,
resources and prompts of the connectors that serve the session (Connected and
Running), the available workflows' `workflow_<name>` tools (an unavailable
workflow has none, as muster lists no invalid one) and muster's own `core_*`
tools, each described with its input schema; toolsets resolved within the
catalogue (`filter_tools` with `toolset`) and the presets, the built-in ones
and the installation's own; the workflows, their executions with their steps
and their run statistics; and MCP usage and tool latency over any window,
narrowed to some connectors or one tool. A connector's tools are named after
it and derived from it (`connectorToolsOf`), so every read names the same
ones. The tools of the data set's connectors have no handler: running one
fails as described below.

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
Arguments and answers cross as JSON, as over MCP and HTTP, so no page shares
the fixture's objects. The writes are checked as agent-manager checks them (a
person with the user role may not create agents, a name taken is a
`conflict`, a model the namespace lacks fails the dry run, the last admin of
`organization-admins` stays, nothing is written in an organization being
erased) and kept in memory until the page reloads:

- creating, editing and deleting an agent: an agent created or changed
  reports its new generation at once and the controller's verdict on it four
  seconds later (`SETTLE_MS`), so the pages show the progress before the
  result;
- adding and removing members, and erasing an organization, which goes
  through one erasure step per four seconds (`ERASURE_STEPS`) and is then
  gone, with its agents and models;
- adding a model or asking for a new key of a model or a connector: the tool
  prepares a credential operation, the credential form reads and saves it,
  and the save writes the model. An operation expires after 30 minutes
  (`OPERATION_TTL_MS`).

`set_organization_model`, `replace_organization_credential` and
`start_session` honour their idempotency key (`requestId`): a retry answers
what the first call answered. This agent-manager writes live only: it reports
no `commit` capability, and a write in mode `commit` is refused as
`unsupported`.

Known gap: `start_session` answers a new session id that kagent's fixture
does not list, so the session page it leads to has no session. The kagent
fixtures (giantswarm/giantswarm#39251, item 7) close it.

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
  skill and its files. It writes nothing, as skill-manager does not; a new or
  changed skill is a pull request through gs-backend, which fixture mode does
  not serve (giantswarm/giantswarm#39251, item 9b). The pages of one
  installation read it: an agent's page and the agent form. Customize ·
  Skills reads the home installation's skills, and fixture mode has none (it
  sets no `gs.authProvider`), so that tab still lists what gs-backend
  discovers on GitHub (item 9b).

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

### The data set

Every fixture API and tool handler reads one data set, so the pages tell one
story: the agents an organization lists are the agents whose sessions kagent
lists. It is in `@giantswarm/backstage-plugin-gs-common/fixtures`
(`plugins/gs-common/src/fixtures/`), a subpath of its own that only fixture
modules and tests import (`giantswarm/no-fixture-imports` fails on any other import):

- `baseDataSet()` is the base data set, built once from a fixed seed: the
  three served installations (`tarragon` unreachable), and in each
  organizations, agents, connectors, sessions, workflows and executions in
  every state their pages know, and what the platform managers serve
  (`managerBuilders.ts`): the provider instances' owners and repositories,
  workspaces, toolchain sources and toolchains, and skill repositories. The
  person has each role in the ready
  organizations of each installation (admin, editor, user, so the New agent form's "needs the
  editor role" shows), manages the orphaned, pending-erase and deleting ones and is no
  member of the pending one. Only ready agents of ready organizations have
  sessions, and one pending agent has a failed release. Each installation's
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
  agent-manager's agents and organizations, kagent sessions), and the
  managers' states next to them (`workspaceManagerFixtureState.ts`,
  `toolchainManagerFixtureState.ts`, `mcpServers/skillManager.ts`).

A page that reads a new field or shows a new state extends a builder or a
mapper in the same pull request, and the base data set gets the state.

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
