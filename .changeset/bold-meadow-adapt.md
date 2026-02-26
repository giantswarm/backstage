---
'app': patch
---

Fix "App context is not available" and missing Grafana API errors on group entity pages. Add `@backstage/core-plugin-api` to yarn resolutions to ensure all plugins use the NFS-compatible version, and register the Grafana legacy plugin API via `ApiBlueprint` in the app module.
