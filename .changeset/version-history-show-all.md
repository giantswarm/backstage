---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-node': patch
---

The Version History card and tab list only stable releases by default. A "Show all" switch brings back release candidates and dev builds. Stable means a semantic version without a pre-release part, parsed the way Flux does (`isStableVersion` in `gs-common`, built on `@giantswarm/semver-ts`); the registry's latest stable version uses the same rule.

`ContainerRegistryService.getTags` without a `limit` now follows the registry's pagination (`Link: rel="next"`), so the version history lists every tag instead of the 100 most recent ones ACR returns on its first page. With a `limit` it still fetches a single page.
