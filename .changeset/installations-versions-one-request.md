---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-backend': minor
---

The Installations page reads the Kubernetes version and release of every management cluster in one request (`GET /api/gs/installations/versions`): the backend asks all installations at once as the signed-in person and keeps each answer for five minutes, so both columns fill together within the slowest installation's answer instead of one queued request after another.
