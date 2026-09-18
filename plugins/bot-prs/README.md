# @giantswarm/backstage-plugin-bot-prs

Frontend plugin (`pluginId: bot-prs`) that renders the Bot PRs page: the open
bot PRs (Renovate, Dependabot, Align files, Herald) of the person's teams, or
of every team, as [marge](https://github.com/giantswarm/marge), the sweep
engine, classifies them, and the sweep's own steps behind a preview. Every
read and every write is one of marge's four MCP tools, called through the
installation's muster as the signed-in person with their own GitHub grant, so
a merge, a comment or a marker names the person, not the sweep App. There is
no agent in the path and the portal composes nothing: what the page shows for
a PR is what `marge list` and `marge sweep --dry-run` print for it.

## Features

- **Scopes**: _My team_ (the person's `team-*` catalog groups, the default
  when they have one) and _All teams_ (every `team-*` group the catalog
  names), kept in the URL as `?scope=`. marge answers one team per call, so a
  scope is one `x_marge_list` per team.
- **Layout**: the shape of the Repositories page -- the scopes as tabs, the
  filters in their own column (`FiltersLayout`), the stats strip, the summary
  line and the table -- built from the shared `ui-react` components, so the
  two inventory pages read alike.
- **Stats**: open, green, waiting, action required, security failures and
  unclassified over the listed rows, as a `Stat` strip.
- **Filters**: search, team (under _All teams_), repository, classification,
  bot kind and dependency, each a URL parameter, applied on the page.
- **Table**: the `Table` of `@backstage/core-components`, sortable by every
  column and expandable per row; classification first, worst first.
- **Row expansion**: the engine's record -- classification and evidence, the
  `marge/<class>` label, bot and update type, the policy the PR was decided
  under (sweep on or off, the update types that merge when green, the confirm
  mode), the prior rescue marker -- and the two per-PR actions.
- **Refresh classification**: `x_marge_list` with `refresh: true` on every
  team in view. The table is otherwise the **stored** read: the label the
  last sweep left on each PR, in one search per team, which says what the
  last sweep decided, not what a sweep would decide now. A PR no sweep has
  labelled reads `Unclassified`. Nothing on the page classifies on mount, on
  focus or on a timer.
- **Preview sweep** and **Apply**: `x_marge_sweep` with `dry_run: true` on
  one team, the engine's steps (approve, merge, refresh, retry, remedy) as
  checkboxes all ticked to begin with, the way a CLI sweep runs them; Apply
  repeats the call without `dry_run` and with `prs` set to exactly the PRs the
  preview listed. Under a team policy with `rescue.confirm: per-pr` (the
  company default) the rows carry checkboxes and Apply runs on the ticked
  ones, none by default; under `per-sweep` one confirmation covers the run.
- **Approve and merge the green PRs**: one `x_marge_sweep` per team with
  `actions: approve,merge,mark`, narrowed with `prs` to the PRs the engine
  filed as `eligible` in the current view -- green, and of an update type the
  team policy merges. The dialog previews with `dry_run: true` first, so the
  list is a live classification and not the stored label; one confirmation
  then applies to exactly the PRs it listed. Each step keeps its own guards:
  a pending check waits, a failing security check is never merged past, an
  update type the policy does not merge is held. The per-PR confirmation of
  the sweep dialog is the rescue path's and does not apply here.
- **Sweep this PR**: the sweep dialog narrowed to one PR, from the expanded
  row. There is no separate refresh or rerun button: each is a step the
  engine takes or refuses on its own terms, and a rerun is a remedy action a
  catalogue rule selects under its guards (roadmap#4355), so a direct button
  would route around them.
- **Mark blocked**: `x_marge_mark` with `outcome: blocked`,
  `tool: developer-portal` and the person's reason, from the expanded row.
- A guard that refuses shows the engine's reason as the row's evidence
  (`Held`, `Failed`, `Skipped`), and nothing offers a way around it, because
  the engine has none. A refusal of a whole call (a team without a team file)
  is the tool's error, shown verbatim per team.
- A person without a GitHub grant for marge gets the muster plugin's existing
  per-server `ServerSignIn`; the queue loads by itself once the grant lands.

## What is deliberately not here

No rescue button: the engine step is roadmap#4360, and the rescue column only
shows the prior attempt marge found on the PR. No cost panel, no policy panel,
no policy or rule editing: everything that shapes the engine's behaviour lives
in files under review.

## Gating

Disabled by default. A deployment opts in via app-config `app.extensions`
(`page:bot-prs`), the same gating as the repositories and plans plugins:
gazelle's config names it, a customer portal's does not. The page needs the
muster plugin and an installation whose muster registers marge as an
MCPServer; it says so otherwise.

## Installation

The page reaches marge through one muster: the section's pinned installation
when its muster lists a `marge` MCPServer, else the home installation, else the
first installation that does (`useMargeInstallation`). A pinned installation
without marge resolves to nothing and says why.
