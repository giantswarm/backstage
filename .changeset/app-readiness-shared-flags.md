---
'@giantswarm/backstage-plugin-gs-common': minor
---

Export `ReleaseReadinessFlags` and `releaseReadinessFlagNames` — the release
blockers `AppReadinessProcessor` writes into `giantswarm.io/readiness-flags`.

That annotation has two authors: `backstage-catalog-importer` merges its enforced
chart-metadata gaps into the same list. Consumers have to tell the two apart to
attribute each flag to the verdict it came from, and they do so by recognising
these names, so they belong in one shared place rather than being duplicated on
each side of the package boundary.
