# @giantswarm/backstage-plugin-bot-prs

## 0.1.2

### Patch Changes

- 2432cb0: Sign-in prompts say "connector" and name each connector by its display name.

  - muster-backend: `GET /servers/names` answers each connector's name (muster's
    key, `<namespace>/<name>` for a tenant's server), family and display name
    from `core_mcpserver_list` (muster v5.53.1 or later for the display name),
    read as the person, so the names are there for people without Kubernetes
    access to the `MCPServer` objects. A failed list answers
    `{ servers: [], unavailable: true }` with HTTP 200; a token muster refuses
    answers 401, and muster unreachable its 5xx. The shape, `ConnectorName`,
    is in gs-common.
  - muster: `MusterApi.listConnectorNames` and the hooks `useConnectorLabels` and
    `useConnectorLabel`, one shared read per installation, replace the
    `MCPServer` read behind the sign-in dialog and the notification inbox, which
    showed technical names to people without cluster access. `ServerSignIn`
    names the connector by it when the caller passes no `displayName`, and shows
    the display name with `showName`, with the server's own name beside it where
    they differ, and takes `onSignedIn`, called once per sign-in that lands
    (also from another tab, or a click that finds the server connected
    already), saying whether it was made in this tab (`SignedIn.here`). The
    names are read once per installation and are not read again on a sign-in.
    The sign-in dialog says "connector", its rows too.
  - agent-platform: muster's request for the person's sign-in to agent-manager
    is a sign-in, not agent-manager's own `auth_required` refusal: starting a
    session without it offers the sign-in instead of "Session not started" with
    muster's text. Once that sign-in lands the alert goes; where it was made in
    the tab the person pressed Start in, the refused start goes again. Before,
    the alert stayed, and its Sign in then answered "already authenticated".
    The connect alert names the connector by its display name and, for
    muster's request for a sign-in (`signInRequired`, read from muster's 401
    where the error is classified), writes its own sentence instead of
    muster's; any other not-connected answer stays in sight. Once the sign-in
    lands, every alert of the kind clears: on the create and edit reviews, the
    agent's delete, skills and Harness dialogs, the skill's update dialog, the
    GPU node pool, model cache, model backend and cluster pages and dialogs,
    a dry run behind it asks again and a refused write is cleared for the
    person to press again; nothing that deletes or removes goes again by
    itself. The skills and Harness dialogs now show the alert for a write
    refused for want of the sign-in, which they used to swallow.
  - bot-prs: the marge sign-in alert does the same.
  - app: the inbox's sign-in row says "connector".

- dbd826c: Every link and button that opens a new tab marks it the same way: the launch icon after its text and "(opens in a new tab)" for a screen reader, in place of the "↗" some of them ended in (Review pull request, Edit on GitHub, View on GitHub, the sign-in buttons, All portal settings, the release line, How it works, How alignment works, Workflow runs, the repository phase links). `ui-react`'s `ExternalLink` is now bui's `Link` (always underlined, bui's focus ring) and takes an optional `variant` and `title`; without a `variant` it keeps taking the surrounding font, and off the agent shell it keeps the classic link colour. `ui-react` adds `ExternalButtonLink` (bui's `ButtonLink` with that treatment) and exports `NewTabHint` and `NewTabLabel` (a button label followed by the hint). `ExternalCellText` and `GSReleaseInfo` are built on `ExternalLink`. A skill page's Path links to the SKILL.md on GitHub at the latest commit, and the Instructions file viewer links a file at the commit it was read at, naming no commit when there is none.

  Every text link to outside the portal now opens in a new tab and shows the icon, including the ones that showed nothing before or another external-link icon: docs, GitHub pull requests, commits, releases and issues, Grafana dashboards and endpoints, hostnames, Teleport, PagerDuty, sign-in pages, and the links in rendered markdown (`GSMarkdownContent` renders an `http(s)` link to another origin as an `ExternalLink`). `ui-react` exports `isExternalHref` for telling such a link apart.

