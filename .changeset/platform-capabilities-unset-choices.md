---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

Capabilities tab: the choices not on record are named. The card lists every choice of the person the manager finds without a value (`inputs.unset` of the comparison) on one line by its label — qualified with its group where two choices of the definition share one, as _Grafana domain_ next to _Portal domain_ — instead of counting them, so a platform engineer sees which choices a portal's record lacks and whether the record could ever answer them. Needs a giantswarm-platform-manager that answers `inputs.unset`; the chosen values are listed as before.
