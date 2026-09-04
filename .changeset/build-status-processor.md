---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
---

New `BuildStatusProcessor`: records whether a component's default branch
builds, as the `giantswarm.io/build-status` label (`passing` / `failing` /
`unknown`), the confirmed failing checks in `giantswarm.io/build-failing-checks`,
the branch in `giantswarm.io/default-branch`, and `BUILD-RED` merged into
`giantswarm.io/readiness-flags` when failing. Off by default
(`catalog.processors.buildStatus.enabled`).

GitHub hangs commit statuses off a SHA, so a red from a branch cut off main, a
merge-queue branch or a tag shows up on main. Each failing status is therefore
resolved through the CircleCI build behind it and counted only when that build
really ran on the default branch and really reached a verdict — a canceled build
is superseded, not failed. A red that cannot be resolved is `unknown`, never
`failing` and never `passing`. The release verdict in `giantswarm.io/readiness`
is not touched.

`gs-common` exports `BuildReadinessFlags` / `buildReadinessFlagNames` next to the
release flags, so the frontend can attribute the flag to the build rather than
to the release or to chart metadata. `TtlCache` moves to
`catalog-backend-module-gs/src/util` and is shared by both processors.
