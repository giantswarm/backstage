---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

The frontend parses and compares versions with `@giantswarm/semver-ts` instead of npm `semver`, like the backend: `semverCompareSort`, the version filters on the Clusters and Deployments pages, the chart tag and release pickers, and the version label. Versions are read the way Flux reads them, so an incomplete version such as `1.3` now sorts as 1.3.0 instead of after every other version, and the cluster version filters no longer throw on a value that is no version. The version label shows a version as written, without a leading `v` and build metadata. The unused `compare` helper in `gs` is removed.

`semverCompareSort` takes a `descending` option that sorts newest first and still puts items without a version last, and it parses each value once per comparator.
