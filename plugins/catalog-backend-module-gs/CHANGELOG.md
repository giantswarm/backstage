# @giantswarm/backstage-plugin-catalog-backend-module-gs

## 0.6.1

### Patch Changes

- Updated dependencies [c117a5e]
  - @giantswarm/backstage-plugin-gs-node@0.3.0

## 0.6.0

### Minor Changes

- 610ead0: Add `LatestOciReleaseProcessor` that annotates `Component` entities carrying `giantswarm.io/helmcharts` with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` from the referenced OCI registry. For multi-chart entities the highest-semver stable tag wins; prerelease tags are skipped. Toggle via `catalog.processors.latestOciRelease.enabled`.

  Introduce a new `@giantswarm/backstage-plugin-gs-node` node-library package and move the container-registry client code (`ContainerRegistryService`, `AcrRegistryClient`, `OciRegistryClient`, `RegistryAuthClient`, `RegistryError`, registry utils, and `containerRegistryServiceRef`) into it so it can be shared between `gs-backend` and the catalog module. Move `parseChartRef` from `plugins/gs` to `gs-common` so it can be used backend-side.

### Patch Changes

- Updated dependencies [610ead0]
  - @giantswarm/backstage-plugin-gs-node@0.2.0
  - @giantswarm/backstage-plugin-gs-common@0.21.1

## 0.5.1

### Patch Changes

- 5195cc0: Fall back to PAT or unauthenticated requests when the configured GitHub App has no access to a repo. Previously `LatestReleaseProcessor` and `SbomDependencyProcessor` failed with "No GitHub credentials" / "App does not have access to repository" for any repo not in the App's installation. They now try the credentials provider first, fall back to the integration's `token:` (PAT) when it throws or returns no token, and finally fall back to unauthenticated requests so public repos still work without any integration configured.

## 0.5.0

### Minor Changes

- 4db80ca: Add `LatestReleaseProcessor` that annotates Component entities carrying a `github.com/project-slug` annotation with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` by querying GitHub Releases. Defaults to `/releases/latest`, or matches by tag prefix when `giantswarm.io/release-tag-prefix` is set (for monorepos with prefixed per-subproject tags). Results are cached in-memory per `(owner/repo, prefix)` with a configurable TTL. Gated behind `catalog.processors.latestRelease.enabled`.
- 2a4a2bf: Add `KlausProvider`, a catalog entity provider that discovers Klaus personalities, toolchains, and plugins from GitHub and emits one Component entity per item. Configured under `catalog.providers.klaus.<instanceId>`; each instance specifies optional `personalities`, `toolchains`, and `plugins` sources (each with `sourceRepository` GitHub URL and `ociRepository` OCI URL), plus required `owner` and optional `system`, `namespace`, `namePostfix`, `titlePostfix`, and `tags`. Multiple instances (e.g. `public` and `internal`) are supported; the provider resolves personality → toolchain/plugin `dependsOn` references across instances using each matched instance's namespace.

### Patch Changes

- 2a4a2bf: Drop unused `giantswarm.io/klaus-personality-toolchain` and `giantswarm.io/klaus-personality-plugins` annotations from Klaus personality entities.

## 0.4.0

### Minor Changes

- ac09102: Add PagerDuty integration: "Who is on call" entity card, catalog processor that auto-annotates entities with PagerDuty IDs, and MCP action to resolve PagerDuty IDs from catalog entities.

## 0.3.0

### Minor Changes

- 49642b6: Add custom processor for dependency relationships between components

## 0.2.1

### Patch Changes

- 7bcefbc: Fix scaffolder template fetch failing for entities registered via `giantswarm` location type by emitting `url` as the entity location type instead of `giantswarm`.

## 0.2.0

### Minor Changes

- 8d3e632: Add GiantSwarmLocationProcessor to handle "giantswarm" catalog location type, assigning the giantswarm namespace to entities from GS-sourced locations.

## 0.1.0

### Minor Changes

- Initial release. Add DefaultNamespaceProcessor that assigns a configurable namespace to catalog entities based on their source location URL.
