---
'@giantswarm/backstage-plugin-review-queue': minor
'@giantswarm/backstage-plugin-plans': patch
---

Add Hive's Reviews tab (`/hive/reviews`), on wherever Hive is on: the PRs waiting on you, on your teams and on the team Hive is scoped to, and your own PRs waiting for review, each with its CI, review and merge state, read from GitHub through muster's `github` server as you. Post to Slack posts one message about your ticked PRs to a channel as you, through muster's `slack` server. The tab is last in Hive's tab order.
