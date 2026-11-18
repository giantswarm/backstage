<!-- BEGIN devctl-managed: edits in this block are overwritten -->
<!-- markdownlint-disable-file MD041 -->

## Giant Swarm conventions

devctl maintains this block from [its template][devctl-agents-block] and
overwrites changes to it. Instructions for this repository go in the section
below. Where they differ from this block, they take precedence.

[devctl-agents-block]: https://github.com/giantswarm/devctl/blob/main/pkg/gen/input/llm/internal/file/agents_block.md.template

- Never put customer names or other customer information in code, commit
  messages, issues or pull requests. Most Giant Swarm repositories are public,
  and private ones are kept ready to become public.
- Giant Swarm's style guides are in <https://github.com/giantswarm/fmt>, one
  directory per topic (go, helm, kubernetes, prometheus, …). Read the relevant
  guide before you write or review that kind of code.
- Use conventional commits for commit messages and pull request titles.
- If `.github/workflows/zz_generated.auto_release.yaml` exists, GitHub Releases
  are written from pull request titles: do not edit CHANGELOG.md. Otherwise,
  add your change to CHANGELOG.md as described in
  <https://github.com/giantswarm/fmt/blob/main/releases/changelog.md>.
- If `.pre-commit-config.yaml` exists, run
  `pre-commit run --files <changed files>` before committing; not every clone
  has the hooks installed.
- Do not add linters, formatters or other tooling unless asked; use what the
  repository already has.
- Put documentation in `docs/` rather than growing README.md, which gives an
  overview and links into `docs/`. When a change affects documented behaviour,
  update the documentation in the same pull request.
- If the skills of the `giantswarm/claude-code` plugin marketplace are not
  available to you and the user works at Giant Swarm, tell them once that
  they can install the `gs-base`, `gs-dev` and `gs-appdev`
  plugins from it.

<!-- END devctl-managed -->

# CLAUDE.md

Guidance for Claude Code in this repository: Giant Swarm's customized Backstage
application, for internal use and customer portals. This file holds the
commands, the repository map and pointers. The rules of each area live in the
skills under `.claude/skills/` and the docs under `docs/`, named below where
they apply.

## Commands

### Run

```bash
yarn start            # frontend and backend together
yarn start backend
yarn start app
```

Local setup: `.env` (secrets in 1Password, loaded with `env-cmd`),
`app-config.local.yaml` copied from `app-config.local.yaml.example`, SQLite by
default (Postgres via Docker: `docs/development.md`), HTTPS via
`certificate.yaml`. Frontend on 3000, backend on 7007.

### Test

Run tests directly with the Bash tool, not the test-runner subagent. `yarn test`
runs once and exits (`--watchAll=false`); watch mode is `yarn test:watch`.

```bash
yarn test plugins/my-plugin                                      # one plugin
yarn test plugins/muster/src/components/shared/ToolTable plugins/agent-platform/src/components/ToolsetResolutionList
yarn test plugins/my-plugin/src/components/MyComponent -t "does the thing"
yarn workspace @giantswarm/backstage-plugin-muster test
yarn test:all                                                    # everything, with coverage
yarn test:e2e                                                    # Playwright against the dev server
yarn test:e2e:agentlab                                           # the browser suite against agentlab
```

Path patterns are Jest regexes, so a directory prefix is enough. Use them while
iterating: a plugin-wide run for a one-file change costs minutes for the same
signal. Save the plugin-wide run for a change to something shared, with call
sites beyond the file you edited.

Check a change to a page in a browser before you ask for review: in fixture
mode, on a dev server or against agentlab. The layout check is required on top
of that, as an automated safeguard: "Fixture mode and the layout check" below.
The browser suite against agentlab is optional: `docs/development.md`,
"End-to-end tests in a browser, against agentlab", and
`e2e/agentlab/README.md`. Its lab users are throwaway fixtures, and signing in
as them, in the Dex popup too, is fine. Only real people's accounts and real
installations are off-limits.

