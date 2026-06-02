---
name: sentry-triage
description: Read, classify, and triage Sentry issues for this Backstage app, propose mitigations, and decide their disposition (fix, resolve, mute, or escalate). Use when given a Sentry issue URL (giantswarm.sentry.io/issues/...), asked to investigate a Sentry error/exception/CSP violation, asked why an image/script/style/font was blocked on a page, or asked to mute/ignore noisy Sentry issues.
user-invocable: true
---

# Sentry Issue Triage

Investigate a Sentry issue for Giant Swarm's Backstage app (`giantswarm.sentry.io`), classify it, locate the root cause, and propose the right mitigation. **Most fixes live in another repo, not in this one** — see below.

## Starting point

Where to begin depends on how you were invoked:

- **An issue reference** — a `giantswarm.sentry.io/issues/...` URL or a `BACKSTAGE-…` short ID → triage that one issue: go to **Step 1 — Fetch the issue**.
- **No argument** (e.g. the bare `/sentry-triage` slash command) → give an **Open-issues overview** across every Backstage project: see **Open-issues overview** below.
- **A narrower hint** — a project, a customer, or a class like "csp" → run the overview scoped to that filter.

## Tools

Issues are read via the **Sentry MCP server** (`sentry-mcp`). The org slug is `giantswarm`.

- `get_sentry_resource(url=...)` — fetch an issue/event by URL. Paste the Sentry URL directly; the resource type is auto-detected.
- `search_issue_events(...)` — list/filter events within one issue (by environment, release, user, trace).
- `search_issues(...)` — list issues **within one project** (pass `projectSlugOrId`). Org-wide search returns nothing — see "Sweeping for every occurrence".
- `find_projects(organizationSlug='giantswarm', query='backstage')` — list the per-customer projects to sweep.
- `update_issue(...)` — set status (resolved / ignored / archived).

