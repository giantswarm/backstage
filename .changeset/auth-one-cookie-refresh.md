---
'@giantswarm/backstage-plugin-gs': patch
---

A provider's sign-in is refreshed one request at a time: concurrent refreshes near a token's expiry no longer refuse each other's rotated cookie and end the session with a Login Required dialog.
