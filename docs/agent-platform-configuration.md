# Agent Platform configuration

What a deployment configures for the **Agent Platform shell**, the UI on `/`,
`/agent-platform/**` and `/customize/**` (see [agent-platform.md](agent-platform.md)).
The classic Platform Portal is out of scope.

The schemas are `packages/app/config.d.ts`, `plugins/agent-platform/config.d.ts`,
`plugins/agent-platform-backend/config.d.ts` and `plugins/gs/config.d.ts`.

## How the browser gets the config

A key works only in the channel it is meant for:

- **Public config** (`@visibility frontend`) is in the unauthenticated
  `index.html`. Only `app.portals.*`, `app.rootRedirect` and
  `gs.github.brokerAudience` are read this way, at start, before sign-in.
- **Signed-in config** is `GET /api/gs/config`, served after sign-in from the
  allowlist `SIGNED_IN_CONFIG_PATHS` (`plugins/gs-backend/src/signedInConfig.ts`).
  A key missing from it never reaches the browser, whatever its schema says. The
  frontend reads `agentPlatform.skills.repositories`, `agentPlatform.metaAgents`,
  `agentPlatform.integrations.slack`, `agentPlatform.integrations.slackDocsUrl`,
  `agentPlatform.models.contextWindows` and `gs.installations` (for `currency`
  and `mimirEnabled`).

`agentPlatform.kagent.*` is backend-only.

## Quick reference

| Key                                                       | Default    | Required?                                      | Without it                                                               |
| --------------------------------------------------------- | ---------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `app.portals.agentPlatform`                               | `false`    | Yes, to serve the shell to everyone            | Shell only for people who opt in with the `agent-platform-shell` flag    |
| `app.portals.platformPortal`                              | `true`     | No                                             | —                                                                        |
| `app.extensions: page:agent-platform`                     | enabled    | No                                             | —                                                                        |
| `gs.installations.<name>.baseDomain`                      | —          | Yes, per installation running the platform     | No kagent, muster, Mimir or avatar endpoint can be derived               |
| `gs.installations.<name>.mimirEnabled`                    | `true`     | Set `false` on installations without Mimir     | Usage metrics are requested from a Mimir that does not exist             |
| `gs.installations.<name>.currency`                        | USD        | No                                             | Costs shown in USD                                                       |
| `agentPlatform.kagent.installations`                      | derived    | No                                             | Every installation with a `baseDomain` is tried                          |
| `agentPlatform.kagent.*` timeouts and bounds              | see below  | No                                             | —                                                                        |
| `agentPlatform.skills.repositories`                       | `[]`       | Yes, for skills                                | No Skills tab, no skills step in the agent flows                         |
| `integrations.github` (Backstage integration)             | —          | Yes, in production with github.com skill repos | Anonymous GitHub API, 60 requests per hour shared by the backend         |
| `gs.github` or `auth.providers.github`                    | —          | Yes, for the skill pull-request flows          | Adding or editing a skill cannot get a GitHub token                      |
| `agentPlatform.metaAgents.<role>`                         | unset      | No                                             | The feature that role lights up stays hidden                             |
| `agentPlatform.integrations.slack`                        | `false`    | No                                             | No Slack banner on the new-session home                                  |
| `agentPlatform.integrations.slackDocsUrl`                 | GS docs    | No                                             | The Slack banner links to docs.giantswarm.io                             |
| `agentPlatform.models.contextWindows`                     | `{}`       | No                                             | The context indicator shows raw token counts instead of a percentage     |
| `@backstage/plugin-user-settings-backend` + persistent DB | registered | Yes, for roaming pins, favorites, dismissals   | State is lost on backend restart (in-memory SQLite) or stays per browser |

## Production requirements

A lab works without these; production needs them:

- **A GitHub token for skills.** Configure `integrations.github` (a GitHub App
  or a token) that can read every github.com repository in
  `agentPlatform.skills.repositories`. Without one, gs-backend reads GitHub
  anonymously at 60 requests an hour per IP, which took the Skills catalogue
  down during QA. Caching and bounded reads slow that budget's use but do not
  replace the token.
