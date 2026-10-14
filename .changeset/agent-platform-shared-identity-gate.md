---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Withhold Create, Edit, Update skills, Delete and Start session, and leave the agent out of every session picker, on an installation whose muster has no per-user sign-in in this portal (`requiresAuth: false`), lists no agent-manager, or could not be asked; each place says why instead of offering an action that ends in a 403.
