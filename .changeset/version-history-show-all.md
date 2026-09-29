---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-catalog-backend-module-gs': patch
---

The Version History card and tab list only stable releases by default. A "Show all" switch brings back release candidates and dev builds. Stable means a semantic version without a pre-release part (`isStableVersion` in `gs-common`).

The backend parses and compares versions with `@giantswarm/semver-ts` instead of npm `semver`, so tags are read the way Flux reads them (Masterminds/semver): `sortVersions` in `gs-node` now also drops tags that are no version, and accepts incomplete ones such as `1.2`. GitHub release tags in the app readiness check are still parsed strictly, so a date-named release is not mistaken for a version.

`ContainerRegistryService.getTags` without a `limit` now follows the registry's pagination (`Link: rel="next"`), so the version history lists every tag instead of the 100 most recent ones ACR returns on its first page. With a `limit` it still fetches a single page.
