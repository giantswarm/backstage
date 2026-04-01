---
'@giantswarm/backstage-plugin-gs-backend': patch
---

Fix AI chat `get-helm-chart-values` tool failing with 500 for private OCI registries by authenticating GitHub URL fetches using Backstage's GitHub integration credentials.
