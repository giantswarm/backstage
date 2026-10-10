# Agent Platform configuration

What a deployment can and must configure for the **Agent Platform shell** —
the new UI on `/`, `/agent-platform/**` and `/customize/**` (see
[agent-platform.md](agent-platform.md) for what the UI does). The classic
Platform Portal is out of scope here.

Every key below is read by the code named next to it; the schemas are
`packages/app/config.d.ts`, `plugins/agent-platform/config.d.ts`,
`plugins/agent-platform-backend/config.d.ts` and `plugins/gs/config.d.ts`.

## How the browser gets the config

Two channels, and a key works only in the one it is meant for:

- **Public config** (`@visibility frontend` in a `config.d.ts`) is in the
  unauthenticated `index.html`. Of the keys on this page only `app.portals.*`,
  `app.rootRedirect` and `gs.github.brokerAudience` are read this way: the app
  decides with them at start, before sign-in.
- **Signed-in config** is `GET /api/gs/config`, served after the main sign-in
  from an allowlist (`SIGNED_IN_CONFIG_PATHS` in
  `plugins/gs-backend/src/signedInConfig.ts`). Every `agentPlatform.*` key the
  frontend reads is listed there; a key missing from that list never reaches
  the browser, whatever its schema says. The agent-platform frontend reads:
  `agentPlatform.skills.repositories`, `agentPlatform.metaAgents`,
  `agentPlatform.integrations.slack`, `agentPlatform.integrations.slackDocsUrl`,
  `agentPlatform.models.contextWindows`,
  and `gs.installations` (for `currency` and `mimirEnabled`).

`agentPlatform.kagent.*` is backend-only and is never served to the browser.

## Quick reference

| Key                                                       | Default    | Required?                                    | Without it                                                               |
| --------------------------------------------------------- | ---------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `app.portals.agentPlatform`                               | `false`    | Yes, to serve the shell to everyone          | Shell only for people who opt in with the `agent-platform-shell` flag    |
| `app.portals.platformPortal`                              | `true`     | No                                           | —                                                                        |
| `app.extensions: page:agent-platform`                     | disabled   | Yes, wherever the shell is on                | Sessions, Agents, Models and Usage screens do not exist                  |
| `gs.installations.<name>.baseDomain`                      | —          | Yes, per installation running the platform   | No kagent, muster, Mimir or avatar endpoint can be derived               |
| `gs.installations.<name>.mimirEnabled`                    | `true`     | Set `false` on installations without Mimir   | Usage metrics are requested from a Mimir that does not exist             |
| `gs.installations.<name>.currency`                        | USD        | No                                           | Costs shown in USD                                                       |
| `agentPlatform.kagent.installations`                      | derived    | No                                           | Every installation with a `baseDomain` is tried                          |
| `agentPlatform.kagent.*` timeouts and bounds              | see below  | No                                           | —                                                                        |
| `agentPlatform.skills.repositories`                       | `[]`       | Yes, for skills                              | No Skills tab, no skills step in the agent flows                         |
| `integrations.github` (Backstage integration)             | —          | Recommended with github.com skill repos      | Anonymous GitHub API, 60 requests per hour shared by the backend         |
| `gs.github` or `auth.providers.github`                    | —          | Yes, for the skill pull-request flows        | Adding or editing a skill cannot get a GitHub token                      |
| `agentPlatform.metaAgents.<role>`                         | unset      | No                                           | The feature that role lights up stays hidden                             |
| `agentPlatform.integrations.slack`                        | `false`    | No                                           | No Slack banner on the new-session home                                  |
| `agentPlatform.integrations.slackDocsUrl`                 | GS docs    | No                                           | The banner's "How it works" opens docs.giantswarm.io                     |
| `agentPlatform.models.contextWindows`                     | `{}`       | No                                           | The memory indicator shows raw token counts instead of a percentage      |
| `@backstage/plugin-user-settings-backend` + persistent DB | registered | Yes, for roaming pins, favorites, dismissals | State is lost on backend restart (in-memory SQLite) or stays per browser |

## Portals: `app.portals`