- 9893b04: The muster plugin exports `useMusterServerAvailability` and `musterServerListQueryKey`: which installations' muster lists an MCP server, as the person. The Agent Platform and Bot PRs use it instead of their own copies, so Bot PRs also stops asking an installation the portal cannot reach, backs off after a 503, and no longer offers marge where muster has no per-user sign-in.
- Updated dependencies [771c3c5]
- Updated dependencies [9ebf632]
- Updated dependencies [d553603]
- Updated dependencies [2f03302]
- Updated dependencies [2432cb0]
- Updated dependencies [a4721d8]
- Updated dependencies [9d0f295]
- Updated dependencies [8a2faea]
- Updated dependencies [01a63aa]
- Updated dependencies [41e1c7f]
- Updated dependencies [b6f1f17]
- Updated dependencies [a158256]
- Updated dependencies [dbd826c]
- Updated dependencies [2f03302]
- Updated dependencies [c775cfb]
- Updated dependencies [cefb9d4]
- Updated dependencies [3b65ce4]
- Updated dependencies [694e2ae]
- Updated dependencies [e8c5832]
- Updated dependencies [22f9eaf]
- Updated dependencies [dcab50b]
- Updated dependencies [a84f5ec]
- Updated dependencies [b623ab3]
- Updated dependencies [5122bc9]
- Updated dependencies [a05070d]
- Updated dependencies [a02eb7e]
- Updated dependencies [99b5956]
- Updated dependencies [a955988]
- Updated dependencies [172b3de]
- Updated dependencies [d8681df]
- Updated dependencies [7e12f91]
- Updated dependencies [9893b04]
- Updated dependencies [6db0bbf]
- Updated dependencies [f5615a0]
- Updated dependencies [30166ef]
- Updated dependencies [9ebf632]
  - @giantswarm/backstage-plugin-muster@0.6.0
  - @giantswarm/backstage-plugin-ui-react@0.11.0
  - @giantswarm/backstage-plugin-gs@0.73.0
  - @giantswarm/backstage-plugin-analytics-react@0.4.0

## 0.1.1

### Patch Changes

- 4c53a2b: Name the tool, its MCP server and the installation on a muster tool error, and give each known kind of failure its status: the refusals of agent-manager, model-manager and workspace-manager and muster's refusals of a connector write answer 4xx and no longer reach Sentry, a muster rollout's interruption is logged at info and answered with a 503 the muster, plans and roadmap pages retry, and a timeout (504), a server muster holds no connection to (503) and a missing tool (502) stay reported. Sentry groups muster tool errors by kind and tool, or by server for the kinds that belong to a whole server. The muster pages no longer retry a refusal. platform-capabilities and repositories no longer show muster's own failures as the manager's refusal. `gs-node` adds `MUSTER_TOOL_ERROR_STATUS`, `musterToolErrorKindOf`, `musterServerOfTool` and `markReported`; `gs-common` adds the refusal registry (`mcpToolRefusalOf`, `parseToolErrorCode`). bot-prs keeps offering the marge sign-in for a missing tool or a lost connection.
- Updated dependencies [db5c770]
- Updated dependencies [5ded107]
- Updated dependencies [2fb06f7]
- Updated dependencies [36f0927]
- Updated dependencies [148a689]
- Updated dependencies [8fd67a7]
- Updated dependencies [06967c4]
- Updated dependencies [5bc242c]
- Updated dependencies [8ab4a8f]
- Updated dependencies [ef2cf27]
- Updated dependencies [a665a44]
- Updated dependencies [a2e34ef]
- Updated dependencies [6bfac24]
- Updated dependencies [a85c17f]
- Updated dependencies [2f531d8]
- Updated dependencies [6b4e6d6]
- Updated dependencies [0314965]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5bde8bf]
- Updated dependencies [4f2299d]
- Updated dependencies [0f927e4]
- Updated dependencies [c72aab9]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [5ded107]
- Updated dependencies [6dee1f6]
- Updated dependencies [ed68f95]
- Updated dependencies [3745db0]
- Updated dependencies [54e92f7]
- Updated dependencies [4c53a2b]
  - @giantswarm/backstage-plugin-analytics-react@0.3.0
  - @giantswarm/backstage-plugin-ui-react@0.10.0
  - @giantswarm/backstage-plugin-gs@0.72.0
  - @giantswarm/backstage-plugin-muster@0.5.0

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
- 55db519: Bot PRs: **Classify now**, **Approve and merge** and **Sweep** show where each team's run stands while marge works (`34 of 79 PRs done`), and a run lasts as long as marge keeps reporting instead of ending at the muster server's timeout. A run whose answer is cut on the way back is reported as an answer that never arrived, with the labels read again.

### Patch Changes

