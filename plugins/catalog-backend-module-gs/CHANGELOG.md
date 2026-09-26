# @giantswarm/backstage-plugin-catalog-backend-module-gs

## 0.7.0

### Minor Changes

- 21ae39b: New `AppReadinessProcessor`: records whether a component's newest GitHub release
  actually reached the chart registry, as the `giantswarm.io/readiness` label
  (`releasable` / `blocked` / `unknown`) plus `giantswarm.io/readiness-flags` and
  `giantswarm.io/readiness-checked`. Off by default
  (`catalog.processors.appReadiness.enabled`).

  This is the release precondition for the HelmRelease migration: a chart that was
  never published has nothing for a HelmRelease to point at, however healthy the
  repo looks, and nothing in the devportal said so.

  - `unknown` is a first-class verdict, never a quiet `blocked`. An unresolvable
    chart, a private registry we hold no credentials for, a monorepo release
    prefix, a release tag that is not comparable semver, a release tag carrying a
    semver prerelease, a partially unreadable set of charts, or a registry lookup
    that could not be answered all yield `unknown`. A wrong `blocked` badge on
    someone else's app is worse than no badge.
  - Both blockers are confirmed by an exact-tag point lookup before they are
    published, because the tag listing is a 500-tag window that a chart with heavy
    CI churn can overflow. The lookup is three-state: only a 404 is an absence,
    and anything else reports `unknown`. `NEVER-PUBLISHED` — the stronger claim —
    is only made when the whole listing was seen; a truncated one reports
    `RELEASE-NOT-PUBLISHED`, which is true of both states.
  - Flags merge with whatever `backstage-catalog-importer` already published under
    `giantswarm.io/readiness-flags`, so the release verdict and the chart-metadata
    verdict share one list. The `giantswarm.io/readiness` label is this
    processor's alone; the importer publishes its own
    `giantswarm.io/readiness-standards`.
  - Chart tags, GitHub releases and tag confirmations are cached behind one TTL
    cache with in-flight dedup, so a repo is asked at most once per TTL rather
    than once per processing cycle. A rejected fill is not cached, so a transient
    failure retries on the next pass. `giantswarm.io/readiness-checked` carries
    the time the underlying lookup ran, not the time of the pass, so the processed
    entity is byte-stable between refreshes and the catalog engine can skip the
    write — see `cacheTtlSeconds` in `config.d.ts` for what lowering the TTL costs
    in catalog writes.
  - `getRetryDelayMs` in the shared GitHub release util now caps a retry sleep at
    60s. It returned `x-ratelimit-reset - now` uncapped, and those sleeps are
    awaited inside `preProcessEntity`, so a rate-limited 429 could park a catalog
    processing worker for an hour per attempt. `LatestReleaseProcessor` benefits
    from the same fix.

### Patch Changes

- 2c105cc: Stop transient catalog failures from filling Sentry.

  The root logger forwards every `warn` to Sentry, and Sentry fingerprints on the
  log message — so a chart name, entity ref or URL in the _message_ turns one
  fault into one issue per value. Two places here did that, and between them
  accounted for roughly 65 open issues across the customer backends and
  devportal-backend for what is really two transient upstream faults.

  `LatestOciReleaseProcessor` logged every failed tag fetch at `warn` with the
  chart ref and the full registry URL in the message, so a registry that was
  briefly unreachable produced one issue per chart. A failure the next processing
  round retries is now `info`; anything else keeps a message naming only the
  error class, with the chart and error as structured metadata.

  Catalog processing errors are now logged by this module instead of
  `@backstage/plugin-catalog-backend-module-logs`. A processing error is an
  already-handled outcome — it is stored on the entity, shown in the catalog UI,
  and retried on the next round — so transient causes (5xx, 429, socket-level
  faults, timeouts) drop to `info` — below the Sentry transport's `warn`
  threshold, but still at the default log level, so an upstream outage staling
  half the catalog stays greppable. Everything else stays at `warn` with the
  same message and metadata as upstream, so a 401 or a file that is really gone
  still surfaces, and no longer hides among the timeouts.

- 0814404: The SBOM dependency processor now only adds a `dependsOn` entry for components that actually exist in the catalog. Giant Swarm Go packages without a catalog component (e.g. archived libraries like `versionbundle`) are skipped, so they no longer appear as dangling relations ("Entities not found are: ...") on the entity page. If the catalog can't be queried, all dependencies are kept to avoid dropping real dependencies on a transient error.
- Updated dependencies [71317f9]
- Updated dependencies [21ae39b]
- Updated dependencies [85e7d8c]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [5851bba]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
  - @giantswarm/backstage-plugin-gs-node@0.4.0
  - @giantswarm/backstage-plugin-gs-common@0.22.0

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
