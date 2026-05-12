---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
---

Add `LatestReleaseProcessor` that annotates Component entities carrying a `github.com/project-slug` annotation with `giantswarm.io/latest-release-tag` and `giantswarm.io/latest-release-date` by querying GitHub Releases. Defaults to `/releases/latest`, or matches by tag prefix when `giantswarm.io/release-tag-prefix` is set (for monorepos with prefixed per-subproject tags). Results are cached in-memory per `(owner/repo, prefix)` with a configurable TTL. Gated behind `catalog.processors.latestRelease.enabled`.
