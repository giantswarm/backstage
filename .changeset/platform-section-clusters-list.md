---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Agent Platform shell has a Platform section at `/platform`, off unless `gs.features.platformSection.enabled` is set: a rail item and a page whose Clusters tab lists every cluster the person can read, with search, Environment, Organization, Status and Release filters, a column picker and sortable headers. The gs plugin exports `PlatformClustersPanel`, `PlatformClustersProvider` and `usePlatformClustersCount`, and its fixtures serve Cluster API clusters (`gsKubernetesObjectsOf`); ui-react exports `ColumnPicker` and `UnreachableInstallationsAlert`, which moved there from agent-platform unchanged but for an `actions` slot; kubernetes-react's `useClustersInfo` returns `error` and `retry`; the fixture data set has clusters.
