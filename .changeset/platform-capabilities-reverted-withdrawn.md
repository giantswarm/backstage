---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The Capabilities tab knows the Action states `reverted` and `withdrawn`: a reverted action reads _Reverted_ under the _not in sync_ mark, with the reverting pull request linked on its record; a withdrawn action reads _Withdrawn_, with who withdrew it and why. `denied` now reads _Denied_ and `removed` _Removed_, so no two of an action's states share a word.
