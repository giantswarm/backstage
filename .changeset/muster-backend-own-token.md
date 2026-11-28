---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

The muster backend forwards only the signed-in person's own token (403 otherwise) and sends the portal's workload token only to `muster.workloadInstallation`; other installations get no inline approval or handoff.
