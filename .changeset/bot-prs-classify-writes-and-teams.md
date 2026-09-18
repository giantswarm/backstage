---
'@giantswarm/backstage-plugin-bot-prs': minor
---

**Refresh classification** becomes **Classify now**, and it writes. It was a
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

A classification is now a way into the queue rather than a badge: clicking one
in the table narrows the table to that class, and clicking it again shows every
class. **What the classifications mean** above the table explains each class in
view, with how many PRs carry it, and each row of it narrows the table too. The
`unclassified` class no longer draws itself as an unticked radio button, which
read as a control a person could set; the classes are the engine's own and
nobody writes one by hand.

A column nothing in view fills is dropped rather than shown as a column of
blanks. The update type and the prior rescue each need the PR itself, which
the stored read does not do, so both were always empty.
