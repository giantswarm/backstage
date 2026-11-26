---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

The muster backend presents only the signed-in person's own token to muster's decision API and handoff endpoint: `/approvals/view`, `/approvals/decision` and `/handoff` refuse (403, logged without the token) a forwarded token whose identity is not the Backstage user's, by the mapping the portal's sign-in applies (now `oidcIdentity` in gs-node, shared with the sign-in resolver). The portal's workload token goes only to the muster of its own installation (`muster.workloadInstallation`, else the home installation, else the only one); for any other installation the approval routes refuse without asking its muster and `/handoff` answers no ticket.
