---
'@giantswarm/backstage-plugin-gs': patch
---

A provider's sign-in cookie is changed by one request at a time, across the portal's tabs: concurrent refreshes near a token's expiry no longer refuse each other's rotated cookie and end the session with a Login Required dialog.
