# @giantswarm/backstage-plugin-repositories

Frontend plugin (`pluginId: repositories`) that renders the Repositories page:
the org's repository inventory from
[giantswarm-repo-manager](https://github.com/giantswarm/giantswarm-repo-manager),
read as the signed-in person. It answers "what do my team's repositories look
like", "who owns X" and "what is set up, and what is not" over the manager's
two read tools, with no composition of its own -- what the page shows for a
repository is what `devctl repo status` prints for it, from the same record.

## Features

- **Scopes**: _My team_ (default; _Unassigned_ for a Planeteer), _Unassigned_,
  _All repositories_ -- `list_repositories`' `scope`, kept in the URL.
- **Archived hidden by default**: the listing asks for `archived=false` until
  the person switches _Show archived_ on (`archived=true` in the URL) or asks
  for the archived lifecycle.
- **Filters**, in the column the Clusters page uses: search, team (the teams of
  the scope's whole inventory, plus _No team_ under _All_; not offered under
  _Unassigned_), lifecycle (any / active / deprecated / archived), Renovate
  state, visibility, fork, finding kind (again from the whole inventory),
  inactivity in days -- the tool's arguments, each a URL parameter, sent as
  typed (`fork` a boolean, `inactiveDays` a number).
- **Table** (`Table` of `@backstage/core-components`): repository, team,
  lifecycle, set-up state, findings, last person commit, record age; sortable
  by every column, by repository to begin with; the one-line summary above it
  (shown / matched / total, last sweep).
- **Row detail**: the full inventory record -- a header with the repository
  (linked), its set-up state and the actions; the facts grouped as Ownership
  (team, declaration, component type, flavours, CODEOWNERS, team mapping,
  catalog), Activity (commits, pull requests, issues, latest release, last
  reconciler run) and Tooling (Renovate, CircleCI, language, visibility,
  default branch); the findings with their fix; the set-up steps with a status
  per verdict and the CLI's detail text, re-read every 15 s while they
  converge; and **Refresh** (`refresh_repository`).
- **Create repository** (`/repositories/create`): the declaration form (team,
  name, component type, language, flavours, description, visibility, reason);
  _Review_ shows the dry run as `validate_repository` renders it -- the entry
  with the schema's defaults, the implied template and its options, the GitHub
  name check, the refusals per field, the guard notices (`team-review`,
  `batch-review`, `names-unchecked`) and whether the machine approves; _Create_
  runs `create_repository` in `mode: commit`, shows the pull request opened as
  the person and follows the new repository's set-up steps live once the
  reconciler has it.
- **Row actions** on the expanded record, each one tool call as the person
  with the manager's plan reviewed first: _Configure_ (`update_repository`,
  the whole entry as it should read), _Transfer_ (`transfer_repository`, the
  receiving team approves, the giving team is told), _Deprecate_ and
  _Archive_ (`set_lifecycle`, the team's review asked in its channel),
  _Reconcile now_ (`reconcile_repository`, a workflow dispatch as the person).
- A write the manager refuses shows the manager's reason verbatim; the page
  offers no override -- `commit` is the only mode and the manager owns it.

## Development

`yarn start` in this package serves the page over the fixture records
(`src/fixtures/records.ts`, filtered in memory by `src/fixtures/inMemoryApi.ts`
the way the manager filters) at http://localhost:3000 -- no backend, no
manager, no sign-in.

## Backend

Data comes from `@giantswarm/backstage-plugin-repositories-backend`, a gateway
that reaches the manager through muster. Every request carries the user's
main login (Dex) ID token; muster forwards it to the manager, which obtains
the person's GitHub grant from muster's token broker. A person without a grant
is sent through muster's connect once and lands back on the page.

## Gating

All extensions are disabled by default so customer portals never expose the
page. Enable it per deployment via app-config (the deployment also needs the
manager registered in one of its muster installations):

```yaml
app:
  extensions:
    - page:repositories
    - api:repositories
  routes:
    bindings:
      # The catalog's Create… lands on Create repository; no scaffolder
      # template is registered for repositories.
      catalog.createComponent: repositories.create
repositories:
  muster:
    installation: gazelle
    server: giantswarm-repo-manager
```
