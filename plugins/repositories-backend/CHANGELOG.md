# @giantswarm/backstage-plugin-repositories-backend

## 0.1.2

### Patch Changes

- Updated dependencies [b623ab3]
- Updated dependencies [06dfa3d]
- Updated dependencies [a05070d]
- Updated dependencies [ae00960]
  - @giantswarm/backstage-plugin-gs-node@0.6.0

## 0.1.1

### Patch Changes

- 10604ae: Report a Muster installation that cannot be reached to Sentry once, as one
  issue per kind of failure instead of one per installation. `MusterMcpClient`
  logs `Muster MCP request failed: <reason>` with the installation in the log
  metadata and throws the new `MusterUnreachableError` (a
  `ServiceUnavailableError`). Every backend router that calls muster answers it
  503 through `musterUnreachableErrorHandler()`, with the body the error
  middleware sends, so the middleware no longer reports the same failure again;
  the plans, roadmap, platform-capabilities and repositories routers no longer
  read its text as one of GitHub's 403, 404 or 429 answers, and the GitHub token
  router logs it at `info`. A lost session that the client re-initializes and
  retries is logged at `info` instead of `warn`, and a warning says so when one
  installation, across all of the backend's muster clients, loses ten sessions
  within ten minutes. The error text the person sees is unchanged, except that
  `list_tools` still being truncated after 20 pages no longer names the
  installation.
- 5bde8bf: Report a Mimir that cannot answer a query to Sentry once, under a fixed title,
  and say on the page when older data is temporarily unavailable.

  `MimirService` logs a Mimir that is down, slow or failing once as a warning
  with a fixed message (`Mimir answered a query with HTTP <status>`,
  `Mimir could not be reached`, or
  `Mimir could not read older data: no healthy store-gateway`), with the
  installation, the status and Mimir's own error text in the metadata, and throws
  the new `MimirUnavailableError`. Its message no longer carries Mimir's body;
  that stays in the warning (`mimirError`, left out of the answer to the
  browser), and a connection error no longer names the query. A query Mimir
  refused (a 4xx other than a refused token: bad PromQL, a range over its limits)
  is an `InputError` (400) with Mimir's text instead, not logged and not retried
  by the frontend. `query({ logFailures: false })` logs at `debug` for a caller
  that handles the failure itself, as the model cost route does. The gs
  backend's `/mimir/query` and `/mimir/query_range` routes answer a
  `MimirUnavailableError` 503 themselves, so the error middleware no longer
  reports it again. A Mimir without a healthy store-gateway answers
  with `error.reason: 'older_data_unavailable'` (`MIMIR_UNAVAILABLE_REASONS` in
  gs-common), and the model cost route answers `older-data-unavailable`.

  gs-node's answer-it-in-the-router pattern is now generic:
  `ReportedServiceUnavailableError` with `reportedErrorHandler()`, which replaces
  `musterUnreachableErrorHandler()` (`MusterUnreachableError` is one), and
  `errorResponseBody()` for a router that answers some other error with the body
  the error middleware would send.

  ui-react adds `MetricsUnavailableAlert` (with a `fallback` for a caller whose
  generic failure is a line of text), `describeMimirFailure` and
  `pickMimirError`, which every place that shows a failed Mimir read now uses: a
  deployment's resource usage and hostnames, a cluster's gateways and node pool
  nodes, the workload status summary, the Usage overview and cost pages, the
  activity heatmap, an agent's and a model's Usage tab, and the cost estimate and
  actual-cost hints.
  `MimirClient` throws a `MimirQueryError` that carries the backend's `reason`.

- Updated dependencies [10604ae]
- Updated dependencies [5bde8bf]
- Updated dependencies [4c53a2b]
  - @giantswarm/backstage-plugin-gs-node@0.5.0

## 0.1.0

### Minor Changes

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

- beda76b: The repositories gateway follows giantswarm-repo-manager's read tools: the
  `archived` filter (a boolean) is handed on to `list_repositories`, and the
  arguments the manager dropped -- `minOrphanScore`, `decision`,
  `stalePeriodDays` (from `get_repository` as well) and `undeclared` -- are no
  longer read. `POST /repositories/:name/decide` (`decide_repository`) is
  removed with the tool.
- b863d7c: Add the repositories backend plugin: a gateway over giantswarm-repo-manager's
  read tools (`list_repositories`, `get_repository`, `refresh_repository`,
  `get_info`) for the Repositories page, reached through muster as the
  signed-in person (`repositories.muster`). The filters are the tool's own
  arguments, type-checked and handed on; a session without a grant gets a 401
  carrying muster's sign-in URL. Without `repositories.muster` every route
  answers 503.
- 7a5904a: Add the write routes of the repositories gateway, each one tool call of
  giantswarm-repo-manager as the signed-in person: `POST /repositories/validate`
  (`validate_repository`, the dry run), `POST /repositories`
  (`create_repository`), `POST /repositories/:name/update|transfer|lifecycle|
reconcile` (`update_repository`, `transfer_repository`, `set_lifecycle`,
  `reconcile_repository`) and `POST /repositories/:name/decide`
  (`decide_repository`). The body carries the tool's own arguments, type-checked
  and handed on unchanged — `dryRun` and `mode` included, so the manager's
  refusal of anything but `commit` is its own. A tool-level refusal is a 403
  carrying the manager's reason; a broken hop stays a server fault.
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

### Patch Changes

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
- b6a5641: `POST /repositories/validate` hands the `reason` on to `validate_repository`,
  which takes the same arguments as `create_repository` since
  giantswarm-repo-manager 0.9.3. Before, a Review with the Reason field filled
  was refused by the backend (`validate_repository takes no argument 'reason'`).
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
- ba553f1: Read the muster, ai-chat, agent-platform and flux frontend config from the
  signed-in config (`GET /api/gs/config`) instead of the public `index.html`.

  `muster.serverName` and `muster.installations[].name/authProvider` (the
  fleet's codenames), `aiChat.welcome.*`, `aiChat.mcp[].name/authProvider`,
  `aiChat.contextWindow`, `agentPlatform.skills.repositories` and
  `flux.gitRepositoryPatterns` keep the default (backend) visibility and reach
  the browser after sign-in through `@giantswarm/backstage-plugin-gs-react`.
  The plans, platform-capabilities, repositories and roadmap backends drop the
  `@visibility frontend` markers no frontend read, so the public config no
  longer names their muster installation, repositories, board or teams. No
  `@visibility frontend` is left in these plugins.

- Updated dependencies [71317f9]
- Updated dependencies [9d0caee]
- Updated dependencies [85e7d8c]
- Updated dependencies [b63373b]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [50c2f49]
- Updated dependencies [25fc7da]
- Updated dependencies [846f143]
- Updated dependencies [55db519]
- Updated dependencies [5851bba]
- Updated dependencies [3198f83]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
- Updated dependencies [c3ec30a]
- Updated dependencies [103014c]
- Updated dependencies [167c24c]
- Updated dependencies [0af6fea]
  - @giantswarm/backstage-plugin-gs-node@0.4.0
