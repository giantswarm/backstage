# @giantswarm/backstage-plugin-repositories

## 0.1.0

### Minor Changes

- 34d161d: An undeclared repository's row -- on GitHub, in no team file, the _Unassigned_
  scope -- offers **Adopt**, **Deprecate**, **Archive** and **Align now** in
  place of four disabled buttons, and a line says no team file declares it.
  Adopt opens the Create form on what GitHub knows of the repository -- the
  team a choice, the person's own first, the name the repository's, the
  description and visibility as they are, the language it is written in, the
  generic nature with the CircleCI generator off, the opt-in to alignment as
  the checkbox, the reason -- and runs the manager's `adopt_repository` through
  the dry run and the commit like the other row actions: the entry is added to
  the team's file in a pull request the team reviews. Deprecate and Archive on
  an undeclared row make the same call with the lifecycle in the entry: the one
  pull request declares the repository and ends its life; the team and the
  reason are all there is to fill in, the manager adds the opt-in the lifecycle
  needs. The backend routes `POST /repositories/:name/adopt` to
  `adopt_repository`. Needs giantswarm-repo-manager 0.24.0 or later.
- a7a9a6e: _Align now_ is one dialog. A declared repository has nothing to fill in, so
  the manager's dry run starts as the dialog opens -- no Review step -- and
  the dialog says in one sentence what the commit does (aligned now; the
  opt-in pull request opened, whose merge aligns; a check), links the
  intranet's repository set-up page for the rest, and lists the changes the
  last check planned with when it checked. The manager's paragraph-long
  warning, the opt-in plan (entry before and after, pull request, ask) and the
  dispatch preview are no longer repeated in the dialog. An undeclared
  repository asks for the team and _Check now_ dispatches the check directly.
  `ActionDialog` runs its dry run on open when it has no form fields.

  A row action's result stays on screen: the record and the listing are
  re-read when its dialog closes, not the moment the write lands -- the
  re-read listing re-mounted the detail panel and took the dialog with its
  _Pull request opened_ or _Dispatched_ view away.

- bfa597e: _Align now_ on a repository that has not opted in to alignment opts it in
  and aligns it. The dialog renders the manager's three modes: opted in
  (`align: true` in its team-file entry), the set-up workflow is dispatched
  and the button reads _Align now_; declared but not opted in, the dry run
  shows the entry as it will read, the pull request and the ask the team's
  channel receives, the button reads _Opt in and align_, the commit opens that
  pull request as the person and the reconciler aligns the repository when it
  merges -- nothing is dispatched; without an entry, the run checks from the
  team alone and the button reads _Check now_. The opt-in line names the
  repository, not its team. `Alignment.mode` gains `'opt-in'` and
  `Alignment.optIn` carries the manager's plan and, after the commit, the pull
  request and the delivered ask.
- f46a45f: The Repositories page's _Reconcile now_ becomes _Align now_, and its dialog
  says what the run does before the person confirms it.

  - The row action, the dialog title and the confirm label read _Align now_;
    the backend maps `POST /repositories/:name/align` to the manager's
    `align_repository` tool (`RepositoriesApi.alignRepository`; the
    `reconcile` route and `reconcileRepository` are gone).
  - The dialog states plainly that the run changes the repository on GitHub and
    CircleCI to its declared set-up and the company baseline, as the signed-in
    person.
  - The dry run renders the manager's answer: its warning, the opt-in line --
    the owning team has opted in and the changes below are applied, or it has
    not and the run checks and changes nothing -- and the changes the last
    check planned, per step, with when they were checked ("no check yet" and
    "nothing to change" named as such), then the workflow dispatch as before.
    Without the team's opt-in the confirm label reads _Check now_.

