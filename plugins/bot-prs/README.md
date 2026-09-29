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
  names), kept in the URL as `?scope=`. A scope is one `x_marge_list` with
  `teams`: marge merges the teams' repository lists and reads them once, and
  still decides every team under its own team file.
- **Layout**: the shape of the Repositories page -- the scopes as tabs, the
  filters in their own column (`FiltersLayout`), the stats strip, the summary
  line and the table -- built from the shared `ui-react` components, so the
  two inventory pages read alike.
- **Stats**: open, green, waiting, action required, security failures and
  unclassified over the listed rows, as a `Stat` strip.
- **Filters**: search, team (under _All teams_), repository, classification,
  bot kind and dependency, each a URL parameter, applied on the page. The
  team filter reads nothing: the team is already in the queue. A `?team=` a
  person shared that the scope does not hold is read on its own.
- **Table**: the `Table` of `@backstage/core-components`, sortable by every
  column and expandable per row; classification first, worst first. Each row
  carries a tick, and every row of the view is ticked to begin with: the page
  holds the refs the person ticked off, so a filter change and a reload need
  no re-seeding, and what the buttons act on is what the table shows minus
  those. The header tick clears or restores the whole view.
- **Row expansion**: the engine's record -- classification and evidence, the
  `marge/<class>` label, bot and update type, the policy the PR was decided
  under (sweep on or off, the update types that merge when green, the confirm
  mode), the prior rescue marker -- and the two per-PR actions.
- **Classify now**: one `x_marge_sweep` per team with `classify` as the only
  step, narrowed with `prs` to the selected PRs. It writes each PR's
  `marge/<class>` label and nothing else. The table is otherwise the
  **stored** read: the label the
  last sweep left on each PR, which costs the discovery of the scope and
  nothing more, and says what the last sweep decided, not what a sweep would
  decide now. A PR no sweep has labelled reads `Unclassified`. Nothing on the
  page classifies on mount, on focus or on a timer.
- **Preview sweep** and **Apply**: one `x_marge_sweep` per team with
  `dry_run: true`, narrowed with `prs` to the selected PRs, so a filtered view
  is previewed as it reads and not as the whole team. The engine's steps
  (changelog, approve, merge, refresh, retry, remedy) are checkboxes all ticked to begin
  with, the way a CLI sweep runs them; Apply repeats the call without
  `dry_run` and with `prs` set to exactly the PRs the preview listed. The PRs
  are picked in the table, so the dialog offers no picker of its own: it is
  the preview of a decision already taken. Its rows are a table, one row per
  PR, ordered by team, repository and PR number.
- **Approve and merge the green PRs**: one `x_marge_sweep` per team with
  `actions: approve,merge,mark`, narrowed with `prs` to the PRs the engine
  filed as `eligible` among the selected rows -- green, and of an update type the
  team policy merges. The dialog previews with `dry_run: true` first, so the
  list is a live classification and not the stored label; one confirmation
  then applies to exactly the PRs the preview still found green, and a PR that
  stopped being green in between is listed with the engine's reason and left
  out of the apply. Each step keeps its own guards:
  a pending check waits, a failing security check is never merged past, an
  update type the policy does not merge is held. The changelog step is not one
  of its steps: the entry is a commit that starts CI again, so a PR that took
  one merges on a later sweep, which is not what this button promises. Use
  **Preview sweep** for a team that writes entries.
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