- 9312feb: The agent page's Technical details drop the Resource card's "Copy system
  prompt" button, show the agent's namespace and name as two facts, Namespace
  and Name, and link each skill version to its skill's page. The model and
  connector pages' Technical details split their resources the same way; a
  reference in the agent's own namespace (its ModelConfig, a sub-agent, the
  HelmRelease behind it) is named alone. The Configuration card's "See tools" is
  bui's link.

  Every git SHA the portal shows is 7 characters, a digest 12, with the full
  value as its title and a copy button on touch screens: skill pins and
  versions, agent revisions, workspace heads, Flux revisions and digests,
  branch-build versions, the release footer, scaffold and revert commits, and
  the backend's messages.

  New in `gs-common`: `shortSha`, re-exported by `ui-react`. New in `ui-react`:
  `CommitSha` and `namespacedNameFacts`.

- 9c0ba49: Report meaningful portal actions through Backstage's analytics API: a new
  `analytics-react` library with the typed event list and `useTrackedMutation`.
  Creating an agent (`AgentPlatform.agentCreated`), starting a session
  (`AgentPlatform.sessionStarted`) and registering an MCP server
  (`Muster.mcpServerAdded`) are tracked; every other write opts out explicitly.
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

- 8f3cd85: The sign-in for marge names the server muster registers, so the GitHub grant can be given. muster declares marge with a tool prefix, so its tools are `x_marge_*` while the server itself is `mcp-marge`; the sign-in sent the prefix and muster answered `Server 'marge' not found`.
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

- 577c542: Bot PRs: a GitHub rate limit is reported as one "Your GitHub API budget is spent until HH:MM" alert, not as "marge refused the read" for every team. Refresh, Classify now, Preview sweep, Approve and merge, and the dialogs' Apply are disabled until the reset. A run that stops at the limit (marge `rate_limit`) shows how many PRs it left undecided. Those PRs are listed as **Not reached** and Apply leaves them out.
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
- 4114dde: A page whose first read failed no longer says "No items" while the retry
  waits for the tab to come back to the foreground: it shows its loading state
  until the retry answers, then the data or the error. `isAwaitingData` in
  `ui-react` is the shared check (no data yet, fetching or waiting to retry),
  used in place of react-query's `isLoading`, which is false while a retry is
  paused.
- a5ec0eb: Explain every figure in the stats strips with an info hint: the session detail
  and session usage totals, the muster dashboard, MCP usage and workflow run
  stats, and the bot PR queue. The workload details pane's replica counts now use
  the shared `Stat` component too, and the session detail and muster dashboard
  strips use the same spacing as the others.
