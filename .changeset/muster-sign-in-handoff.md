---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Open muster's approval page and connector sign-in start from the chat without signing in to muster again: the muster backend asks muster, with the person's token, for a one-time sign-in handoff ticket (`POST /handoff`, muster's `POST /handoff-tickets`) and the link carries it as `handoff`. A link to one of the configured muster's own pages opens at once in a new tab after _Open_, without the extra consent dialog; links to any other origin keep the dialog. Without a ticket (muster without `approval.handoffClients`, an older muster) the page asks for muster's own sign-in as before.
