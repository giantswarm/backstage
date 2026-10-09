---
'@giantswarm/backstage-plugin-gs': patch
---

The deployment page's Edit button keeps the custom version range for a range with a pre-release floor and a plain upper bound, such as `>=1.0.0-0 <3.0.0`, which admits the bound's pre-releases that the fixed modes' ranges do not; and it pre-fills the fixed mode again for a deployment whose current version has a `v` prefix.
