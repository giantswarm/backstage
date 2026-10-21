---
name: urls
description: Rules for the agent shell's URLs — the URL tree that follows the rail, identity in the path, the create and edit shapes, routed tabs, reserved words, links through route refs, and what moving a URL or adding a page takes (redirect, telemetry, e2e, docs). Use when adding, moving, renaming or linking to a page, tab, wizard step or route in the agent-platform shell, and when reviewing a change that does.
---

# Agent shell URLs

Load this skill before you add, move or rename a page, a tab, a wizard step or
any route of the agent shell, or write a link to one. Reviewers of a change
that adds or moves a route check it against the
[review checklist](#review-checklist) at the end.

Scope today: the agent shell — `plugins/agent-platform`, `plugins/muster`
and the shell's pages in `packages/app/src/modules/agentShell`. The rules are
the decisions of giantswarm/giantswarm#38510 ("Decisions and plan"); each
later decision adds one here. Nothing in this skill is a preference: if a
change needs something the rules do not settle, it needs a decision first.

## The tree

```
/                                                       new session
/sessions[/<inst>/<id>]
/usage[/cost|/your-sessions|/connectors]                bare = Overview
/profile
/customize/agents[/new[/skills|/tools|/review]]
/customize/agents/<inst>/<ns>/<name>[/sessions|/tools|/usage]
/customize/agents/<inst>/<ns>/<name>/edit[/skills|/tools|/review]
/customize/skills[/new]
/customize/skills/<owner>/<repo>[/<dir…>][/instructions|/used-by]   (+ the -/<host>/… form)
/customize/skills/edit/<owner>/<repo>[/<dir…>]
/customize/connectors[/infrastructure|/internal]
/customize/connectors/new[/auth|/verify]
/customize/connectors/<inst>/<server>[/resources|/prompts|/usage|/used-by|/instances|/details]
/customize/connectors/<inst>/<server>/tools/<tool>
/customize/connectors/<inst>/<server>/edit[/auth|/verify]
/customize/models[/new]
/customize/models/<inst>/<ns>/<name>[/usage|/used-by]
/customize/models/<inst>/<ns>/<name>/edit
/customize/models/hosting[/serve|/import|/pull|/add-backend]        bare = Running models
/customize/models/hosting/capacity[/add-pool]
/customize/models/hosting/cache
/customize/workflows/<inst>/<name>[/run|/usage|/details]
/customize/workspaces[/new]
/customize/workspaces/<inst>/<org>/<name>
/customize/workspaces/<inst>/<org>/<name>/edit
/agent-platform/**  →  one-hop redirects until the end of 2026
```

How it is mounted:

- `/customize` is the app's page (`page:app/agent-shell-customize`,
  `packages/app/src/modules/agentShell/customizePageExtension.tsx`). It routes
  each tab's bare path to its own list screen and everything deeper to the
  router of the plugin that attached the tab: agent-platform's `agents`,
  `skills` and `models`, muster's `connectors` (`mcp-servers` in code) and
  `workflows`, each a `SubPageBlueprint` with
  `attachTo: { id: 'page:app/agent-shell-customize', input: 'pages' }`.
- `/sessions`, `/usage` and `/profile` are agent-platform's own
  `PageBlueprint`s.
- `/agent-platform` (`page:agent-platform`) and `/agents` are the app's
  catch-alls (`legacyPagesModule.tsx`), which call
  `legacyAgentPlatformTarget` (`legacyPaths.ts`).

Every page is enabled by default and gated by `AGENT_SHELL_ON`. Deployments
replace `app.extensions` wholesale, so an opt-in extension silently drops out
there; attach in code, never through config.

## Rules

### 1. The URL tree follows the rail

The only roots are `/`, `/sessions`, `/usage`, `/profile` and `/customize`.
A new root needs a decision, a check that no classic route uses it, and an
entry in `AGENT_AREA_PREFIXES` (`agentArea.ts`), which decides where the
shell renders. The rail lights an item on its own path and every path below
it, so a page under the right root needs no rail configuration.

### 2. A resource's pages sit under its list

`/customize/<section>/<id>/…`: the detail page, its tabs, its edit and its
sub-pages hang under the list they are found in, so the breadcrumb, the
rail's current item and the address agree.

### 3. Identity lives in the path, never the query

The shapes:

| Resource | Path |
|---|---|
| agents, models | `<inst>/<ns>/<name>` |
| connectors, tools, workflows (muster resources) | `<inst>/<name>` |
| sessions | `<inst>/<id>` |
| skills | the `<owner>/<repo>[/<dir…>]` splat, or `-/<host>/<repo path>[/-/<dir…>]` |

`?installation=` only sets a section's scope — a list, Usage, Model hosting —
never which resource a page shows. A page reads its installation from its
route params; muster's routers pin their providers to it
(`MusterSubPage installation=…`), so the page shows that installation's
resource whatever the scope, and says so when it cannot read it — never a
same-named resource from another installation.

### 4. Create is `<section>/new[/<step>]`; edit is `<id>/edit[/<step>]`

Agents, models and connectors edit at a trailing `edit`. Skills are the
exception: `/customize/skills/edit/<owner>/<repo>…`, because a directory in
the splat could be named `edit`. No create or edit through a query parameter
(the old `new?edit=<name>`).

### 5. Every tab is a routed segment; the default tab is the bare path

Tabs, sub-tabs and wizard steps are path segments, with the default as the
parent's own path (`/usage` is Overview, `/customize/models/hosting` is
Running models, a connector's bare path is Tools). An unknown or unavailable
tab redirects to the nearest valid parent: an unknown wizard step to the
wizard's first, an unknown tab to the page, an address that names nothing
(`/customize/agents/<inst>`) to the list. Every router in the tree ends in a
catch-all that does this.

### 6. Reserved words

`new` (under agents, connectors and models), `edit`, `hosting` (under
models), and the Connectors sub-tab names (`infrastructure`, `internal`, and
the retired `families`). A new static segment is checked against them and
against the dynamic segment it sits beside: at the same depth a static
segment outranks an installation name, so it makes that name unusable.
The connector sub-tabs stay apart from connector pages by depth (one segment
against two).

### 7. Links through route refs, never string literals

- A link resolves through a route ref, an external route ref the app binds
  in `packages/app/src/App.tsx`, or a helper built on one. Helpers:
  `useCustomizePaths`, `useSkillPaths`, `useNewSessionHref`
  (agent-platform); `useServerPageLinks`, `useWorkflowPageLinks`,
  `useConnectorGroupPaths`, `useConnectorWizardLinks` (muster).
- Every route ref is exported in its plugin's `routes`, so the app and the
  other plugin can bind and link to it.
- Splat paths (skills) are built through one helper (`useSkillPaths` on
  `skillDetailPath`), never by concatenation at the call site.
- The ESLint rule `giantswarm/no-restricted-syntax` fails CI on a literal
  that starts with a shell root in `plugins/*/src` and
  `packages/app/src/modules`. A route definition, `AGENT_AREA_PREFIXES` and
  the redirect mapping carry a disable comment with the reason; nothing else
  does.

### 8. Moving or renaming a URL

- A one-hop redirect through the central mapping (`legacyAgentPlatformTarget`
  in `packages/app/src/modules/agentShell/legacyPaths.ts`, with a row in its
  table-driven test) with a removal date. Never a redirect that lands on
  another redirect.
- The same telemetry page and view names: the new path's case in
  `getTelemetryPageViewPayload` (`packages/app/src/utils/telemetry.ts`)
  reports what the old one did, and the old path reports as a redirect.
- Updated `e2e/agentlab` specs and `docs/`.

### 9. A new page needs

- an exported route ref;
- a telemetry case, and an entry in `knownTopLevelPaths`
  (`packages/app/src/utils/telemetry.test.ts`);
- the area prefix, if it is a new root (rule 1);
- an `e2e/agentlab` test.

## Review checklist

A reviewer of a change that adds or moves a route checks:

1. The path sits in the tree above: under its rail root, under its list,
   identity in the path, the create/edit shapes, the default tab bare.
2. Its router ends in a catch-all to the nearest valid parent.
3. No new segment collides with a reserved word or a dynamic sibling.
4. Every link goes through a route ref or a helper; no shell path literal
   outside a route definition.
5. The route ref is exported.
6. A moved address redirects in one hop through the mapping, with a test
   row, and keeps its telemetry names.
7. A new page has its telemetry case and `knownTopLevelPaths` entry, and an
   agentlab test; `e2e/agentlab` and `docs/` follow a move.