Read by `readPortals` (`plugins/agent-platform-common/src/portals.ts`), at app
start and before sign-in, so both keys are public.

| Key                          | Default | Required?              |
| ---------------------------- | ------- | ---------------------- |
| `app.portals.platformPortal` | `true`  | optional               |
| `app.portals.agentPlatform`  | `false` | required for the shell |

The three modes:

- **Only `platformPortal`** (the default — neither key set, or both set to
  `false`): exactly the classic portal. The per-person `agent-platform-shell`
  feature flag (Settings → Feature Flags) opts one browser into the shell next
  to the classic portal; it takes effect after a reload.
- **Both on**: the shell on `/`, `/agent-platform/**` and `/customize/**`, the
  classic portal in its own chrome everywhere else, each cross-linking to the
  other in a new tab.
- **Only `agentPlatform`**: the shell is the whole navigation. `/` is the
  new-session screen and the shell's rail has no "Platform Portal" item.
  Classic pages stay reachable by URL, in classic chrome, whose "Agent
  Platform" item leads back in the same tab.

**What breaks without it.** With `agentPlatform` off, nobody sees the shell
unless they set the feature flag themselves.

**Also required: `page:agent-platform`.** The Sessions, Agents, Models and
Usage screens live on the `page:agent-platform` extension
(`plugins/agent-platform/src/plugin.tsx`), which is **disabled by default**.
Enable it (and `nav-item:agent-platform` for the classic sidebar entry)
wherever the shell is on:

```yaml
app:
  portals:
    platformPortal: false
    agentPlatform: true
  extensions:
    - page:agent-platform
    - nav-item:agent-platform
```

`app.rootRedirect` does not apply where the shell is on: there `/` is the
shell's new-session screen (`AgentShellHomePage`, which ignores it). It only
redirects the classic home page.

### The `agent-platform-shell` feature flag

`AGENT_SHELL_FLAG` (`plugins/agent-platform-common/src/agentShellFlag.ts`). The
app's FeatureFlagsApi (`PortalFeatureFlags` in
`packages/app/src/modules/agentShell/PortalFeatureFlags.ts`) reports this flag
as **what the deployment decided**: on whenever `app.portals.agentPlatform` is
on, and otherwise the person's own setting. Its remaining meaning is therefore
only the per-browser opt-in on a deployment that has the shell switched off;
while `app.portals.agentPlatform` is on the flag is not listed in the settings
at all, because toggling it would change nothing. Internally every shell
extension still keys on the flag, which is why the deployment's choice is fed
through it.

## Installations: `gs.installations.<name>`

The shell has no installation list of its own: it uses `gs.installations`
(backend-only; the browser gets it through the signed-in config).

### `baseDomain` — required

Every per-installation endpoint the shell uses is derived from it:

| Derived endpoint                                | Used for                                                              | Code                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `https://agentgateway.<baseDomain>` (gRPC)      | Sessions, chat, the kagent-derived Usage figures                      | `plugins/agent-platform-backend/src/KagentClient.ts` |
| `https://muster.<baseDomain>/mcp`               | Agents (agent-manager), models (model-manager), connectors, workflows | `plugins/muster-backend/config.d.ts`                 |
| `https://observability.<baseDomain>/prometheus` | Usage metrics (Mimir)                                                 | `plugins/gs-backend/src/services/MimirService.ts`    |

Agent avatars need it too (`plugins/agent-platform-backend/src/installationDomain.ts`).
An installation without `baseDomain` has none of the above.

### `mimirEnabled` — the Usage metrics prerequisite

Default `true`. The Usage screens' token, cost, latency and error figures come
from the agentgateway's metrics in the installation's Mimir. gs-backend proxies
`GET /api/gs/mimir/query` and `/mimir/query_range` to
`https://observability.<baseDomain>/prometheus/api/v1/…` with the person's OIDC
token for that installation and `X-Scope-OrgID: giantswarm`.

Set `mimirEnabled: false` on an installation that does not run the Giant Swarm
observability stack (a standalone installation): the backend then refuses
with 404 instead of calling a Mimir that is not there, and the metrics-backed
UI renders "unavailable" rather than errors.

