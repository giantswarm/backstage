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

A change to a page is verified in a browser against agentlab before the PR
merges, and ships with the spec that proves it: `docs/development.md`,
"End-to-end tests in a browser, against agentlab", and `e2e/agentlab/README.md`.
The lab users are throwaway fixtures, and signing in as them, in the Dex popup
too, is part of the verification. Only real people's accounts and real
installations are off-limits.

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

## Pull requests

Fill in `.github/pull_request_template.md`. Before asking for review, run the
`ui-impact` skill and write its `### UI impact` section and block into the
description, for every pull request; redo it after pushes that change the UI.
From score 6, add the `ui-test-needed` label, and don't merge or ask for a
merge until `ui-tested` has replaced it. Details: the `ui-impact` skill and
`docs/development.md`, "Manual UI test before merge".

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
