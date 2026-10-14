---
'@giantswarm/backstage-plugin-muster-backend': patch
---

Refuse agent-manager tool calls (`x_agent-manager_*`) with a 403 on a muster installation configured without an `authProvider`, instead of running them under muster's shared identity.
