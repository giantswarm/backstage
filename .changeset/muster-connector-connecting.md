---
'@giantswarm/backstage-plugin-muster': patch
---

A connector muster still connects with the person's portal sign-in reads
"Connecting" on the Connectors tab instead of its server state, and the
sign-in status is re-read every 2 seconds until the connect settles, so the
page shows the connected server without a reload.
