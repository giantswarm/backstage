---
'@giantswarm/backstage-plugin-muster': minor
---

Read-only Workflows area for the agent-platform shell (iteration 1, W5/D11).

**Customize → Workflows list** now shows what the data actually backs: name and
description, category (the `klaus-lab.giantswarm.io/category` label), step
count, an honest **"Only reads / Can change things"** badge (the `readOnlyHint`
muster derives transitively on each `workflow_<name>` tool, read off the
per-session tool catalogue — never the CR), run count with the latest run, and
the source (GitOps vs manually added). Search covers names, descriptions and
categories.

**New shell `WorkflowPage`** replaces the classic workflow detail inside the
agent-platform shell (the classic page is unchanged outside it), with
progressive disclosure:

- Plain level: description header with the honest effect badge and validation
  warning; inputs (type, required, default, description); the steps as a
  readable sequence — per-step description, the plain connector + tool name,
  "Only if …" for conditions (a gate, never a branch), forEach/parallel groups
  as indented blocks, and an "If it fails" lane for `onFailure`; recent runs
  (when, outcome, duration, and "Failed at step N" in the lazily fetched
  per-step trace) with the ~3-week retention noted; the stats strip
  (`/workflows/:name/stats`); and "agents use it as `workflow_<name>`" with the
  workflows that call it.
- "Show technical details" toggle: exact aggregated tool names, templated
  arguments, condition specs, step ids, store/output flags, full execution JSON
  per run, and the raw definition YAML (`GET /workflows/:name`, which now takes
  the installation).

**Read-only per decision D11**: the shell pages offer no create, edit, delete
or run affordances — changes happen through Git or agents via muster. Versions,
scheduling, per-run cost and who-ran-it are confirmed absent in muster (G11)
and are deliberately not drawn.