What has to be in Mimir (the metric registry is
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

Grouping labels used: `agent_namespace`, `agent`, `gen_ai_response_model`,
`gen_ai_token_type`. So LLM traffic must go **through the agentgateway's `llm`
listener**, which must export these metrics with the agent labels, and they
must be scraped into the installation's Mimir. A model the gateway's catalogue
does not price contributes tokens but no cost.

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
controller route and forwards the person's Dex ID token for that installation
as `authorization: Bearer`. Schema and full comments:
`plugins/agent-platform-backend/config.d.ts`.

| Key                               | Default                                                             | Meaning                                                                                               |
| --------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `installations`                   | every `gs.installations` entry with a `baseDomain`                  | Which installations to reach kagent on; `{}` per entry means "derived origin". Restricts the fan-out. |
| `installations.<name>.apiBaseUrl` | `https://agentgateway.<baseDomain>`                                 | gRPC origin `https://<host>[:port]`, **no path**. Must be a route that validates the forwarded token. |
| `timeoutMs`                       | `10000`                                                             | Per-request timeout toward a controller.                                                              |
| `turnTimeoutMs`                   | `30000`                                                             | How long a send (and a Stop) waits before answering "still running". Keep below the ingress timeout.  |
| `sessionStates.*`                 | 20 sessions, 7 days, 4 parallel, 5 s task / 8 s pass, 15 s cache    | Bounds of the session-state summary behind the rail. `budgetMs` must stay below 10 s (the poll).      |
| `sessionUsage.windowDays`         | `30`                                                                | The kagent-derived Usage window. Check kagent's own retention before raising it.                      |
| `sessionUsage.*` (other bounds)   | 60 sessions, 31 days, 6 parallel, 5 s task / 20 s pass, 5 min cache | Bounds of the Usage summary. `budgetMs` must stay below the ingress timeout.                          |

**Without it**: nothing to set — the derived default works where the
connectivity chart's controller route exists. An installation without kagent
fails per request and reads as "not installed".

```yaml
agentPlatform:
  kagent:
    installations:
      golem: {} # enabled, derived origin
```

## Agent creation, models, connectors and workflows: muster

None of these has an `agentPlatform` key. They are calls through the
installation's **muster**, as the signed-in person:

- Agents are validated, created, edited and deleted by **agent-manager**
  (`x_agent-manager_*` tools; `plugins/agent-platform/src/lib/agentManager.ts`).
  The chart, its version range, the Flux settings and the platform Harness are
  agent-manager's to report (`get_info`), not portal config.
  Edit and Delete appear only where agent-manager reports a write mode; the
  "Propose as pull request" variants only where it reports the `commit`
  capability.
- Model serving (Customize → Models → Model hosting) is **model-manager**
  (`x_model-manager_*`); its views appear only where model-manager answers. The
  ModelConfig form itself writes the kagent CR through the Kubernetes API.
- Connectors are muster MCPServers, registered for the whole installation
  through muster's `core_mcpserver_detect`, `_validate`, `_create` and
  `_update` tools (`plugins/muster`, `NewConnectorWizard`). GitOps-managed
  servers are not editable in the UI.
- Workflows are muster workflows, read-only in the UI.

Requirement: a muster per installation, at the derived
`https://muster.<baseDomain>/mcp` or overridden in `muster.installations`
(`plugins/muster-backend/config.d.ts`), with `agent-manager` (and
`model-manager` for model hosting) registered as MCPServers. An installation
whose muster lacks agent-manager does not offer agent creation
(`useAgentManagerAvailability`).

## Skills: `agentPlatform.skills.repositories`

| Default | Required?           | Read by                                                                         |
| ------- | ------------------- | ------------------------------------------------------------------------------- |
| `[]`    | required for skills | frontend (signed-in config) and gs-backend (`plugins/gs-backend/src/router.ts`) |

Git repositories to discover skills from. Every `SKILL.md` in a repository is
one skill (its directory is the skill root; frontmatter `name` and
`description` are shown). A skill an agent uses is pinned to the commit
discovery read.

**Without it**: the Customize → Skills tab is hidden (a link to it redirects
away), and the agent create and edit flows skip their skills step (three steps
instead of four: details, tools, review).

The list is also an **allowlist**: gs-backend reads skill content and opens
pull requests only for configured repositories.

### Two discovery paths

| Entry                               | How it is read                                                                                                                                                          | Needs                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://github.com/<owner>/<repo>` | GitHub REST API (`discoverAgentSkills.ts`)                                                                                                                              | A Backstage GitHub integration (`integrations.github`, a GitHub App or token) that can read the repository. Without one: anonymous, 60 requests/hour per backend IP, public repositories only. |
| any other `http(s)://…` URL         | Plain git protocol, depth-1 clone (`discoverAgentSkillsFromGit.ts`) — no API, no rate limit, so a self-hosted or lab-local git server (Gitea, `git http-backend`) works | gs-backend must be able to clone it without credentials.                                                                                                                                       |

Either way the URL travels **unchanged** into the agent's chart values
(`git.url`), so agents must be able to `git fetch` it at boot too.

Listings are cached in gs-backend's memory (`SkillDiscoveryCache`); an upstream
failure serves the previous listing marked stale.

### The pull-request flows (add and edit a skill)

**Add skill** (Customize → Skills) and **Edit** (a skill's detail page) open a
pull request — nothing is applied until someone merges it
(`POST /api/gs/agent-skills/pull-request`, `createSkillPullRequest.ts`).
Requirements:

- **github.com only.** The route refuses any other URL, so the UI offers only
  github.com repositories: "Add skill" lists only those as targets (and is
  hidden when none of the configured repositories is on github.com), and a
  skill from a generic-git repository gets a read-only detail page — its
  description and instructions, no Edit or Evaluate.
- **The person's own GitHub token**, scope `repo`, from `githubAuthApiRef`:
  either the person's GitHub grant in muster (`gs.github.brokerAudience` +
  `gs.authProvider`; a person without a grant is sent through muster's connect
  once) or Backstage's GitHub sign-in (`auth.providers.github`). The pull
  request is authored as that person, not a bot.
- **Push access** for that person to the repository: the branch
  (`add-skill/<name>`, or `update-skill/<directory as a slug>` — the repo
  name for a skill at the repository root) is created there and the pull
  request targets the default branch. No access → GitHub's 403/404 is shown.

The GitHub integration token (`integrations.github`) is **not** used for pull
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

Which agent serves each platform role. Values are the Agent resource's
technical name, optionally `<namespace>/<name>`. Read through
`readMetaAgents` (`plugins/agent-platform-common/src/metaAgents.ts`) and
resolved by `useMetaAgent` against the agents the person can see. A feature
gated on a role is **hidden** — no teaser, no disabled button — while the role
is unconfigured, still loading, or names an agent that does not exist. All
roles are optional; default unset.

| Role                 | Lights up                                                                                                                                           | Consumer             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `generalInformation` | Customize → Agents' helper banner ("Ask <agent> about agents")                                                                                      | `AgentsHelperBanner` |
| `agentManagement`    | The create flow's "Let <agent> help" button: drafts the agent's instructions with the person in a side chat; the form changes only when they accept | `CreateAgentAssist`  |
| `skillEvaluation`    | The skill detail page's **Evaluate** button, which starts a session with this agent about that skill                                                | `SkillDetailPage`    |
| `workflowManagement` | **Nothing yet.** Configurable, but no UI reads it today.                                                                                            | —                    |
| `platformOperations` | **Nothing yet.** Configurable, but no UI reads it today.                                                                                            | —                    |

```yaml
agentPlatform:
  metaAgents:
    generalInformation: swarmgeist
    agentManagement: swarm-operator
    skillEvaluation: kagent/skill-evaluator
```

The agents themselves are ordinary agents created on the platform; the lab's
example set is described in
`design-context/implementation/lab-meta-agents.md` (not shipped docs).

## Slack: `agentPlatform.integrations`

| Key                                       | Default                      | Required? |
| ----------------------------------------- | ---------------------------- | --------- |
| `agentPlatform.integrations.slack`        | `false`                      | optional  |
| `agentPlatform.integrations.slackDocsUrl` | `https://docs.giantswarm.io` | optional  |

`slack: true` shows the "Use your agents right in Slack" banner on the
new-session home (`SlackPromoBanner`), dismissible per person. Set it once the
installation's Slack integration (klaus-gateway) is set up for the people using
this portal. Without it nothing is shown.

`slackDocsUrl` is where the banner's **How it works** button points (opened in
a new tab): the installation's own guide to using agents from Slack. It must be
an absolute http(s) URL; when it is unset or not one, the button opens Giant
Swarm's docs (`DEFAULT_SLACK_DOCS_URL`). It has no effect while `slack` is off.

