---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Where `gs.features.platformSection.enabled` is set, a Platform cluster's page has a Node pools tab (`/platform/clusters/<installation>/<namespace>/<name>/node-pools`) with the number of pools on it: a row per AWS machine pool, Karpenter pool or Azure machine pool, with nodes ready, machines, zones, scaling and age. Selecting a pool (`?name=<pool>`, as on the classic page) shows its nodes with their CPU and memory requests and pods, for a machine pool, and its technical details, read as the classic cluster page reads them. The facts column is on Overview only. On the classic cluster page, the Karpenter node template gives the root volume in GiB, and the nodes table its CPU and memory as the rest of the portal does ("9.1 GiB", not "9.1 Gi"). kubernetes-react's `MachineDeployment` has `getAutoscalerRange()`. Fixture mode serves Karpenter and Azure node pools, every pool's nodes and their Mimir series, and narrows Kubernetes lists by their label selector.