### Fixture mode and the layout check

Fixture mode runs the portal on made-up data, signed in as the guest, without
a cluster, on ports of its own, so every checkout can run one:
`docs/fixtures.md`.

```bash
yarn fixtures start    # prints the URL, which is also "url" in .fixtures-server.json
yarn fixtures status
yarn fixtures stop     # when you are done: a frontend and a backend per checkout are heavy
```

`?fixtures=<scenario>` switches the data set without a restart: `base` (the
default), `empty`, `many`, `long-names`, `loading` and `error`. What each
serves, and the pages that keep the base data in every scenario (Plans,
Roadmap, Customize · Skills): `docs/fixtures.md`, "Scenarios". The tab keeps
the scenario until `?fixtures=base`.

Open the portal in the chrome-devtools MCP only when it runs with `--isolated`
or a `--userDataDir` of your checkout (`claude mcp get chrome-devtools` shows
its arguments): its default profile is shared, so a second session's Chrome
does not start, and two portals on `127.0.0.1` overwrite each other's cookies.
When it runs without either, don't use it for checks: use the layout check or
the repo's Playwright, and tell the person once. Don't change the MCP's
config.

The fixtures move with the pages. A pull request that reads a new field, adds
a state or calls a new tool extends the fixtures in the same pull request
(`docs/fixtures.md`, "The data set" and "Tool calls through muster"). For a
tool the agent-platform or muster pages call, the drift guard
(`fixtureToolCoverage.test.ts` in each) fails until the tool has a handler or
the test lists it as not served, with a comment saying why. Nothing checks
bot-prs's calls through muster.

The [`layout-check`](.agents/skills/layout-check/SKILL.md) skill is required
for a UI change, before you ask for review, in addition to looking at it in a
browser: the pages the
`ui-impact` skill maps, at the default widths, in `base` and the scenarios the
change is about. Pass concrete paths, never a route template. For a page with
parameters, run the spec's entry for it (`--only <page name>`), which opens
the first record in each scenario: a record's path copied from fixture mode
exists only in the scenario it came from. A shell-wide change (`/*`) means a
few real pages. The check refuses a template and a page that shows "not
found".

```bash
node .agents/skills/layout-check/layout-check.mjs --scenarios base,long-names \
  --page /customize/agents --page /sessions
node .agents/skills/layout-check/layout-check.mjs --scenarios base,long-names \
  --spec .agents/skills/layout-check/specs/agent-platform.mjs --only Workspace
```

Read its exit code and its plain output: 0 is clean, 1 lists findings, 2 means
pages could not be checked (each named with the reason), which is no pass. The
warnings come after the findings, don't change the exit code and can run into
the thousands: read their heading, the count per scenario, not every warning.

The whole spec in all six scenarios is for an occasional sweep, not for every
pull request:

```bash
node .agents/skills/layout-check/layout-check.mjs \
  --spec .agents/skills/layout-check/specs/agent-platform.mjs \
  --scenarios base,many,long-names,empty,loading,error
```

### Lint, format, type-check

```bash
yarn lint                        # changed files since origin/main
yarn lint:all
yarn fix                         # auto-fix
yarn prettier:fix > /dev/null    # before committing
yarn prettier:check
yarn tsc                         # incremental; the heap is set in scripts/tsc.sh
yarn tsc:full                    # no skipLibCheck, no incremental
```

`yarn lint` swallows warnings: check a file you wrote with `npx eslint <path>`
from its package directory. Pre-commit runs lint-staged.

### Build

```bash
yarn build:all
yarn build:backend
yarn build:backend-headless-service
yarn build-image
yarn clean
```

### Git worktrees

A fresh `git worktree` contains only git-tracked files, so the app will not run
in it until the gitignored local config is copied over from the main checkout.
Symptom: the frontend loads but shows `Error: You do not appear to be signed
in.` (missing `.env`/credentials). Copy these from the main checkout into the
worktree root (they are all gitignored, so they won't show up in the worktree's
diff):

