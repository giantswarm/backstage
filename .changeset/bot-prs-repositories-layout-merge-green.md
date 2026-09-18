---
'@giantswarm/backstage-plugin-bot-prs': minor
---

Rebuild the Bot PRs page on the shared components the Repositories page uses:
the filters move into their own column, the tiles become a `Stat` strip, and
the table is the `Table` of `@backstage/core-components` with the record in its
detail panel.

Add **Approve and merge the green PRs**: one confirmation, after a live
preview, approves and merges every PR the engine filed as green in the current
view. It is one `x_marge_sweep` per team with `actions: approve,merge,mark`,
narrowed to those PRs, so every guard of the sweep still decides each one.