```yaml
agentPlatform:
  integrations:
    slack: true
    slackDocsUrl: https://intranet.example.com/agents-in-slack
```

## Context windows: `agentPlatform.models.contextWindows`

Nothing in the platform reports a hosted model's context window, so the chat's
memory indicator (`SessionCostPopover`) takes it from here. Keys are model-name
patterns matched case-insensitively against the ModelConfig's `spec.model`
(`*` matches any run of characters; the most specific pattern wins), values are
tokens. Default `{}`: a model no pattern names shows its raw token count
instead of a percentage.

```yaml
agentPlatform:
  models:
    contextWindows:
      'claude-*': 200000
      'gpt-5*': 400000
```

## User settings: pins, favorites, dismissals

Pinned sessions, favorite agents and dismissed hints and banners are stored
through Backstage's `storageApi`, bucket `agent-platform`
(`usePinnedSessions`, `useFavoriteAgents`, `useDismissedHint`). The app
overrides `storageApi` with `UserSettingsStorage`
(`packages/app/src/modules/app/AppOverrides.tsx`), backed by
`@backstage/plugin-user-settings-backend` (registered in
`packages/backend/src/index.ts`), so the state **roams per user** across
browsers and devices.

There is no config key. The requirement is the backend's database: with the
default in-memory SQLite the state is lost on every backend restart, so a real
deployment needs a persistent database (`backend.database`, PostgreSQL). While
signed out the same code uses localStorage; if the `user-settings` route is
unreachable, reads come back empty and writes fail visibly.

