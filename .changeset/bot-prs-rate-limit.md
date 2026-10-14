---
'@giantswarm/backstage-plugin-bot-prs': patch
---

Bot PRs: a GitHub rate limit is reported as one "Your GitHub API budget is spent until HH:MM" alert, not as "marge refused the read" for every team. Refresh, Classify now, Preview sweep, Approve and merge, and the dialogs' Apply are disabled until the reset. A run that stops at the limit (marge `rate_limit`) shows how many PRs it left undecided. Those PRs are listed as **Not reached** and Apply leaves them out.
