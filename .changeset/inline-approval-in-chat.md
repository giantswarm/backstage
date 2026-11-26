---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Decide muster's tool approvals in the chat: a link to the configured muster's approval page shows the request inline (connector, tool, every argument with muster's marking of invisible characters, the agent's reason, why it asks, when it expires; the asking agent only when it is not the session's) with _Approve_ and _Decline_. The person's click is posted through the muster backend (`POST /api/muster/approvals/decision`) to muster's decision API with the person's token and the digest of what was shown, and the chat continues at once. _Open in muster_ stays as a secondary link. Approval links no longer get a sign-in handoff or a return; the connector sign-in keeps both. Needs muster with `approval.trustedClients` naming the portal's own OAuth client.
