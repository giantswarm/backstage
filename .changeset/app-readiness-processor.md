---
'@giantswarm/backstage-plugin-catalog-backend-module-gs': minor
---

New `AppReadinessProcessor`: records whether a component's newest GitHub release
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
