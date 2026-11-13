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

### The installation

Fixture mode serves one made-up installation, `meadow`
(`FIXTURE_INSTALLATION` in `@giantswarm/backstage-plugin-gs-common`, which
every fixture API reads; a test checks that `gs.installations` in
`app-config.fixtures.yaml` names it and no other). A call for any other
installation fails with a console error, in every fixture API.
With `gs.fixtures` the fixture Kubernetes API answers for it without a
cluster: `/version` answers, `/apis` lists the API groups of the portal's resource classes
(kagent's and muster's among them; model hosting's and Cluster API's are left
out, so those components read as absent in the installation inventory),
discovery answers the versions the classes support (the newest preferred),
every list is empty, a
read of one object is not found, and access reviews are allowed. Its cluster
access is healthy from the start, and it has no metrics backend
(`mimirEnabled: false`). Any other request, a write among them, fails with a
501 and a console error.

If the backend fails with "Invalid app bundle schema", a production build of
the app in `packages/app/dist` predates a config schema change: delete the
directory and start again.

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

- `baseDataSet()` is the base data set, built once from a fixed seed:
  three installations (`meadow` first, reachable; one unreachable, one not
  probed yet), and in each organizations, agents, connectors, sessions,
  workflows and executions in every state their pages know. Names are made of
  plant words, never a real installation, customer or repository.
- `createFixtureDataSet(settings)` builds another one: per list a `count`
  (per parent, such as agents per organization), a least `nameLength` (cut at
  63, a Kubernetes name's limit) and the `states` the items take in turn.
  `meadow` keeps its name whatever the length. The same `seed` and `now`
  build the same data set.
- The records are plain, not any client's answer. Each plugin maps them onto
  the types its clients read, next to its fixtures, through the parsers the
  real answers go through where there are any: muster's in
  `plugins/muster/src/apis/fixtures/musterFixtureData.ts` (MCP servers as
  objects and as muster lists them, installations, workflows, executions),
  agent-platform's in
  `plugins/agent-platform/src/apis/fixtures/agentPlatformFixtureData.ts`
  (Agent objects, agent-manager's agents and organizations, kagent sessions).

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
