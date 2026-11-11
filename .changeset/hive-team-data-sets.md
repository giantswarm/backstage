---
'@giantswarm/backstage-plugin-plans': minor
---

Hive's Now and History show the chosen team's own data set: the portal reads `magazine/teams.json` and the team's `magazine/teams/<slug>/` files. A team the magazine collects no data for shows an empty state that leads to its board. A magazine without per-team sets keeps working as before.
