---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-flux-react': patch
---

Where `gs.features.platformSection.enabled` is set, each row of the Platform section's clusters list opens the cluster's page at `/platform/clusters/<installation>/<namespace>/<name>`: its state, facts and tool links, and an Overview tab with its release and Kubernetes version, friendly labels and annotations, GitOps source, login command and technical details. The gs plugin exports `PlatformClusterRoute`, `PlatformLinksProvider` and the `PlatformLinks` type; the classic cluster page's readers take an address (`useCluster`, `ClusterProvider`), unchanged in what they read. The fixture clusters have an App each and, for the GitOps-managed ones, a Flux Kustomization and GitRepository. Coming back from a cluster's page, the list is as it was left, without reading the clusters again. The Flux resources table keeps its Source Cluster, Target Cluster and Status Details headers on one line.
