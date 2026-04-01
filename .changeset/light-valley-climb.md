---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-backend': minor
---

Add authenticated GitHub content fetching for private repositories. Helm chart README, values schema, and values YAML are now fetched through a backend endpoint that adds GitHub credentials, instead of direct unauthenticated browser fetches.
