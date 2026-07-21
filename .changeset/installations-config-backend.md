---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Serve installation configuration (`gs.installations`) from the `gs-backend`
plugin through a new authenticated endpoint, and load it in the frontend after
sign-in instead of reading it from static frontend config. The boot-time
frontend APIs (Kubernetes, discovery, auth) now obtain installation data
asynchronously from a shared source, and per-installation auth providers
initialize lazily once the main sign-in completes.
