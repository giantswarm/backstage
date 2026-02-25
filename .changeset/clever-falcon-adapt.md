---
'app': minor
---

Migrate app-level APIs from legacy createApiFactory to NFS ApiBlueprint modules. All 7 core API overrides (error reporter, analytics, discovery, fetch, SCM integrations, SCM auth, GitHub auth) are now registered via `createFrontendModule({ pluginId: 'app' })` in `appModules.tsx`, replacing the legacy `apis.ts`.
