---
'@giantswarm/backstage-plugin-plans': minor
'@giantswarm/backstage-plugin-roadmap': minor
'app': minor
---

Add Hive (`/hive`), one sidebar entry that merges Plans, Roadmap and the product magazine: routed tabs Now, History, Roadmap, Plans and Knowledge, with the team and the search in the page header. History shows the last three weeks, epic by epic. Hive takes over the extension id `page:plans`, so a portal that enabled the Plans page shows Hive. `/plans` (extension `page:plans/plans-redirect`), `/roadmap` (`page:roadmap`) and `/product` (`page:plans/magazine`) redirect into Hive with their paths and parameters. `plans.fixtures` and `roadmap.fixtures` serve built-in fixtures for local development.
