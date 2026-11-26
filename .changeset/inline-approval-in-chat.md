---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Decide muster's tool approvals in the chat: the approval page link shows the request inline with _Approve_ and _Decline_, posted through `POST /api/muster/approvals/decision` with the person's token and the digest shown. Needs muster's `approval.trustedClients` to name the portal's OAuth client.
