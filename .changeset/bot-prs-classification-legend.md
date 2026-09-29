---
'@giantswarm/backstage-plugin-bot-prs': minor
---

A classification is a way into the queue rather than a badge. Clicking one in
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