- ea1324f: Create repository is a form of choices with its review beside it. The team is
  picked, not typed: the person's own teams first (the form opens on the first),
  then every team the inventory knows. A **Kind** -- Go service, chart-only app,
  Go CLI, Go library, configuration, customer project, other; the shapes the
  org's team files declare -- fills component type, language and flavours, and
  turns _Generate CircleCI config_ on where the kind has a job; the three stay
  editable as choices of the schema's values and re-derive the switch when
  changed by hand. Visibility is a choice (private, the org's default, is left out
  of the entry as the team files do). The name is held to the engine's rule as
  typed -- lowercase; a chart repository's name without the `-app` suffix -- and
  the manager's verdict on it (free on GitHub, taken) shows under the field.

  The review no longer waits for a button: the dry run runs on its own once the
  person pauses and is kept current with every change -- the entry with the
  schema's defaults, the template, the name check, the refusals with their
  one-click fix, the guard notices and the creation as the person would run it.
  **Create** is enabled once the dry run for the form as it stands is accepted.
  The page opens as a Go service for the person's team.

- b6a5641: Create repository says what it does in the order the manager writes as the
  person -- the repository, one scaffold commit on its default branch (the first
  release follows from that push), then the declaration as a pull request under
  the person's name -- and its result names the three in that order, with the
  repository and the scaffold commit linked. The dry run shows the creation as
  the manager plans it (create, scaffold, then the pull request), or the
  manager's refusal of the creation. The wait text after Create no longer says
  the reconciler creates the repository: it sets a repository that exists up.

  The form gains **Generate CircleCI config** (`gen.ci.generate`, on by
  default), written out true or false the way `devctl repo create` writes it.
  A configuration repository -- `language: generic`, no `app` flavour, nothing
  to build -- can now be created from the page: the manager's refusal
  (`gen.ci.generate: no CircleCI job … set it to false`) is rendered with its
  fix as a button that turns the switch off and runs the dry run again. A Go
  service and a chart-only app keep `gen.ci.generate: true`.

- f6f1d50: Create repository asks one question -- _What are you creating?_ -- as a
  compact grid of presets, and shows the declaration as that preset's result:
  one line (`service · go · app · CircleCI config generated`) with **Adjust**
  opening the raw controls for a shape no preset fits; the controls open by
  themselves when the manager refuses one of the fields. Component type is
  labelled as the catalog type it is. Flavours are a nature -- one of app,
  generic, cli, customer, fleet -- and add-ons (cluster-app, only with app;
  k8sapi), each saying what devctl generates for it; cli is held to Go as
  devctl's Makefile generator holds it, and helmchart, which devctl's
  generators refuse, is no longer offered.
- 6ead0ab: The Repositories page gains **Delete**: a red button apart from the other row
  actions of the expanded record. Its dialog says what the reconciler does
  (the repository's CircleCI project unfollowed, the repository deleted on GitHub
  with its code, issues, pull requests, releases and packages; the entry kept in
  the team file as the record; restorable by an organization owner for 90 days),
  asks the person to type the repository's name and takes a reason, then runs
  `set_lifecycle` with `lifecycle: deleted` and the typed name as `confirm` --
  the manager refuses a deletion without it -- through the dry run and the
  commit like Archive: the pull request is opened as the person and a member of
  the owning team other than the author approves. `deleted` joins the lifecycle
  filter; the backend passes `confirm` through.
- bb9134b: The row action _Configure_ is _Edit_, and its dialog is the Create form
  rather than a YAML box: the entry opens as Create repository shows a
  declaration -- description and visibility, the preset it matches with the
  declaration line and _Adjust_ for the raw controls, the opt-in to alignment
  (`align`) and the reason -- with the team and the name fixed (Transfer moves a
  repository; a rename is followed by the reconciler). `update_repository` still
  takes the entry whole: the form's fields are replaced, and every field the
  form does not carry (lifecycle, system, choreReviewers, the knobs under
  `gen.ci`, …) stays as it was and is named on the form. The Create form's
  declaration line names an unset language or flavours instead of leaving a
  gap, and its raw controls open by themselves when the generator's rule is
  broken.
- 3c8bcd0: Create repository follows the new repository to readiness on the page. After
  `create_repository` answers, the page calls the manager's `watch_repository`
  with the pull request it opened (one call blocks 20 s at most, called again
  while the repository is neither ready nor failed) and renders the phases as
  they complete -- created, scaffolded, declared, merged, set up, released --
  with their time since the creation, the manager's reason while a phase waits
  (the release's CircleCI statuses reported and what is awaited, the settle
  window), and a failure with the manager's reason (a red first release names
  the job). The repository is linked and marked ready only when every phase is
  done; until then it is the name with the phase list. The reconciler run's
  findings show once it has reported, and the record's set-up steps beneath.

  The same phase list follows an _Align now_ dispatch through the record: its
  pending run, then the run's report with the verdict and the run linked, or
  the inventory's `reconcile-run-missing` finding when the run never reported.
  The expanded row names a pending reconciler run and the change a run
  followed.

  Backend: `POST /repositories/:name/watch` (`pullRequest`, `timeout`) runs
  `watch_repository` as the person.

