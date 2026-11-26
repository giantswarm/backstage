---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

Saving tool settings sends `expectedGeneration` where muster takes it; a conflict shows in the step and muster-backend answers 422.
