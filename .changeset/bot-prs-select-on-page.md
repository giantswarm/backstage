---
'@giantswarm/backstage-plugin-bot-prs': minor
---

Bot PRs: the PRs a run acts on are picked in the table. Every row of the view carries a tick, ticked to begin with, and a tick drops that PR from **Preview sweep**, **Approve and merge** and **Classify now**, which all carry the count. **Preview sweep** now passes `prs` to `x_marge_sweep`, so a filtered view is previewed as it reads instead of as the whole team. The sweep dialog has no picker of its own any more, and its rows are grouped by repository and ordered by PR number. The sweep steps now offer the engine's `changelog` step, which the page never sent, so a team whose policy writes changelog entries gets them from a portal sweep as it does from the CLI.