The composer's last-used agent is the one exception: it stays in the
browser's localStorage (`useLastUsedAgent`).

## Telemetry

The shell reports through the app's existing telemetry; it has no keys of its own.
Both blocks are public (read at app boot, before sign-in) and optional, and are
documented in `packages/app/config.d.ts` and [telemetry.md](telemetry.md):

| Key                                | Effect                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.telemetrydeck.appID`, `.salt` | TelemetryDeck page views and tracked actions. The shell's pages and its writes (for example `AgentPlatform.skillProposed`) report like every other page. |
| `app.errorReporter.sentry.*`       | Frontend errors to Sentry (`dsn`, `environment`, `releaseVersion`, `tracesSampleRate`); the reporter needs the whole block when it is set.               |

## Full example: an agent-platform-only deployment

```yaml
app:
  title: Agent Platform
  portals:
    platformPortal: false
    agentPlatform: true
  extensions:
    - page:agent-platform
    - nav-item:agent-platform

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
    generalInformation: swarmgeist
    agentManagement: swarm-operator
    skillEvaluation: skill-evaluator
  integrations:
    slack: true
  models:
    contextWindows:
      'claude-*': 200000
  kagent:
    installations:
      golem: {}
```

The portal's usual sign-in configuration (`gs.authProvider`, `auth.providers`,
the per-installation OIDC providers) is assumed: kagent, muster and Mimir are
all called with the person's token for the installation.

Plus, outside the portal: per installation a muster with agent-manager (and
model-manager) registered, the connectivity chart's kagent controller route on
`agentgateway.<baseDomain>`, and the agentgateway's `llm` listener exporting
its gen_ai metrics into Mimir.
