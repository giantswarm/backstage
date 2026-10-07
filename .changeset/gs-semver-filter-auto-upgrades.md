---
'@giantswarm/backstage-plugin-gs': patch
---

Deployment page: **Automatic upgrades** reads the OCIRepository's `spec.ref.semverFilter` along with `spec.ref.semver`. The release stages of the SemVer automatic upgrades guide show as "Dev builds only", "Release candidates only" and "Release candidates or stable" instead of "Any"; any other filter shows as its regular expression. The **Edit** button passes the filter to the edit template with the mode and the chart version.
