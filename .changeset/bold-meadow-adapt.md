---
'app': patch
---

Fix "App context is not available" error on group entity pages by adding `@backstage/core-plugin-api` to yarn resolutions, ensuring all plugins use the NFS-compatible version.
