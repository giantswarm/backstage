---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
---

Add unified `KlausProvider` that emits catalog entities for Klaus personalities, toolchains, and plugins from a single configurable provider. Replaces the previous `KlausPersonalitiesProvider` and `KlausToolchainsProvider` (both unreleased on this branch). Configuration moves under `catalog.providers.klaus.<instanceId>`; each instance specifies optional `personalities`, `toolchains`, and `plugins` sources via `sourceRepository` (GitHub URL) and `ociRepository` (OCI URL), plus `owner` (required, as Backstage's `Component` kind requires `spec.owner`), and optional `system`, `namespace`, `namePostfix`, `titlePostfix`, and `tags`. Multiple instances (e.g. `public` and `internal`) are supported; the provider resolves personality → toolchain/plugin `dependsOn` references across instances (using the matched instance's namespace).