- `.env` — secrets (main cause of the "not signed in" error)
- `github-app-credentials.yaml` — GitHub OAuth credentials
- `app-config.local.yaml` — local config
- `certificate.yaml` — HTTPS cert (`$include`d by `app-config.local.yaml`)
- `catalog/` — local stub files + `templates/` that `app-config.local.yaml`
  points at via `../../catalog/*.yaml`

Also **do not symlink `node_modules`** — run a real `yarn install` per worktree
(a shared/symlinked tree lets an install corrupt the main checkout's tree).

## Repository map

A Yarn workspaces monorepo. `packages/`: `app` (the React 18 frontend, entry
`packages/app/src/App.tsx`), `backend` (entry `packages/backend/src/index.ts`,
the new backend system: `createBackend()` and `backend.add(import(...))`,
plugins self-register), `backend-headless-service`, `backend-common` (shared
backend utilities, the root logger).

`plugins/`, published under `@giantswarm/backstage-plugin-*`, by Backstage
package role:

- Frontend plugins: `gs` (the core pages Clusters, Deployments and
  Installations; the scaffolder field extensions, registered with
  `createScaffolderFieldExtension` in `plugins/gs/src/plugin.ts`; the gsAuth,
  containerRegistry, kubernetes and scaffolder APIs; the catalog page and
  entity cards), `agent-platform` (agents, sessions, usage), `muster` (the
  Customize screen's Connectors and Workflows tabs), `flux` (a shell; the logic
  is in `flux-react`), `plans`, `roadmap`, `platform-capabilities`,
  `repositories`, `bot-prs`. `ai-chat` is deprecated: fixes only.
- Backend plugins: `gs-backend`, `agent-platform-backend`, `muster-backend`,
  `plans-backend`, `roadmap-backend`, `platform-capabilities-backend`,
  `repositories-backend`. `ai-chat-backend` is deprecated with `ai-chat`.
- Backend modules of upstream backends: `catalog-backend-module-gs` (entity
  providers and processors), `auth-backend-module-gs`,
  `scaffolder-backend-module-gs`, `techdocs-backend-module-gs`.
- Libraries: `kubernetes-react` (resource classes under `lib/k8s/`, hooks,
  components), `flux-react`, `ui-react` (shared components and the table
  utilities), `gs-react`, `analytics-react` (`portalEvents` and
  `useTrackedMutation`), `error-reporter-react`, `agent-platform-common`,
  `gs-common` (frontend and backend), `gs-node` (backend only). `ai-chat-react`
  is deprecated with `ai-chat`.

## Rules by area

- UI: new and edited UI code imports from bui (`@backstage/ui`); MUI v4 and
  `@backstage/core-components` only for the pieces bui lacks. The inventory,
  the swap table and the allowed legacy pieces: `docs/ui.md` and the `ui`
  skill. Pages of the Agent Platform shell: the `agent-platform-ux-coding`
  skill.
- UI from a mockup: building or changing UI from a mockup or a design canvas
  (an artboard, a `.dc.html` file) follows the `mockups` skill: read the
  relevant artboards and everything they import in full, styles included, and
  write the inventory before any code.
- Components: one directory per component, an `index.ts` with a named export,
  no default exports: the `components` skill.
- Tables: the `tables` skill (the bui Table for simple tables; the
  core-components Table with `columns.tsx`, `useTableColumns` and the
  `ui-react` sort helpers for the rest).
- Forms and field validation: the `forms` skill. A review of a change that adds
  or changes a form, a dialog with inputs or a field's validation checks it
  against the skill's checklist.
- URLs of the Agent Platform shell: the `urls` skill. A link resolves through a
  route ref, never a path written by hand (ESLint fails CI on one). A review of
  a change that adds or moves a route checks it against the skill's checklist.
  The visual sitemap on Miro: the `ui-sitemap` skill.
- Telemetry: when you add a page, a tab or a route, add its case to
  `getTelemetryPageViewPayload` and a path to `knownTopLevelPaths`, or every
  visit becomes a Sentry warning. A write a person completes goes through
  `useTrackedMutation` with an event from `portalEvents`, which
  `docs/telemetry.md` lists. Both: `docs/telemetry.md`, "For developers".
- Kubernetes resource classes (`plugins/kubernetes-react/src/lib/k8s/`): the
  latest version only for a new resource, a version map with type guards for
  several: `docs/kubernetes-resource-classes.md`.
- Log levels: every backend `warn` and `error` becomes a Sentry issue, so a
  handled outcome logs at `info`: `docs/logging.md`.
- Naming: components PascalCase (`GSClustersPage`), hooks `useX`, utilities
  camelCase, plugins lowercase-with-hyphens; the `GS` prefix on Giant Swarm
  customizations; hooks in `hooks/`, utilities in `utils/`.
- Upstream Backstage and the community plugins as reference for idiomatic
  patterns: the `upstream-search` skill, which names the environment variables
  it needs.
- A new frontend or backend plugin: the `backstage-frontend-plugin` and
  `backstage-backend-plugin` skills, which need `BACKSTAGE_AGENT_SKILLS_DIR`.
- Updating Backstage: the `backstage-update` skill.
- Platform skills: the skills in giantswarm/agent-platform `skills/` describe
  the Agent Platform pages. A change to what an agent or a person can do, see or
  configure there comes with a pull request updating them, linked from this one.

## Pull requests

Fill in `.github/pull_request_template.md`. Before asking for review, run the
`ui-impact` skill and write its `### UI impact` section and block into the
description, for every pull request. Redo it after every push: re-map when the
push changed the UI, otherwise `--reuse` to move `sha` to the new head. From
score 6, add the `ui-test-needed` label, and don't merge or ask for a merge
until `ui-tested` has replaced it. This is a convention; no check enforces it.
Details: the `ui-impact` skill and `docs/development.md`, "Manual UI test
before merge".

Before asking for review of a pull request that changes a page, look at every
page it changes in a browser and run the `layout-check` skill on them, as
"Fixture mode and the layout check" above says. Fix what it finds or say in the
description why a finding is right as it is. A page fixture mode can't render
with data can't be layout-checked: say so in the description.

A pull request built from a mockup references the issue that links the mockup
and carries the "Differences from the mockup" section of the `mockups` skill.

## Configuration and secrets

`app-config.yaml` (base), `app-config.production.yaml` (settings come from the
environment), `app-config.headless-service.yaml`. Gitignored, never committed:
`app-config.local.yaml`, `.env` (template `.env.example`),
`github-app-*-credentials.yaml`, `certificate.yaml`.

## Build and release

- Image: `packages/backend/Dockerfile`. Chart: `helm/backstage/`.
- CI: CircleCI. `.circleci/config.yml` and `.circleci/workflows.yml` are
  generated by devctl; `.circleci/custom.yml` is repo-owned and deep-merged
  into them at pipeline time.
- Release, two axes. The app (image and chart) is released on every push to
  `main`: git-cliff turns conventional-commit PR titles into a tag and a GitHub
  Release (`zz_generated.auto_release.yaml`), which triggers the pipeline. The
  tagger does not bump `package.json`, so the root `version` lags the tags by
  design. The notes of a final release are curated with the `release-notes`
  skill. The plugin packages are changeset-managed, and that axis is dormant
  (nothing is published, see #1772); still add a changeset for a user-facing
  `plugins/*` change: the `changeset` skill.
- Dependencies: Backstage packages use `backstage:^`; `patch-package` applies
  the patches in `postinstall`; resolutions live in the root `package.json`;
  Renovate groups the Backstage updates.

## Ownership

Team Bumblebee (`@giantswarm/team-bumblebee`).
