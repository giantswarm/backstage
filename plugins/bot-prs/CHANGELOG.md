# @giantswarm/backstage-plugin-bot-prs

## 0.1.0

### Minor Changes

- bf3b759: A classification is a way into the queue rather than a badge. Clicking one in
  the table narrows the table to that class, and clicking it again shows every
  class. **What the classifications mean**, above the table, explains each class
  in view with how many PRs carry it, and each of its rows narrows the table too.
  The `unclassified` class no longer draws itself as an unticked radio button,
  which read as a control a person could set; the classes are the engine's own
  and nobody writes one by hand.

  A column nothing in view fills is dropped rather than shown as a column of
  blanks. The update type and the prior rescue each need the PR itself, which the
  stored read does not do, so both were a column of `n/a` on every load.

  A PR that moves no dependency names none. An Align files PR, a Herald PR and a
  bot's own onboarding PR each moved nothing and had their whole title repeated
  in the Dependency column.

- 3a5d5e3: **Refresh classification** becomes **Classify now**, and it writes. It was a
  read: it classified every PR and kept the answer in the browser's own cache, so
  a reload showed the PRs as unclassified again. It is now
  `x_marge_sweep` with `classify` as its only step, one call per team, which
  leaves the class in each PR's `marge/<class>` label. The next read of this
  page, a teammate's page and the CLI all report it. Nothing else is written: no
  approval, no merge, no branch update, no evidence comment.

  **Preview sweep** works for a person in several teams. It ran under one team's
  policy and was disabled whenever more than one team was in view; it now
  previews and applies every team in view, one call each, and reports each team
  under its name. A team that marge refuses leaves the others alone.

  While a classification runs, the page says which teams are still outstanding,
  and a failed run is reported instead of being dropped.

  The table shows the version an update moves between, `4.17.20 → 4.17.21`, from
  the dependency and versions marge now sends on each entry. The rows sort by
  bot under the classification, so Renovate and Align files read apart.

- 293e889: Add the bot-prs frontend plugin: a `/bot-prs` page behind a disabled-by-default `page:bot-prs` extension, the same gating as the repositories plugin, that lists the open bot PRs of the person's teams or of every team as marge classifies them and runs the sweep's own steps through marge's MCP tools over muster as the signed-in person. Scopes _My team_ and _All teams_ in the URL, tiles per classification, bot and age, filters per team, repository, classification, bot and dependency, a sortable table whose rows expand to the engine's record and the two per-PR actions. The table is marge's stored classification; **Refresh classification** is the one live read and only a click. **Preview sweep** shows the engine's per-PR outcome with the steps as checkboxes, **Apply** runs exactly the previewed PRs, ticked one by one under a `per-pr` policy; **Sweep this PR** is the same dialog on one PR and **Mark blocked** writes marge's marker. A refusal is shown with the engine's reason and nothing offers a way around it. A person without a GitHub grant gets the muster plugin's per-server Sign in.
- 8425eed: Rebuild the Bot PRs page on the shared components the Repositories page uses:
  the filters move into their own column, the tiles become a `Stat` strip, and
  the table is the `Table` of `@backstage/core-components` with the record in its
  detail panel.

  Add **Approve and merge the green PRs**: one confirmation, after a live
  preview, approves and merges every PR the engine filed as green in the current
  view. It is one `x_marge_sweep` per team with `actions: approve,merge,mark`,
  narrowed to those PRs, so every guard of the sweep still decides each one.

- 73bc416: Bot PRs: the PRs a run acts on are picked in the table. Every row of the view carries a tick, ticked to begin with, and a tick drops that PR from **Preview sweep**, **Approve and merge** and **Classify now**, which all carry the count. **Preview sweep** now passes `prs` to `x_marge_sweep`, so a filtered view is previewed as it reads instead of as the whole team. The sweep dialog has no picker of its own any more, and its rows are grouped by repository and ordered by PR number. The sweep steps now offer the engine's `changelog` step, which the page never sent, so a team whose policy writes changelog entries gets them from a portal sweep as it does from the CLI.

### Patch Changes

- be7bd04: A dropped connection is no longer reported as marge refusing the run. When the
  browser's connection closes before marge answers (a "Failed to fetch", a
  roaming Wi-Fi), or the portal's edge answers in its place with a 502, 503 or
  504, the Approve and merge and Sweep dialogs say the connection dropped:

  - On a preview, that it was only a preview and nothing changed, with
    **Preview again**, which runs only the calls of the teams whose answer was
    lost and keeps every other team's preview in view.
  - On an apply, that the outcome is unknown: marge may already have acted on
    some of the PRs, or all of them, and may still be at it. It no longer says
    nothing was approved or merged. The queue is read again, and the alert links
    each PR the apply named, whose evidence comment on GitHub records what marge
    did.

  marge's own refusal keeps its wording. The same tells a lost classification
  (**Classify now**) and a lost read of the queue apart from a refusal, and the
  Sweep dialog no longer reports **Applied** when no team answered.

  The muster client keeps the HTTP status on the error of a failed request.

- 8f3cd85: The sign-in for marge names the server muster registers, so the GitHub grant can be given. muster declares marge with a tool prefix, so its tools are `x_marge_*` while the server itself is `<installation>-mcp-marge`; the sign-in sent the prefix and muster answered `Server 'marge' not found`.
- 9602074: Bot PRs: the Approve and merge dialog reads as a table. Its title matches the
  button that opens it, the intro is two sentences, and the preview is one row
  per PR in the page's own columns — Team (only when there is more than one),
  Repository, Pull request (without the shared `chore(deps):` prefix) and Result,
  where a green PR says the step the run takes and any other PR leads with its
  class and the reason. A PR that is no longer green is called out above the
  table and left out of the apply, so the button's count is what gets merged.
  Skeleton rows stand in while the preview runs, the dialog stays dismissable
  until Apply is pressed, and the preview stays readable while the apply runs. A
  repository marge could not read, a failure no rule matches and an unreadable
  rule catalogue are alerts after the table. Once it has run, Close is the only
  button. The sweep dialog shares the table.

  ui-react's `ConfirmDialog` takes `isDone`: the confirm button goes and Cancel
  becomes Close.

