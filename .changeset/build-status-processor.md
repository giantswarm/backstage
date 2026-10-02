---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
---

New `BuildStatusProcessor`: records whether a component's default branch
builds, as the `giantswarm.io/build-status` label (`passing` / `failing` /
`unknown`), the confirmed failing checks in `giantswarm.io/build-failing-checks`
(a JSON array, since check names contain commas),
the branch in `giantswarm.io/default-branch`, and `BUILD-RED` merged into
`giantswarm.io/readiness-flags` when failing. Off by default
(`catalog.processors.buildStatus.enabled`).

GitHub hangs commit statuses off a SHA, so a red from a branch cut off main, a
merge-queue branch or a tag shows up on main. Each failing status is therefore
resolved through the CircleCI build behind it and counted only when that build
really ran on the default branch and really reached a verdict; tag builds and
other branches' builds are set aside. `passing` needs positive evidence: a
context still running, cancelled or pending on the default branch, a red that
cannot be resolved, or a rollup whose every context was set aside is `unknown`,
never `failing` and never `passing`; a skipped or neutral check is not evidence
either, and where CircleCI reports to the commit only a green CircleCI build of
the default branch is (a green pre-commit or scorecard workflow says nothing
about whether the build runs). When a lookup fails (GitHub 5xx, CircleCI rate limit) the last known
verdict is kept for up to a day with its original `build-status-checked`, rather than every
affected component flipping to `unknown` for a pass. A repository GitHub cannot find writes
nothing, and a missing GitHub token is warned about once per owner rather than
written as `unknown`. The release verdict in `giantswarm.io/readiness` is not
touched.

`gs-common` exports `BuildReadinessFlags` / `buildReadinessFlagNames` next to the
release flags, so the frontend can attribute the flag to the build rather than
to the release or to chart metadata. `TtlCache` moves to
`catalog-backend-module-gs/src/util` and is shared by both processors.
