---
'@giantswarm/backstage-plugin-muster': patch
---

`MusterTokenMintError` and `isSessionExpiredError` are exported from the plugin
root, so another plugin can tell an expired portal session from a server it has
no grant for.