- f90366e: Bot PRs without a marge grant is the sign-in alone: the toolbar, the tiles, the
  filters and the table no longer render behind it, and the missing grant is one
  warning instead of one per team in scope. A team the catalogue names and
  giantswarm/github has no team file for is a single warning that lists those
  teams; any other refusal is one alert that names the teams and the messages.

  A server list muster could not answer is no longer read as "this portal has no
  marge": the page calls marge on the pinned or home installation and reports
  what marge or muster says, and the admin-facing empty state is kept for the
  one case that earns it, a muster that answered without marge. An expired
  portal session is named as such instead of shown as a refusal.

- f6f1d50: `sortRows` and `countTiles` take the clock as an optional parameter, so the
  sort by age and the age tiles can be tested at a fixed moment: the test's two
  young fixtures tie on whole-day age for one hour every day, and the sort test
  failed in that hour.
- a5ec0eb: Explain every figure in the stats strips with an info hint: the session detail
  and session usage totals, the muster dashboard, MCP usage and workflow run
  stats, and the bot PR queue. The workload details pane's replica counts now use
  the shared `Stat` component too, and the session detail and muster dashboard
  strips use the same spacing as the others.
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [85b1ac8]
- Updated dependencies [551e5d5]
- Updated dependencies [c5b9c46]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [85e7d8c]
- Updated dependencies [be7bd04]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [4f6d765]
- Updated dependencies [600a4c3]
- Updated dependencies [d0bf6da]
- Updated dependencies [c3409fb]
- Updated dependencies [67a32ef]
- Updated dependencies [9fd228e]
- Updated dependencies [4bcdf2e]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [d82c4c6]
- Updated dependencies [87b1c2e]
- Updated dependencies [3dbde6e]
- Updated dependencies [a1292a5]
- Updated dependencies [6822ed1]
- Updated dependencies [8967f50]
- Updated dependencies [d14ebda]
- Updated dependencies [e807fa6]
- Updated dependencies [e9a6141]
- Updated dependencies [b79cf20]
- Updated dependencies [5e54675]
- Updated dependencies [1f1b881]
- Updated dependencies [faaf78e]
- Updated dependencies [0b2fa7f]
- Updated dependencies [b431a04]
- Updated dependencies [8402eee]
- Updated dependencies [5c82125]
- Updated dependencies [4f6d765]
- Updated dependencies [87b1c2e]
- Updated dependencies [9e57736]
- Updated dependencies [578b163]
- Updated dependencies [2b14d41]
- Updated dependencies [607d514]
- Updated dependencies [d200952]
- Updated dependencies [578b163]
- Updated dependencies [94a61cb]
- Updated dependencies [28aada8]
- Updated dependencies [ee800aa]
- Updated dependencies [578b163]
- Updated dependencies [7c9e6d6]
- Updated dependencies [c8743f8]
- Updated dependencies [f2cc1f8]
- Updated dependencies [5851bba]
- Updated dependencies [69eaff0]
- Updated dependencies [1642eed]
- Updated dependencies [578b163]
- Updated dependencies [c4a1640]
- Updated dependencies [9a71810]
- Updated dependencies [c1c65ee]
- Updated dependencies [f9644fb]
- Updated dependencies [6205cca]
- Updated dependencies [578b163]
- Updated dependencies [7ff288f]
- Updated dependencies [ff6278b]
- Updated dependencies [578b163]
- Updated dependencies [28aada8]
- Updated dependencies [5f09b20]
- Updated dependencies [e97558c]
- Updated dependencies [c3a9998]
- Updated dependencies [ab9b7a0]
- Updated dependencies [1305e9e]
- Updated dependencies [c604256]
- Updated dependencies [6b18a17]
- Updated dependencies [70eeb29]
- Updated dependencies [92f025f]
- Updated dependencies [65d8d60]
- Updated dependencies [6b3ac77]
- Updated dependencies [2995471]
- Updated dependencies [954a810]
- Updated dependencies [8d67e83]
- Updated dependencies [f90366e]
- Updated dependencies [54ea033]
- Updated dependencies [728d50e]
- Updated dependencies [c482453]
- Updated dependencies [5e9b874]
- Updated dependencies [32f943c]
- Updated dependencies [71d7a44]
- Updated dependencies [5cf5f33]
- Updated dependencies [3383e35]
- Updated dependencies [578b163]
- Updated dependencies [578b163]
- Updated dependencies [f47797c]
- Updated dependencies [28aada8]
- Updated dependencies [28aada8]
- Updated dependencies [b8afa37]
- Updated dependencies [578b163]
- Updated dependencies [578b163]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [e8c6d73]
- Updated dependencies [c81464c]
- Updated dependencies [a6c427b]
- Updated dependencies [741669e]
- Updated dependencies [7a6b30e]
- Updated dependencies [564456f]
- Updated dependencies [389a40b]
- Updated dependencies [4f6d765]
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
- Updated dependencies [a5ec0eb]
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
- Updated dependencies [9fab6b1]
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
- Updated dependencies [d400274]
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-muster@0.4.0
  - @giantswarm/backstage-plugin-gs@0.71.0
