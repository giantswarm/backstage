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
  state, visibility, fork, the CI facts (arm64 images, China push, signing,
  and an orb version or its prefix), finding kind (again from the whole
  inventory), inactivity in days -- the tool's arguments, each a URL
  parameter, sent as typed (`fork` and `arm64` booleans, `inactiveDays` a
  number).
- **Table** (`Table` of `@backstage/core-components`): repository, team,
  lifecycle, set-up state, findings, last person commit, record age; sortable
  by every column, by repository to begin with; the one-line summary above it
  (shown / matched / total, last sweep).
- **Row detail**: the full inventory record -- a header with the repository
  (linked), its set-up state and the actions; the facts grouped as Ownership
  (team, declaration, component type, flavours, CODEOWNERS, team mapping,
  catalog), Activity (commits, pull requests, issues, latest release, last
  reconciler run) and Tooling (Renovate; the CI facts in the record's words --
  whether CircleCI builds the default branch and built the latest release,
  the architect orb version, arm64 images, China push, signing -- a dash
  where the repository has no CircleCI configuration to say; language,
  visibility, default branch); the findings with their fix; the set-up steps with a status
  per verdict and the CLI's detail text, re-read every 15 s while they
  converge; and **Refresh** (`refresh_repository`).
- **Create repository** (`/repositories/create`): the declaration as a form
  beside its review. The team is a choice -- the person's own teams first (the
  teams of `list_repositories` in scope `mine`, membership as the manager reads
  it on GitHub as the person, plus the team slugs of `get_info`'s groups where
  the identity carries them; the form opens on the first), then every team the
  inventory knows -- the name is held to the engine's rule as typed (lowercase;
  the chart's name without `-app` where a chart exists), description and
  visibility (private, the org's default, is left out of the entry as the team
  files do). One question, **What are you creating?** -- a preset: Go service,
  chart-only app, Go CLI, Go library, configuration, customer project, other,
  the shapes the team files declare -- fills the **Declaration**: catalog type
  (`componentType`), language, flavours, and _Generate CircleCI config_
  (`gen.ci.generate`, written out true or false as `devctl repo create` writes
  it) on where the preset has a job. The declaration shows as one line
  (`service · go · app · CircleCI config generated`) with the preset it came
  from; **Adjust** opens the raw controls for a shape no preset fits -- the
  schema's values as choices: the flavours as a _nature_ (one of app, generic,
  cli, customer, fleet) and _add-ons_ (cluster-app, only with app; k8sapi),
  each saying what devctl generates for it, cli held to Go as devctl's
  Makefile generator holds it (`helmchart`, which devctl's generators refuse,
  is not offered) -- and the controls open by themselves when the dry run
  refuses one of the fields; a change by hand re-derives the CircleCI switch
  and reads as matching no preset. The review runs `validate_repository` on
  its own once the person pauses and
  keeps it current: the entry with the schema's defaults, the implied template
  and its options, the GitHub name check (also under the name field), the
  refusals per field (a refusal that names a value the form can set, such as
  `gen.ci.generate … set it to false`, is one click that applies it), the
  guard notices (`team-review`, `batch-review`, `names-unchecked`), whether the
  machine approves, and the creation as the person would run it (create,
  scaffold, then the pull request). _Create_ is enabled once the dry run for
  the form as it stands is accepted; it runs `create_repository` in `mode:
commit` -- the repository and one scaffold commit as the person, then the
  team-file pull request under their name -- names the three in that order and
  follows the new repository's set-up steps live once the reconciler has it.
- **Row actions** on the expanded record, each one tool call as the person
  with the manager's plan reviewed first: _Configure_ (`update_repository`,
  the whole entry as it should read), _Transfer_ (`transfer_repository`, the
  receiving team approves, the giving team is told), _Deprecate_ and
  _Archive_ (`set_lifecycle`, the team's review asked in its channel),
  _Align now_ (`align_repository`, the set-up workflow dispatched as the
  person: the dialog says that the run changes the repository on GitHub and
  CircleCI to its declared set-up and the company baseline, and its dry run
  shows the manager's warning, the changes the last check planned per step
  and whether the owning team has opted in -- opted in, the changes are
  applied and the button reads _Align now_; not opted in, the run only checks
  and the button reads _Check now_).
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
    installation: <installation> # a name in muster.installations
    server: giantswarm-repo-manager
```
