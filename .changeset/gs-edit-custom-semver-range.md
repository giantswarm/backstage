---
'@giantswarm/backstage-plugin-gs': patch
---

Deployment page: the **Edit** button pre-fills the edit template's custom version range mode with the OCIRepository's `spec.ref.semver` when the fixed modes would not write that range back as it is (`~`, `^` or `>=` followed by the chart version, with a `-0` floor for pre-releases). A range with an upper bound (`>=1.0.0 <3.0.0`) or a pre-release floor below the current version (`>=0.0.0-0`) now survives an unchanged edit.
