---
'@giantswarm/backstage-plugin-bot-prs': minor
---

Bot PRs: **Classify now**, **Approve and merge** and **Sweep** show where each team's run stands while marge works (`34 of 79 PRs done`), and a run lasts as long as marge keeps reporting instead of ending at the muster server's timeout. A run whose answer is cut on the way back is reported as an answer that never arrived, with the labels read again.
