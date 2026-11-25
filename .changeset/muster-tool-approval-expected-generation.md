---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

Saving a connector's tool settings sends muster's `expectedGeneration` where `core_mcpserver_set_approval` takes it: the generation of the read right before the save, so muster refuses a write over a change made in between, which the Test & Tools step shows as a conflict with the current settings. muster-backend answers that refusal 422.