- 7a5904a: The write side of the Repositories page. Every action is one tool call of
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

- b863d7c: Add the repositories frontend plugin: a `/repositories` page behind a
  _Repositories_ sidebar entry that shows the org's repository inventory from
  giantswarm-repo-manager, read as the signed-in person.

  - Scopes _My team_ (the default; _Unassigned_ for a Planeteer), _Unassigned_
    and _All repositories_, kept in the URL.
  - Tiles counting the listed repositories per set-up state, orphan score band
    and lifecycle.
  - The manager's filters (search, Renovate state, team including no team,
    visibility, fork, lifecycle, inactivity, minimum orphan score, decision,
    finding), each a URL parameter passed to `list_repositories` unchanged.
  - A table sortable by every column; a row expands to the full inventory record
    with its findings and fix text, the links (repository, catalog entity, last
    reconciler run, latest release), the set-up steps laid out as `devctl repo
status` prints them and re-read every 15 s while they converge, and the
    record's age with _Refresh_.
  - A person without a grant for the manager is sent through muster's connect
    once and lands back on the page.
  - The page and API extensions are disabled by default and must be enabled via
    `app.extensions` (`page:repositories`, `api:repositories`), so customer
    portals are unaffected.

- bfe6914: The Repositories page's header links the intranet page on repository set-up
  (_Repository set-up docs_, in a new tab), beside **Create repository**. The
  _Align now_ dialog links the same page from the same constant.
- beda76b: The Repositories page rebuilt for use, from the portal's own building blocks.

  - The summary tiles (set-up state, orphan score, lifecycle) are gone, and so
    is the orphan score everywhere: no column, no filter, no facts. The table
    lists by repository name.
  - No decision tracking: _Keep_ and its dialog are gone; ownership moves or a
    repository is archived right away through _Transfer_, _Deprecate_ and
    _Archive_.
  - Archived repositories are hidden by default (the listing asks for
    `archived=false`); _Show archived_ lists them, and the URL keeps the choice.
    The lifecycle filter offers any / active / deprecated / archived.
  - Every filter works: the Team and Finding options come from the scope's
    whole inventory rather than the rows a filter already narrowed, so no team
    vanishes from the list; the team goes to the manager under every scope
    where it applies and is not offered under _Unassigned_; _Fork_ sends a
    boolean, _Inactive for (days)_ a number; the search waits for the person to
    pause.
  - The page uses what the other pages use: the Clusters page's filter column
    (`FiltersLayout`, `SingleSelect`, `Autocomplete`), the `Table` of
    `@backstage/core-components` with its detail panel and sorting, `StatusLabel`
    for the set-up state and the step verdicts, `InfoCard` and `FactList` for the
    record.
  - The expanded row is redesigned: a header with the repository link, its
    set-up state and the actions; the facts grouped as Ownership, Activity and
    Tooling with empty ones left out; the findings as a readable list with their
    fix; the set-up steps as a compact table whose verdict is a status icon and
    word with the detail text wrapped.
  - `yarn start` in the plugin serves the page over the fixture records for
    development, without a backend.

- d3378b3: Create repository offers a **Team plans** preset: componentType
  `unspecified`, language `generic`, the `generic` nature with the new `plans`
  add-on -- a team plans repository (PRDs, their companion websites and the
  plan-workflow agent skills, from `giantswarm/template-plans`), CircleCI config
  generation off since the shape has no job. The `plans` add-on needs the
  `generic` nature, same as the other add-ons need theirs, and is dropped when
  the nature changes to one it does not go with.
