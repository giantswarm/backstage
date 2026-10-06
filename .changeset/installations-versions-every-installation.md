---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-backend': patch
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

The Installations page shows every installation's versions again. The backend reads only the installations it can read as the signed-in person (the main installation, the ones the cluster token broker covers, the ones the Kubernetes plugin authenticates to itself) within one 15-second deadline per installation, and leaves the others (their own OIDC sign-in, a `backendUrl` override) to the browser, as before. An expired session shows "Not signed in", a failed read a short status with the details on hover, and the answer is no longer persisted to the browser's storage, where the next person to sign in on the same browser saw it. The subject token header and the endpoint's types live in `gs-common`.
