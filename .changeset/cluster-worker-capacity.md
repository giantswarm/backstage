---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Clusters show their worker capacity. The cluster About card gains a **Worker capacity** field ("12 nodes · 48 vCPUs · 192 GiB RAM"), and the Clusters table gains optional, sortable **Worker CPU** and **Worker memory** columns. Capacity is the ready worker nodes of each node pool times its machine size: the instance type on AWS, the VM size on Azure, the machine template's CPUs and memory on vSphere. Pools without a fixed size (Karpenter, AKS, VCD) take the capacity their ready nodes report in Mimir. A pool counted by neither is named in a hint next to the figure, with the reason.

`kubernetes-react` adds the `VSphereMachineTemplate` resource class. `ui-react` adds `numberCompareSort`, a table comparator that sorts items without a number last.