- Updated dependencies [2b79a0c]
- Updated dependencies [34f5fc9]
- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [e62dd24]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2494c9a]
- Updated dependencies [85b1ac8]
- Updated dependencies [4eaec47]
- Updated dependencies [551e5d5]
- Updated dependencies [c5b9c46]
- Updated dependencies [0c2f870]
- Updated dependencies [e06dec9]
- Updated dependencies [2b79a0c]
- Updated dependencies [2d1f914]
- Updated dependencies [2b79a0c]
- Updated dependencies [55e9be1]
- Updated dependencies [2b79a0c]
- Updated dependencies [57df63e]
- Updated dependencies [d6bec76]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [2b79a0c]
- Updated dependencies [d129ee1]
- Updated dependencies [2b94c2a]
- Updated dependencies [9312feb]
- Updated dependencies [a060513]
- Updated dependencies [aad1e93]
- Updated dependencies [1e1e0e3]
- Updated dependencies [2b79a0c]
- Updated dependencies [9c0ba49]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [4c69b72]
- Updated dependencies [9dcfef0]
- Updated dependencies [85e7d8c]
- Updated dependencies [be7bd04]
- Updated dependencies [9602074]
- Updated dependencies [464f5ad]
- Updated dependencies [2fa183d]
- Updated dependencies [9e00143]
- Updated dependencies [602f2a7]
- Updated dependencies [2b79a0c]
- Updated dependencies [b63373b]
- Updated dependencies [4f6d765]
- Updated dependencies [2b79a0c]
- Updated dependencies [ea12ebb]
- Updated dependencies [158457a]
- Updated dependencies [600a4c3]
- Updated dependencies [d0bf6da]
- Updated dependencies [c3409fb]
- Updated dependencies [fd4dc77]
- Updated dependencies [4048e91]
- Updated dependencies [67a32ef]
- Updated dependencies [9fd228e]
- Updated dependencies [4c4b507]
- Updated dependencies [f905068]
- Updated dependencies [4bcdf2e]
- Updated dependencies [86eec55]
- Updated dependencies [2b79a0c]
- Updated dependencies [e928a56]
- Updated dependencies [2b79a0c]
- Updated dependencies [205d9b4]
- Updated dependencies [2b79a0c]
- Updated dependencies [99cede2]
- Updated dependencies [2b79a0c]
- Updated dependencies [f088683]
- Updated dependencies [884bd42]
- Updated dependencies [6fe84bd]
- Updated dependencies [a2443de]
- Updated dependencies [884bd42]
- Updated dependencies [6b84a5f]
- Updated dependencies [2f5598e]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [23bfca0]
- Updated dependencies [2b79a0c]
- Updated dependencies [e33193b]
- Updated dependencies [2b79a0c]
- Updated dependencies [d82c4c6]
- Updated dependencies [13225d7]
- Updated dependencies [87b1c2e]
- Updated dependencies [3dbde6e]
- Updated dependencies [a1292a5]
- Updated dependencies [6822ed1]
- Updated dependencies [b4dc429]
- Updated dependencies [2789f3d]
- Updated dependencies [3043a1d]
- Updated dependencies [0a05757]
- Updated dependencies [66ac70b]
- Updated dependencies [8967f50]
- Updated dependencies [6720990]
- Updated dependencies [cfb48ae]
- Updated dependencies [d14ebda]
- Updated dependencies [0811b1e]
- Updated dependencies [74e4a0b]
- Updated dependencies [e807fa6]
- Updated dependencies [e9a6141]
- Updated dependencies [b79cf20]
- Updated dependencies [104d1bc]
- Updated dependencies [5e54675]
- Updated dependencies [1f1b881]
- Updated dependencies [0d6360e]
- Updated dependencies [faaf78e]
- Updated dependencies [0d6d9f3]
- Updated dependencies [6e1050e]
- Updated dependencies [0edc1c4]
- Updated dependencies [0b2fa7f]
- Updated dependencies [e447f16]
- Updated dependencies [b431a04]
- Updated dependencies [89ad470]
- Updated dependencies [2b79a0c]
- Updated dependencies [8402eee]
- Updated dependencies [6a5c0d4]
- Updated dependencies [e5bd97a]
- Updated dependencies [381d16d]
- Updated dependencies [ea5fd6f]
- Updated dependencies [5c82125]
- Updated dependencies [4f6d765]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [4114dde]
- Updated dependencies [0373fb1]
- Updated dependencies [32f7b03]
- Updated dependencies [731296e]
- Updated dependencies [56d8c05]
- Updated dependencies [ee2786b]
- Updated dependencies [b628d71]
- Updated dependencies [ad90805]
- Updated dependencies [f806f76]
- Updated dependencies [87b1c2e]
- Updated dependencies [cfb83c6]
- Updated dependencies [846f143]
- Updated dependencies [9e57736]
- Updated dependencies [578b163]
- Updated dependencies [57d8d40]
- Updated dependencies [7b4b7ae]
- Updated dependencies [2b14d41]
- Updated dependencies [55db519]
- Updated dependencies [607d514]
- Updated dependencies [d200952]
- Updated dependencies [578b163]
- Updated dependencies [2b79a0c]
- Updated dependencies [478aa4d]
- Updated dependencies [2b79a0c]
- Updated dependencies [7518832]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [94a61cb]
- Updated dependencies [2b79a0c]
- Updated dependencies [28aada8]
- Updated dependencies [ee800aa]
- Updated dependencies [578b163]
- Updated dependencies [7c9e6d6]
- Updated dependencies [c8743f8]
- Updated dependencies [f2cc1f8]
- Updated dependencies [7b63a47]
- Updated dependencies [5851bba]
- Updated dependencies [2b79a0c]
- Updated dependencies [6f4d55e]
- Updated dependencies [2b79a0c]
- Updated dependencies [4b7522d]
- Updated dependencies [69eaff0]
- Updated dependencies [159c276]
- Updated dependencies [75cb9fa]
- Updated dependencies [1642eed]
- Updated dependencies [578b163]
- Updated dependencies [c4a1640]
- Updated dependencies [9a71810]
- Updated dependencies [4cdc2c0]
- Updated dependencies [c1c65ee]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f9644fb]
- Updated dependencies [6205cca]
- Updated dependencies [578b163]
- Updated dependencies [f410853]
- Updated dependencies [7ff288f]
- Updated dependencies [ff6278b]
- Updated dependencies [578b163]
- Updated dependencies [28aada8]
- Updated dependencies [5f09b20]
- Updated dependencies [e97558c]
- Updated dependencies [c3a9998]
- Updated dependencies [ab9b7a0]
- Updated dependencies [f8be62f]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [1305e9e]
- Updated dependencies [c604256]
- Updated dependencies [6b18a17]
- Updated dependencies [70eeb29]
- Updated dependencies [2b79a0c]
- Updated dependencies [d68f887]
- Updated dependencies [92f025f]
- Updated dependencies [65d8d60]
- Updated dependencies [0bed874]
- Updated dependencies [6b3ac77]
- Updated dependencies [ff8b3f1]
- Updated dependencies [2995471]
- Updated dependencies [2b79a0c]
- Updated dependencies [954a810]
- Updated dependencies [8d67e83]
- Updated dependencies [f90366e]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [54ea033]
- Updated dependencies [728d50e]
- Updated dependencies [c482453]
- Updated dependencies [5e9b874]
- Updated dependencies [eba6372]
- Updated dependencies [2b79a0c]
- Updated dependencies [32f943c]
- Updated dependencies [4aa60ba]
- Updated dependencies [71d7a44]
- Updated dependencies [5cf5f33]
- Updated dependencies [3383e35]
- Updated dependencies [578b163]
- Updated dependencies [578b163]
- Updated dependencies [f47797c]
- Updated dependencies [28aada8]
- Updated dependencies [59f12a0]
- Updated dependencies [23d3558]
- Updated dependencies [2b79a0c]
- Updated dependencies [28aada8]
- Updated dependencies [b8afa37]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [d19ad0c]
- Updated dependencies [799d6c3]
- Updated dependencies [2b79a0c]
- Updated dependencies [578b163]
- Updated dependencies [d95e52d]
- Updated dependencies [578b163]
- Updated dependencies [8e3b668]
- Updated dependencies [2b79a0c]
- Updated dependencies [bbb9406]
- Updated dependencies [9180429]
- Updated dependencies [12aaa8b]
- Updated dependencies [610d01d]
- Updated dependencies [398c4b1]
- Updated dependencies [22b2ad6]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [e8c6d73]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [c81464c]
- Updated dependencies [a6c427b]
- Updated dependencies [b9aff1b]
- Updated dependencies [741669e]
- Updated dependencies [7a6b30e]
- Updated dependencies [2b79a0c]
- Updated dependencies [564456f]
- Updated dependencies [389a40b]
- Updated dependencies [fd05081]
- Updated dependencies [ee7fe5a]
- Updated dependencies [fa4ae37]
- Updated dependencies [b4a3dee]
- Updated dependencies [ebd7572]
- Updated dependencies [eb7ed35]
- Updated dependencies [69e07c8]
- Updated dependencies [eb2bbd1]
- Updated dependencies [aecc202]
- Updated dependencies [4f6d765]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f205e33]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [f985210]
- Updated dependencies [ba553f1]
- Updated dependencies [eb337fb]
- Updated dependencies [5d7602c]
- Updated dependencies [14e878c]
- Updated dependencies [2b79a0c]
- Updated dependencies [14e878c]
- Updated dependencies [a2443de]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a5ec0eb]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [b44a375]
- Updated dependencies [2b79a0c]
- Updated dependencies [49263b7]
- Updated dependencies [1893681]
- Updated dependencies [f94930d]
- Updated dependencies [cba71a8]
- Updated dependencies [2b79a0c]
- Updated dependencies [0bed874]
- Updated dependencies [483c8f4]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [2e425c5]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [322e58c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [0d6360e]
- Updated dependencies [d19ad0c]
- Updated dependencies [b990251]
- Updated dependencies [2b79a0c]
- Updated dependencies [d9673e8]
- Updated dependencies [9e57736]
- Updated dependencies [2b79a0c]
- Updated dependencies [d95e52d]
- Updated dependencies [ff8b3f1]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [2b79a0c]
- Updated dependencies [9fab6b1]
- Updated dependencies [2b79a0c]
- Updated dependencies [3130bf4]
- Updated dependencies [600a4c3]
- Updated dependencies [6079d5b]
- Updated dependencies [e6ced92]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [103014c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [2b79a0c]
- Updated dependencies [ca3ad93]
- Updated dependencies [af67bbf]
- Updated dependencies [d9673e8]
- Updated dependencies [b773056]
- Updated dependencies [b032f65]
- Updated dependencies [0388b0e]
- Updated dependencies [d400274]
- Updated dependencies [0af6fea]
- Updated dependencies [2b79a0c]
  - @giantswarm/backstage-plugin-muster@0.4.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-gs@0.71.0
  - @giantswarm/backstage-plugin-analytics-react@0.2.0
