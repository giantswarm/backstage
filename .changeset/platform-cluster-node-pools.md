---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
---

Where `gs.features.platformSection.enabled` is set, a Platform cluster's page has a Node pools tab (`/platform/clusters/<installation>/<namespace>/<name>/node-pools`) with the number of pools on it: a row per AWS machine pool, Karpenter pool or Azure machine pool, with nodes ready, machines, zones, scaling and age. Selecting a pool (`?name=<pool>`, as on the classic page) shows its nodes with their CPU and memory requests and pods, for a machine pool, and its technical details, read as the classic cluster page reads them. The facts column is on Overview only. The classic page's Karpenter node template gives the root volume in GiB. Fixture mode serves Karpenter and Azure node pools, every pool's nodes and their Mimir series, and narrows Kubernetes lists by their label selector.
