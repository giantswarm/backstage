---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

CPU counts read "CPU" instead of "vCPU" or "vCPUs": the clusters' worker capacity, machine type tooltips, the Karpenter node pool requirement label, and the GPU node pool sizes. The reasons cluster-manager gives keep its own wording.
