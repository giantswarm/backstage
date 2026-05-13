---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
---

Add `KlausProvider`, a catalog entity provider that discovers Klaus personalities, toolchains, and plugins from GitHub and emits one Component entity per item. Configured under `catalog.providers.klaus.<instanceId>`; each instance specifies optional `personalities`, `toolchains`, and `plugins` sources (each with `sourceRepository` GitHub URL and `ociRepository` OCI URL), plus required `owner` and optional `system`, `namespace`, `namePostfix`, `titlePostfix`, and `tags`. Multiple instances (e.g. `public` and `internal`) are supported; the provider resolves personality → toolchain/plugin `dependsOn` references across instances using each matched instance's namespace.
