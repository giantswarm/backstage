---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The Capabilities tab knows the Action states `reverted` and `withdrawn`: a reverted action reads *Reverted* under the *not in sync* mark, with the reverting pull request linked on its record; a withdrawn action reads *Withdrawn*, with who withdrew it and why. `denied` now reads *Denied* and `removed` *Removed*, so no two of an action's states share a word.
