---
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Enhance Flux details panel with additional metadata

- Add creation timestamp, interval, and resource-specific metadata to details panel and list view
- Extract `findHelmReleaseChartName` utility into flux-react for shared use
- Add convenience accessors to HelmRelease, GitRepository, OCIRepository, and HelmRepository resource classes