If the sentry-mcp tools are not loaded, find them with `ToolSearch` (`select:mcp__plugin_sentry-mcp_sentry__get_sentry_resource,...`). If the MCP server is not connected at all, tell the user — do **not** try `WebFetch` on the Sentry URL (it's authenticated and will only hit the login wall).

## Deployments & projects

Backstage runs as a **separate deployment per customer**, and each one is its own pair of Sentry projects: **`backstage-<customer>-frontend`** and **`backstage-<customer>-backend`**. The frontend project receives browser events (CSP reports, React errors); the backend project receives Node/Express errors. List the current set with `find_projects(organizationSlug='giantswarm', query='backstage')` — there is one pair per customer.

Implications for triage:

- **The same root cause shows up as separate issues across many customers.** A shared bug (or a catalog entity present in several customers' catalogs, like a chart icon) fires one issue per affected `-frontend`/`-backend` project. A single source fix (e.g. a chart release, or an `app-config.yaml` change rolled out everywhere) usually resolves all of them — so after diagnosing one, sweep every customer for the same signature (see "Sweeping for every occurrence").
- The **`-frontend` vs `-backend` suffix** tells you where to look before you even open the event; the **customer prefix** tells you which deployment is affected.

## Open-issues overview (no-argument mode)

When invoked with no issue reference, produce a fast, grouped snapshot of everything **currently open** across the Backstage Sentry projects.

1. **List projects:** `find_projects(organizationSlug='giantswarm', query='backstage')` → the `backstage-<customer>-frontend` / `-backend` pairs.
2. **Sweep open issues in parallel** — one call per project, all in a single message (independent reads; do **not** use subagents):
   `search_issues(organizationSlug='giantswarm', projectSlugOrId='<project>', query='is:unresolved', sort='freq', limit=100)`.
   Per-project scoping is required — org-wide search returns nothing (see "Sweeping for every occurrence").
   Always pass `limit=100` — the default is 10, which silently truncates busy projects.
3. **Synthesize a digest — not raw dumps:**
   - **Group by signature, not by project.** Collapse the same title / `blocked-uri` seen across customers into one row plus an affected-project count. (For CSP groups, open one representative event to read its `blocked-uri` so duplicates merge correctly.)
   - **Signal first, noise summarized.** Lead with CSP violations and real exceptions; fold known noise (bot-probe `Untracked page view`, etc.) into a single counted line (see "Muting & noise reduction").
   - Per group show: short description · type (CSP / exception / warning / noise) · # projects affected · total events / users · a representative short ID + link.
   - List projects with **no open issues** as a one-line "all clear".
4. **Close with next actions** — which to triage now, which to fix-at-source-and-sweep, which to mute — and offer to drill into any one (→ Step 1).

Keep it scannable: a short table or grouped bullets, highest-impact first.

## Step 1 — Fetch the issue

```
get_sentry_resource(url='https://giantswarm.sentry.io/issues/<id>/')
```

Read the headline fields first: **Type**, **Message/Title**, **Culprit**, **Project**, occurrences/users, first/last seen, and the **Tags**. The `Type` and `logger` fields are what decide the classification below.

## Step 2 — Classify

| Signal | Class | See section |
|---|---|---|
| `Type: csp`, `logger: csp`, message like `Blocked '<kind>' from '<host>'` | **CSP violation** (not a code bug) | "CSP violations" below |
| A JS `Error` with a stack trace, `level: error/warning` | **Code exception** | "Code exceptions" below |

The **Project** name locates the issue (see "Deployments & projects" below): the suffix tells you whether it's `-frontend` (browser: CSP, React) or `-backend` (Node/Express), and the prefix tells you which customer. The Document/page URL in the event confirms the customer and page.

---

## CSP violations

A CSP issue is **not an application crash** — it's a Content-Security-Policy violation report the browser sent because a resource's host isn't on the allowlist. The page still works; usually something visual (an icon, an embedded image) just fails to load.

### Key fields

- **Blocked URI** — *what* was blocked (the full resource URL).
- **Effective / Violated Directive** — *which rule* blocked it (`img-src`, `script-src`, `style-src`, `font-src`, `connect-src`, `frame-src`).
- **Document URI** — *the page* it happened on. This is the strongest locator — use it (see heuristics).
- **Original Policy** — the **enforced** allowlist at the time. Trust this over the repo: the deployed policy is broader than this repo's `app-config.yaml` (extra hosts such as `s.giantswarm.io`, `api.securityscorecards.dev`, `developer.mend.io` are injected at deploy time from an external config layer). Check whether the host is already allowed *here*, not in `app-config.yaml`.

### Locate the source from the page (Document URI)

| Directive | Page | Almost certainly… |
|---|---|---|
| `img-src` | catalog **list** page (`/catalog`, `…?filters[kind]=component`) | a **catalog entity icon** — only icons render on a list page |
| `img-src` | entity **details** page (`/catalog/<ns>/<kind>/<name>`) | the entity **icon** *or* an **image embedded in the README** (rendered markdown) |
| `img-src` | TechDocs page (`/docs/...`) | an image embedded in the docs markdown |
| `script-src` / `style-src` / `connect-src` / `frame-src` | any | a plugin/card on that page loading a remote script, stylesheet, API, or iframe — identify the plugin owning the page |

### Where catalog entity icons come from

Giant Swarm catalog entities derive their icon from the Helm chart's `Chart.yaml` **`icon:`** field, in the app's own repo:

```
github.com/giantswarm/<name>-app  →  helm/<chart>/Chart.yaml  →  icon: <url>
```

Giant Swarm icons should be hosted on **`https://s.giantswarm.io/app-icons/...`** (which the deployed CSP allows) — **not** `raw.githubusercontent.com` or other upstream hosts. A blocked icon almost always means a chart points at the wrong host.

### Mitigations (in order of preference)

1. **Fix the source — preferred for Giant Swarm–owned charts.** Point the chart icon at `s.giantswarm.io/app-icons/...`. Edit `helm/<chart>/Chart.yaml` in the **app's repo** (not this repo), bump the chart `version`, and cut a release. Once released and re-imported into the catalog, the violation stops. **No change to the backstage repo is needed** when the target host is already allowed.
2. **Fix README / TechDocs markdown.** Repoint the embedded image to an allowed host (e.g. `s.giantswarm.io`, `user-images.githubusercontent.com`), in the source repo.
3. **Add the host to the CSP allowlist — only if the resource is legitimate and the host trusted.** Add it under `backend.csp.<directive>` in `app-config.yaml` (Helmet format — see `app-config.yaml` `backend.csp`, currently `connect-src`, `img-src`, `script-src`, `worker-src`). Prefer this for shared/upstream hosts you can't change. Remember the enforced policy may be managed outside this repo, so editing `app-config.yaml` alone may not be the whole picture — verify against the report's Original Policy and the deployment config.

### Worked example — `envoy-ai-gateway` icon

- **Symptom:** `Blocked 'image' from 'raw.githubusercontent.com'`, `img-src`, Document URI = a `…/catalog?filters[kind]=component` list page. List page + `img-src` → a chart icon.
- **Root cause:** `giantswarm/envoy-ai-gateway-app` `helm/envoy-ai-gateway/Chart.yaml` at the released `v0.1.0` had `icon: https://raw.githubusercontent.com/envoyproxy/ai-gateway/.../logo.svg` — a host not on the allowlist.
- **Scope:** the *same* blocked URI fired one issue in **every customer project** whose catalog includes this app — not just where it was first spotted. Grouping by `blocked-uri` showed it was one root cause, not several bugs.
- **Fix:** repointed to `icon: https://s.giantswarm.io/app-icons/envoy-ai-gateway/1/light.svg` (a host the deployed CSP already allows) and **released the app** as `v0.1.1`. No backstage change. Each customer's issue clears once its catalog re-imports the new chart version.

---

## Sweeping for every occurrence

A single root cause fires one issue per customer project (see "Deployments & projects"). To find and fix them all:

### 1. Sweep per project — org-wide search does NOT work

`search_issues` only works when scoped to a project via `projectSlugOrId`. **Org-wide it returns nothing** (`Project(s) … are not actively selected`), and tag / free-text filters like `logger:csp` or `Blocked` do **not** match at the issue-index level. So:

- Get the project list: `find_projects(organizationSlug='giantswarm', query='backstage')`.
- For CSP, only sweep the **`-frontend`** projects — the browser posts CSP reports to the frontend project's `report-uri`, so they never land in `-backend`.
- For each project, list every issue regardless of status:
  `search_issues(organizationSlug='giantswarm', projectSlugOrId='backstage-<customer>-frontend', query='all issues regardless of status', sort='freq', limit=100)`.
  The phrase *"all issues regardless of status"* translates to an empty query = all statuses; a bare `is:unresolved` would hide already-resolved hits. Always pass `limit=100` — the default of 10 silently drops issues on busier projects.
- These are independent reads — fire them as **parallel tool calls in one message**, not subagents. A flat fetch doesn't need per-item reasoning, so subagents would only add context overhead.

Identify CSP issues by title `Blocked '<kind>' from '<host>'` and culprit = a CSP directive. (Heads-up: `-frontend` projects also collect `Untracked page view` noise from internet bots probing `/wp-login.php`, `/phpmyadmin`, etc. — 0 users, ignore.)

### 2. Group by root cause, not by issue

Group hits by **`blocked-uri`** (or `blocked-host`) from the event — **not** by project. The same blocked URI across N customers is **one** root cause and **one** fix.

The issue headline only shows the host (`Blocked 'image' from 'raw.githubusercontent.com'`), not the full URI. To get the full URI cheaply without fetching the entire issue, use:
`search_issue_events(organizationSlug='giantswarm', issueId='<SHORT-ID>', query='', limit=1)`
and read the `blocked-uri` tag from the first event. Do this for one representative issue per distinct host before merging duplicates.

### 3. Fan out to investigate each distinct source (Haiku subagents)

This is where subagents earn their keep: one cheap (`model: 'haiku'`) subagent per **distinct blocked host/URI**, each doing independent GitHub spelunking in parallel. Give each the blocked URI and have it use the `gh` CLI to:

- find the Giant Swarm app repo (`gh search repos --owner giantswarm <term>`, `gh search code --owner giantswarm "<host-or-filename>"`),
- read the Helm `Chart.yaml` `icon:` on `main` **and** at the latest release tag (`gh api repos/giantswarm/<repo>/contents/<path>?ref=<ref> --jq .content | base64 -d`),
- report whether it points at a disallowed host, and propose the fix (repoint to `s.giantswarm.io/app-icons/<name>/...`; cut a release).

Have each return a small structured report (`repo`, `chart_path`, `icon_url_main`, `icon_url_latest_release`, `recommended_fix`), then synthesize. Worth it only when there are **several distinct sources**; for one or two, investigate inline.

⚠️ **Watch for sub-charts.** A wrapper chart's `icon:` can be correct while a vendored **sub**chart's `Chart.yaml` still carries the bad URL (and is the one rendered). Confirm which `Chart.yaml` the catalog importer actually reads for that entity before editing.

---

## Code exceptions

Real JS errors (stack trace present), distinct from CSP reports.

- **Frontend** errors are reported through `SentryErrorReporter` (`packages/app/src/apis/errorReporter/SentryErrorReporter.ts`), wired in `packages/app/src/modules/app/AppOverrides.tsx`. Stack frames pointing into `plugins/*` are first-party — start there. `warning`-level entries come through `captureMessage`.
- **Backend** errors come from the backend service / plugins (`packages/backend`, `plugins/*-backend`).
- Triage: read the stack trace, prefer first-party frames, check the release/environment tags and breadcrumbs, reproduce locally, then fix in the owning plugin and add a changeset (see the `changeset` skill).

---

## Muting & noise reduction

Not every issue is a bug to fix. Once classified, pick the disposition:

| Finding | Disposition |
|---|---|
| Real bug, fixable in this repo | Fix in the owning plugin (+ changeset), reference the issue so it auto-closes — see "Resolving the issue". |
| Shared root cause (e.g. a chart icon across many customers) | Fix at the **source** repo, then sweep all customers and resolve each once the fix ships — see "Sweeping for every occurrence". |
| Real, but the fix is out of scope / not yours to make now | **File a tracking issue** for the owning team (e.g. in `giantswarm/giantswarm`, labelled with the team + `ui/backstage`), then resolve or ignore the Sentry issue with a `reason` that links it. |
| Noise — not actionable (bot/scanner traffic, expected third-party errors) | **Ignore** it (below), and fix the *source* of the noise where possible so it stops recurring. |

### Ignoring (muting) an issue

```
update_issue(organizationSlug='giantswarm', issueId='<SHORT-ID>', status='ignored', reason='<why>')
```

Always pass a `reason` — it posts to the activity feed. Pick `ignoreMode`:

- `untilEscalating` (default) — re-surfaces if frequency spikes. Best for "probably noise, but warn me if it gets worse".
- `forever` — permanent; for confirmed, never-actionable noise.
- `forDuration` (`ignoreDurationMinutes`) — snooze for a while.
- `untilOccurrenceCount` (`ignoreCount` [+ `ignoreWindowMinutes`]) / `untilUserCount` (`ignoreUserCount` [+ `ignoreUserWindowMinutes`]) — re-surface past a threshold.

Ignoring is **per-issue, per-project**. A recurring noise *pattern* (e.g. each newly probed URL becomes its own issue) keeps spawning fresh issues, so muting alone is whack-a-mole — prefer a source-side fix, and mute only the already-accumulated ones.

### Worked example — bot-probe "Untracked page view" noise

- **Symptom:** `-frontend` projects collect issues titled `Untracked page view: /<path>` (`/wp-login.php`, `/phpmyadmin`, `/typo3/`, …) — 0 users, no stack trace.
- **Cause:** the app is publicly reachable, and untracked page views are forwarded to the error reporter at `packages/app/src/apis/analytics/TelemetryDeckAnalyticsApi.ts` (`notify('Untracked page view: …')`). Internet scanners probing for CMS/admin pages trip it.
- **Disposition — noise.** Source-fix it (stop reporting untracked page views, or add `ignoreErrors: [/^Untracked page view:/]` to `Sentry.init` in `packages/app/src/apis/errorReporter/SentryErrorReporter.ts`) so it stops for every customer, then `ignored`/`forever` the accumulated ones. When the source fix is out of scope, file a tracking issue instead (this one is tracked in `giantswarm/giantswarm#36756`).
- **Contrast — don't mute signal.** A `warning`-level `API Version Warning: Client outdated for <resource>` looks similar in volume but is a *real* signal from `plugins/kubernetes-react/src/hooks/useReportApiVersionIssues.ts` — investigate the resource class's `supportedVersions` instead of ignoring it.

---

## Resolving the issue

- A commit/PR whose message contains **`Fixes <ISSUE-SHORT-ID>`** (the issue's short ID, e.g. `BACKSTAGE-<CUSTOMER>-FRONTEND-<n>`) auto-closes the issue when merged — but only from a repo Sentry is linked to. For source-data fixes made in **another** repo (e.g. a chart icon), resolve the issue manually instead.
- To resolve directly: `update_issue(organizationSlug='giantswarm', issueId='<SHORT-ID>', status='resolved', reason='<what fixed it + the release/PR>')`. Always pass a `reason` — it's posted to the issue's activity feed.
- **Cross-customer duplicates:** once the source fix has shipped (e.g. the app release exists — verify the tag, don't assume), resolve each customer's issue for that root cause. They'd clear on their own as catalogs re-import, but resolving with a `reason` documents it. If a release is only *triggered*, not yet published, wait or note that in the reason.

## Reference

- **Org slug:** `giantswarm`. **Projects:** one `backstage-<customer>-frontend` + `-backend` pair per deployment — list them with `find_projects` (see "Deployments & projects"). The tool returns up to 25 results; if the count is exactly 25, re-run with a more specific query to check for truncation.
- **CSP base config:** `app-config.yaml` → `backend.csp` (Helmet format). Enforced policy may be broader (deploy-time overrides).
- **Frontend Sentry init:** `packages/app/src/apis/errorReporter/SentryErrorReporter.ts`.
- **App repos / chart icons:** `github.com/giantswarm/<name>-app`, icon in `helm/<chart>/Chart.yaml` `icon:`, hosted on `s.giantswarm.io/app-icons/...`.