- 92d42d6: The Repositories plugin's declaration form -- Create repository, Edit and
  Adopt -- offers the values giantswarm-repo-manager reports in `get_info`'s
  `schema` instead of lists of its own.

  - The catalog type and language selects, the nature radios, the add-on
    checkboxes and the visibility radios are bound to the reported
    `componentTypes`, `languages`, `flavours` and `visibilities`. The plugin
    keeps only the presentation keyed by value: labels, descriptions, the
    nature and add-on grouping. A reported value without one is offered under
    its own id; a value the manager stops reporting is no longer offered. The
    `fork` flavour is not offered: a new repository is not a fork line, and an
    existing entry that declares it keeps it.
  - A preset whose catalog type, language or flavours the manager does not
    report is not offered.
  - While `get_info` is asked, the form says so; when the manager could not
    read the schema, or predates it, the form shows its reason, and Create
    and the Edit and Adopt dialogs' dry run and pull request stay disabled.
    There is no built-in fallback.
  - The in-memory fixture API reports a `schema`, and its validator judges
    entries against it.

- a8bb5a6: The Repositories table's Set-up column shows one icon per row instead of
  the state as text, the same marks the Installations page's capability
  columns use: a green check where the engine's check found the repository
  set up as declared (in sync), an orange sync-problem where it found it off
  its declared set-up (not in sync), a blue sync where it is declared but not
  reconciled yet (no check has run through it, or an Align now waits for its
  run), an empty circle where no declaration sets it up (not installed), a
  red error where the engine refused the declaration or the check could not
  run (failed), and a question mark where GitHub no longer has it (unknown).
  The state in the manager's words is the icon's tooltip and accessible name,
  the header's tooltip is the legend; sorting by set-up puts the repositories
  wanting a look first. The expanded record keeps the state as text.
- bddd1c9: The row action _Transfer_ asks for the receiving team as a choice instead of
  a typed GitHub slug: the same teams _Create repository_ offers -- the
  person's own first, labelled so, then every team the inventory knows a
  declaration of -- less the giving team, which cannot take what it gives. The
  teams are read the way the Create form reads them (`get_info`, the `mine`
  listing and the whole inventory, shared in one hook and answered from the
  Repositories page's cache); the receiving team's member still approves, and
  the giving team is told.

### Patch Changes

- 3199a67: A write's plan and its outcome name the ask's and notice's Slack channel as
  the team's channel file does -- "Approval asked to #team-bumblebee
  (team-bumblebee)", "The ask posted to #team-bumblebee (team-bumblebee)" --
  from the manager's `channelName`, instead of the channel ID the manager
  delivers to. Without a name the ID shows, as before. Needs
  giantswarm-repo-manager 0.32.0 or later for the name.
- 93210e4: Create repository opens on the person's team where the identity carries no
  team groups -- the Dev Portal behind the GitHub App: the caller's teams are now
  read off the manager's `mine` listing (membership as the manager reads it on
  GitHub as the person), the identity's groups staying a second source. Before,
  the Team choice listed every team of the inventory but preselected none and
  marked none as _your team_ on the Dev Portal.
- 296a1e0: The planned pull request in a dry run -- where and as whom, then the title,
  branch and files -- reads as two lines again. `Text` renders inline, so the
  two ran together ("as teemowfeat(repositories): …") in the Create form's
  creation plan and in the row actions' plan.
- 1ec7387: The Repositories page reads a repository's set-up state from one place for
  the row's icon and the expanded record's header, so the two never disagree:
  the header prints the icon's words (`run pending · not reconciled yet`,
  `refused · the last check failed`, `converged · set up as declared`, …) in
  the colour of the icon's mark, with the detail on hover -- the steps not ok,
  the dispatch a pending run waits on, the schema's problems with a refused
  entry. A declaration the engine refused reads `refused` whatever the
  engine's result says of convergence, beside the Declaration refused alert
  instead of `converged` next to it. The expanded record is re-read every
  15 s while a run is pending, not only while its set-up has not converged.
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [c5b9c46]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [5c82125]
- Updated dependencies [4f6d765]
- Updated dependencies [94a61cb]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
- Updated dependencies [1893681]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [322e58c]
- Updated dependencies [b990251]
- Updated dependencies [9e57736]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
  - @giantswarm/backstage-plugin-ui-react@0.9.0
