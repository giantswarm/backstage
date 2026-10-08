---
'@giantswarm/backstage-plugin-gs': patch
---

Deployment page: **Auto-upgrade** reads the OCIRepository's `spec.ref.semverFilter` and whether its `spec.ref.semver` admits pre-releases along with the range. The release stages of the SemVer automatic upgrades guide show as "Dev builds only", "Release candidates only" and "Release candidates or stable" instead of "Any", a stage whose range admits no pre-release is flagged, any other filter shows as its regular expression, and a pre-release range without a filter reads "Any, including pre-releases". The **Edit** button passes the filter and the pre-release admission to the edit template with the mode and the chart version.
