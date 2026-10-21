---
'@giantswarm/backstage-plugin-gs-node': patch
---

A page polling a muster server's tools while the person holds no grant for it no longer spends their muster sign-ins: muster's `auth_required` answer is reused per person and server until the person signs in or the link lapses, and reaches the browser as a 401 carrying the server and sign-in link instead of a 500.