- **Qualified meta-agent names.** Every `agentPlatform.metaAgents.<role>` must
  be `<namespace>/<name>` or `<installation>/<namespace>/<name>`. A bare name
  resolves to nothing, and the role's feature disappears without an error (see
  [Meta-agents](#meta-agents-agentplatformmetaagents)).
- **The avatar service.** Avatars come from the chart's DiceBear service
  (`dicebear`, on by default) at `avatars.<baseDomain>`, through
  `plugins/agent-platform-backend/src/avatarRouter.ts`. Without it every avatar
  fails, the backend logs a warning per image, and the UI shows initials.

## Portals: `app.portals`

Read by `readPortals` (`plugins/agent-platform-common/src/portals.ts`) at app
start, before sign-in, so both keys are public.

| Key                          | Default | Required?              |
| ---------------------------- | ------- | ---------------------- |
| `app.portals.platformPortal` | `true`  | optional               |
| `app.portals.agentPlatform`  | `false` | required for the shell |

| Mode                                                          | Result                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only `platformPortal` (the default; also neither or both off) | Exactly the classic portal: no Agent Platform item or route, even where `app.extensions` lists `page:agent-platform`. The `agent-platform-shell` feature flag opts one browser into the shell after a reload. |
| Both on                                                       | The shell on `/`, `/agent-platform/**` and `/customize/**`, the classic portal everywhere else, each linking to the other in a new tab (classic to `/agent-platform`, the shell to `/clusters`).              |
| Only `agentPlatform`                                          | The shell is the whole navigation, without a Platform Portal item. Classic pages stay reachable by URL, and their Agent Platform item leads back in the same tab.                                             |

The Sessions, Agents, Models and Usage screens live on `page:agent-platform`
(`plugins/agent-platform/src/plugin.tsx`). It is enabled by default and mounted
only where the shell is on, so `app.portals.agentPlatform` alone switches the
Agent Platform on. `page:agent-platform: false` in `app.extensions` turns the
screens off. The classic sidebar's Agent Platform item follows `app.portals`,
not `nav-item:agent-platform`.

```yaml
app:
  portals:
    platformPortal: false
    agentPlatform: true
```

`app.rootRedirect` applies only to the classic home page; where the shell is
on, `/` is the shell's new-session screen (`AgentShellHomePage`). With both
portals on, the classic sidebar's logo leads to `app.rootRedirect` when it
names a classic page, and otherwise opens `/` in a new tab
(`packages/app/src/modules/nav/SidebarLogo.tsx`).

### The `agent-platform-shell` feature flag

`AGENT_SHELL_FLAG` (`plugins/agent-platform-common/src/agentShellFlag.ts`).
`PortalFeatureFlags` (`packages/app/src/modules/agentShell/PortalFeatureFlags.ts`)
reports it as on whenever `app.portals.agentPlatform` is on, and as the
person's own setting otherwise. It is therefore only a per-browser opt-in where
the shell is off, and it is not listed in the settings while
`app.portals.agentPlatform` is on. Every shell extension keys on the flag
internally. The app reads it once per load (`isAgentShellOn`), so toggling it
in the settings takes effect after a reload.

## Installations: `gs.installations.<name>`

The shell uses `gs.installations` (backend-only; the browser gets it through
the signed-in config).

### `baseDomain` — required

Every per-installation endpoint is derived from it:

| Derived endpoint                                | Used for                                                              | Code                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `https://agentgateway.<baseDomain>` (gRPC)      | Sessions, chat, the kagent-derived Usage figures                      | `plugins/agent-platform-backend/src/KagentClient.ts` |
| `https://muster.<baseDomain>/mcp`               | Agents (agent-manager), models (model-manager), connectors, workflows | `plugins/muster-backend/config.d.ts`                 |
| `https://observability.<baseDomain>/prometheus` | Usage metrics (Mimir)                                                 | `plugins/gs-backend/src/services/MimirService.ts`    |

Agent avatars need it too (`plugins/agent-platform-backend/src/installationDomain.ts`).
An installation without `baseDomain` has none of the above.

### `mimirEnabled` — the Usage metrics prerequisite

Default `true`. Usage's token, cost, latency and error figures come from the
agentgateway's metrics in the installation's Mimir. gs-backend proxies
`GET /api/gs/mimir/query` and `/mimir/query_range` to
`https://observability.<baseDomain>/prometheus/api/v1/…` with the person's OIDC
token for that installation and `X-Scope-OrgID: giantswarm`.

Set `mimirEnabled: false` where the Giant Swarm observability stack does not
run (a standalone installation): the backend answers 404 instead of calling a
missing Mimir, and the metrics-backed UI reads "unavailable" rather than
erroring.

Required in Mimir (the metric registry is
`plugins/gs/src/apis/mimir/metrics.ts`; the queries are
`plugins/agent-platform/src/lib/llmUsageQueries.ts`):

| Metric                                             | Gives                                                      |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `agentgateway_gen_ai_client_token_usage`           | Tokens, split by `gen_ai_token_type`                       |
| `agentgateway_gen_ai_client_cost_usd_total`        | Estimated spend (USD, priced from the gateway's catalogue) |
| `agentgateway_cost_catalog_lookups_total`          | Whether a model is priced (`Exact`) or not                 |
| `agentgateway_gen_ai_server_request_duration`      | Model calls and their duration                             |
| `agentgateway_gen_ai_server_time_per_output_token` | Generation speed (streamed calls only)                     |
| `agentgateway_requests_total`                      | Error rate, filtered to the `llm` listener                 |

Grouping labels: `agent_namespace`, `agent`, `gen_ai_response_model`,
`gen_ai_token_type`. LLM traffic must therefore go **through the agentgateway's
`llm` listener**, which exports these metrics with the agent labels, scraped
into the installation's Mimir. A model the gateway's catalogue does not price
contributes tokens but no cost.

### `currency` — optional

```yaml
gs:
  installations:
    golem:
      currency:
        code: EUR # ISO 4217
        usdRate: 0.92 # EUR per USD; without it a non-USD code shows USD
```

The gateway prices in USD; costs are converted with `usdRate`. Default USD
(`plugins/agent-platform/src/lib/formatNumbers.ts`).

## kagent access: `agentPlatform.kagent` (backend-only)

Sessions, chat and the kagent-derived Usage figures go through
agent-platform-backend, which speaks gRPC to each installation's kagent
controller route with the person's Dex ID token as `authorization: Bearer`.
Schema: `plugins/agent-platform-backend/config.d.ts`.

| Key                               | Default                                                                    | Meaning                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installations`                   | every `gs.installations` entry with a `baseDomain`                         | Which installations to reach kagent on; `{}` per entry means "derived origin". Restricts the fan-out.                                                                                         |
| `installations.<name>.apiBaseUrl` | `https://agentgateway.<baseDomain>`                                        | gRPC origin `https://<host>[:port]`, **no path**. Must be a route that validates the forwarded token.                                                                                         |
| `timeoutMs`                       | `10000`                                                                    | Per-request timeout toward a controller.                                                                                                                                                      |
| `turnTimeoutMs`                   | `30000`                                                                    | How long a send (and a Stop) waits before answering "still running". Keep below the ingress timeout.                                                                                          |
| `sessionStates.*`                 | 20 sessions, 7 days, 4 parallel, 5 s task / 8 s pass, 15 s cache           | Bounds of the session-state summary behind the rail. `budgetMs` must stay below 10 s (the poll).                                                                                              |
| `sessionUsage.windowDays`         | `30`                                                                       | The kagent-derived Usage window. Check kagent's own retention before raising it.                                                                                                              |
| `sessionUsage.*` (other bounds)   | 60 sessions, window + 1 day, 6 parallel, 5 s task / 20 s pass, 5 min cache | Bounds of the Usage summary. `budgetMs` must stay below the ingress timeout. An explicit `maxAgeMs` does not follow `windowDays`, and `maxSessions` never does: raise it with a wider window. |

**Without it**, the derived default works wherever the connectivity chart's
controller route exists. An installation without kagent reads as "not
installed".

```yaml
agentPlatform:
  kagent:
    installations:
      golem: {} # enabled, derived origin
```

## Agent creation, models, connectors and workflows: muster

None of these has an `agentPlatform` key. They are calls through the
installation's **muster**, as the signed-in person:

- **Agents**: **agent-manager** (`x_agent-manager_*`;
  `plugins/agent-platform/src/lib/agentManager.ts`). The chart, its version
  range, the Flux settings and the platform Harness come from its `get_info`,
  not from portal config. Edit and Delete appear only where it reports a write
  mode, and the pull-request variants only where it reports the `commit`
  capability.
- **Model serving** (Model hosting): **model-manager** (`x_model-manager_*`),
  shown only where it answers. The ModelConfig form writes the kagent CR
  through the Kubernetes API.
- **Connectors**: muster MCPServers, registered installation-wide through
  `core_mcpserver_detect`, `_validate`, `_create` and `_update`
  (`plugins/muster`, `NewConnectorWizard`). GitOps-managed servers are not
  editable.
- **Workflows**: muster workflows, read-only.

Requirement: a muster per installation, at the derived
`https://muster.<baseDomain>/mcp` or overridden in `muster.installations`
(`plugins/muster-backend/config.d.ts`), with `agent-manager` (and
`model-manager` for model hosting) registered as MCPServers. Without
agent-manager an installation offers no agent creation
(`useAgentManagerAvailability`).

## Skills: `agentPlatform.skills.repositories`

| Default | Required?           | Read by                                                                         |
| ------- | ------------------- | ------------------------------------------------------------------------------- |
| `[]`    | required for skills | frontend (signed-in config) and gs-backend (`plugins/gs-backend/src/router.ts`) |

Git repositories to discover skills from. Every `SKILL.md` is one skill (its
directory is the skill root; frontmatter `name` and `description` are shown).
An agent's skill is pinned to the commit discovery read.

**Without it**, the Skills tab is hidden (links redirect away), and the agent
create and edit flows skip their skills step.

The list is also an **allowlist**: gs-backend reads skill content and opens
pull requests only for configured repositories.

### Two discovery paths

| Entry                               | How it is read                                                                                                                                                          | Needs                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://github.com/<owner>/<repo>` | GitHub REST API (`discoverAgentSkills.ts`)                                                                                                                              | A Backstage GitHub integration (`integrations.github`, a GitHub App or token) that can read the repository. Without one: anonymous, 60 requests/hour per backend IP, public repositories only. |
| any other `http(s)://…` URL         | Plain git protocol, depth-1 clone (`discoverAgentSkillsFromGit.ts`) — no API, no rate limit, so a self-hosted or lab-local git server (Gitea, `git http-backend`) works | gs-backend must be able to clone it without credentials.                                                                                                                                       |

Either way the URL goes **unchanged** into the agent's chart values
(`git.url`), so agents must be able to `git fetch` it at boot.

Listings are cached in gs-backend's memory (`SkillDiscoveryCache`); an upstream
failure serves the previous listing marked stale.

### The pull-request flows (add and edit a skill)

Adding and editing a skill open a pull request; nothing changes until it is
merged (`POST /api/gs/agent-skills/pull-request`, `createSkillPullRequest.ts`).
Requirements:

- **github.com only.** The route refuses any other URL. Add skill offers only
  github.com repositories and is hidden when none is configured; a skill from a
  generic-git repository is read-only (no Edit or Evaluate).
- **The person's own GitHub token**, scope `repo`, from `githubAuthApiRef`:
  their GitHub grant in muster (`gs.github.brokerAudience` + `gs.authProvider`;
  a person without one connects once through muster) or Backstage's GitHub
  sign-in (`auth.providers.github`). The pull request is authored as that
  person, not a bot.
- **Push access** for that person: the branch (`add-skill/<name>`, or
  `update-skill/<directory as a slug>`, the repository name for a root-level
  skill) is created in the repository and targets the default branch. Without
  access, GitHub's 403 or 404 is shown.

The integration token (`integrations.github`) is **not** used for pull
requests; it only reads (discovery and SKILL.md content).

```yaml
agentPlatform:
  skills:
    repositories:
      - https://github.com/giantswarm/agent-skills
      # - http://gitserver.agent-platform.svc.cluster.local/skills.git
integrations:
  github:
    - host: github.com
      apps:
        - $include: github-app-credentials.yaml
```

## Meta-agents: `agentPlatform.metaAgents`

Which agent serves each platform role. Values must be qualified:
`<namespace>/<name>` (the Agent's namespace and technical name), or
`<installation>/<namespace>/<name>`. Read through `readMetaAgents`
(`plugins/agent-platform-common/src/metaAgents.ts`) and resolved by
`useMetaAgent` against the agents the person can see. A role's feature is
**hidden**, not disabled, while the role is unset or loading, and when its
value matches no agent or more than one. All roles are optional; default unset.

A bare name (`swarmgeist`) resolves to nothing, because anyone who can create an
agent in a readable namespace could otherwise take over the role and the
context the portal hands it (workflow definitions, skill drafts). Put
meta-agents in a namespace only the platform team can write to, such as
`kagent`. A `<namespace>/<name>` that exists on two installations is ambiguous
and hides the feature; name the installation then. On a deployment with several
installations, prefer the three-part form for every role: the two-part form is
matched only against the agents each viewer can currently see, so an agent with
the same namespace and name on another installation can win for a viewer who
sees that installation but not the intended one.

| Role                 | Lights up                                                                                | Consumer                                     |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `generalInformation` | The Agents tab's helper banner                                                           | `AgentsHelperBanner`                         |
| `agentManagement`    | The create flow's helper, which drafts the agent's instructions in a side chat           | `CreateAgentAssist`                          |
| `skillEvaluation`    | A skill's **Evaluate with <agent>**, a session with this agent about the skill           | `SkillDetailPage`                            |
| `skillCreation`      | Add and Edit skill: a hand-off into a session with this agent for complex, nested skills | `SkillCreationAssist`                        |
| `workflowManagement` | Creating and editing workflows through a session with this agent                         | `WorkflowCreateAssist`, `WorkflowEditAssist` |
| `platformOperations` | **Nothing yet.** No UI reads it.                                                         | —                                            |

```yaml
agentPlatform:
  metaAgents:
    generalInformation: kagent/swarmgeist
    agentManagement: kagent/swarm-operator
    skillEvaluation: kagent/skill-evaluator
    skillCreation: gazelle/kagent/skill-creator
```

Meta-agents are ordinary agents; the lab's example set is in
`design-context/implementation/lab-meta-agents.md` (not shipped docs).

## Slack: `agentPlatform.integrations`

| Key                                       | Default                      | Required? |
| ----------------------------------------- | ---------------------------- | --------- |
| `agentPlatform.integrations.slack`        | `false`                      | optional  |
| `agentPlatform.integrations.slackDocsUrl` | `https://docs.giantswarm.io` | optional  |

`slack: true` shows a Slack banner on the new-session home (`SlackPromoBanner`),
dismissible per person. Set it once the installation's Slack integration
(klaus-gateway) serves this portal's users.

`slackDocsUrl` is the banner's guide link, typically the installation's own
guide to agents in Slack. It must be an absolute http(s) URL; otherwise Giant
Swarm's docs open (`DEFAULT_SLACK_DOCS_URL`). It has no effect while `slack` is
off.

```yaml
agentPlatform:
  integrations:
    slack: true
    slackDocsUrl: https://intranet.example.com/agents-in-slack
```

## Context windows: `agentPlatform.models.contextWindows`

No platform component reports a hosted model's context window, so the context
indicator (`SessionCostPopover`) takes it from here. Keys are model-name
patterns matched case-insensitively against the ModelConfig's `spec.model` (`*`
matches any run of characters; the most specific pattern wins); values are
tokens. An unmatched model shows its raw token count instead of a percentage.

`app-config.yaml` ships a table for the Claude models. Its values follow
Anthropic's [context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
page: the models listed there with a 1M window (the 5.x families, Opus 4.6 to
4.8, Sonnet 4.6) have it by default, without a beta header, on the Claude API,
Bedrock and Vertex; the other Claude models have 200k. kagent and
agentgateway send no `context-1m` beta header, and the 1M models need none.
Each family has its own pattern and there is no `claude-*` catch-all, so a
model released after the table shows its raw count rather than a share of the
wrong window. A leading `*` also matches Bedrock ids
(`us.anthropic.claude-...`).

An installation's own entries merge into that table. A broader pattern there
(say `claude-*`) only covers models the shipped table does not name, since the
more specific pattern wins. Add an entry for a model the table lacks:

```yaml
agentPlatform:
  models:
    contextWindows:
      'example-model-*': 128000
```

When a session's context is larger than the configured window, the window is
evidently wrong, so the popover shows the raw count and says the configured
window looks too small, instead of a share.

## User settings: pins, favorites, dismissals

Pinned sessions, favorite agents and dismissed hints and banners use
Backstage's `storageApi`, bucket `agent-platform` (`usePinnedSessions`,
`useFavoriteAgents`, `useDismissedHint`). The app overrides `storageApi` with
`UserSettingsStorage` (`packages/app/src/modules/app/AppOverrides.tsx`), backed
by `@backstage/plugin-user-settings-backend` (registered in
`packages/backend/src/index.ts`), so the state **roams per user**.

There is no config key. The requirement is a persistent database
(`backend.database`, PostgreSQL): the default in-memory SQLite loses the state
on every restart. Signed out, the same code uses localStorage; with the
`user-settings` route unreachable, reads come back empty and writes fail
visibly.

The composer's last-used agent stays in the browser's localStorage
(`useLastUsedAgent`).

## Telemetry

The shell has no telemetry keys of its own; it uses the app's. Both blocks are
public, optional and documented in `packages/app/config.d.ts` and
[telemetry.md](telemetry.md):

| Key                                | Effect                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.telemetrydeck.appID`, `.salt` | TelemetryDeck page views and tracked actions, including the shell's writes (for example `AgentPlatform.skillProposed`).                    |
| `app.errorReporter.sentry.*`       | Frontend errors to Sentry (`dsn`, `environment`, `releaseVersion`, `tracesSampleRate`); the reporter needs the whole block when it is set. |

## Full example: an agent-platform-only deployment

```yaml
app:
  title: Agent Platform
  portals:
    platformPortal: false
    agentPlatform: true

backend:
  database:
    client: pg # pins, favorites and dismissals roam through it
    connection: ${POSTGRES_CONNECTION}

gs:
  installations:
    golem:
      pipeline: stable
      authProvider: oidc-golem
      baseDomain: golem.example.com # agentgateway, muster, observability
      mimirEnabled: true # default; false where Mimir is not deployed
      currency:
        code: EUR
        usdRate: 0.92

integrations:
  github:
    - host: github.com
      apps:
        - $include: github-app-credentials.yaml # skill discovery reads

agentPlatform:
  skills:
    repositories:
      - https://github.com/giantswarm/agent-skills
  metaAgents:
    generalInformation: kagent/swarmgeist
    agentManagement: kagent/swarm-operator
    skillEvaluation: kagent/skill-evaluator
  integrations:
    slack: true
  models:
    contextWindows:
      'example-model-*': 128000
  kagent:
    installations:
      golem: {}
```

The portal's usual sign-in configuration (`gs.authProvider`, `auth.providers`,
the per-installation OIDC providers) is assumed, because kagent, muster and
Mimir are called with the person's token for the installation.

Outside the portal, each installation needs a muster with agent-manager (and
model-manager) registered, the connectivity chart's kagent controller route on
`agentgateway.<baseDomain>`, and the agentgateway's `llm` listener exporting
its gen_ai metrics into Mimir.
