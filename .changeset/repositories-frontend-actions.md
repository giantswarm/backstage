---
'@giantswarm/backstage-plugin-repositories': minor
---

The write side of the Repositories page. Every action is one tool call of
giantswarm-repo-manager as the signed-in person and lands as a team-file pull
request under their name; the page shows what the manager returns and composes
nothing.

- **Create repository** (`/repositories/create`, the plugin's `create` route):
  the declaration form (team, name, component type, language, flavours,
  description, visibility, reason), _Review_ — the dry run as
  `validate_repository` renders it: the entry with the schema's defaults, the
  implied template and its options, the GitHub name check, the refusals per
  field and the guard notices (`team-review`, `batch-review`,
  `names-unchecked`) — and _Create_ (`create_repository`, `mode: commit`): the
  pull request link, then the new repository's set-up steps live once the
  reconciler has it.
- **Row actions** on the expanded record: _Configure_ (the whole entry as it
  should read, `update_repository`), _Transfer_ (the receiving team; who gives,
  who takes, who approves), _Deprecate_ and _Archive_ (`set_lifecycle`, with
  what each does and the review asked in the team's channel), _Reconcile now_
  (`reconcile_repository`, a workflow dispatch as the person), _Refresh_ and
  _Keep_ (`decide_repository`). Each dialog reviews the manager's plan — the
  entry before and after, the planned pull request and its author, the ask
  and notice — before the commit, and shows the pull request it opened.
- A write the manager refuses (`mode: apply`, a taken name, a refused
  declaration) shows the manager's reason verbatim; no override is offered.
- Bind `catalog.createComponent` to `repositories.create` in
  `app.routes.bindings` so the catalog's _Create…_ lands on the form; no
  scaffolder template is registered.
