---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Show node pool configuration alongside node metrics on a cluster's "Node pools"
tab, which previously only answered how a pool was doing and never what it is.

- Selecting a node pool now opens a tabbed details section: **Configuration**
  (shown first) and **Nodes**, the latter being the existing per-node metrics
  table. The active tab lives in the URL next to the pool name
  (`?name=<pool>&tab=<tab>`), so a specific pool's configuration is linkable.
  Closing the section clears both parameters, and an unrecognised `tab` value
  falls back to Configuration rather than rendering an empty section.
- For **Karpenter** node pools the Configuration tab reads the
  `KarpenterMachinePool`, which inlines the upstream Karpenter `NodePool` and
  `EC2NodeClass` specs: allowed capacity types (spot/on-demand), architectures,
  instance families and types, zones and any other requirements; provisioning
  limits and weight; consolidation policy, expiry, termination grace period and
  disruption budgets; and AMI family, AMI alias, root volume and IAM role. This
  data was already being fetched and discarded — the row only ever used it to
  print the word "Karpenter".
- Because a Karpenter pool is a set of constraints rather than a fixed shape,
  each of the headline constraints is shown as what the configuration _allows_
  next to what is _actually running_ — e.g. "14 spot · 2 on-demand" — read from
  Karpenter's own metrics, which carry `capacity_type`, `arch` and instance
  labels that `kube_node_labels` does not. Limits render as usage against the
  ceiling, with the pool's current disruption headroom beside its budgets.
  The whole running side is additive: when Karpenter's metrics are unavailable,
  or a pool has no nodes yet, the configuration still renders in full and the
  running lines are omitted rather than shown as zero.
- The **Scaling** column now shows a Karpenter pool's actual CPU/memory limits
  (or "Unlimited") in place of the uninformative literal "Karpenter-managed".
- AWS autoscaling-group and Azure node pools get the same tabbed section with a
  correspondingly briefer Configuration tab, so the section behaves consistently
  whichever row is selected.
- An AWS installation that does not serve the Karpenter CRD no longer raises an
  error banner on this tab; a 404 there is a legitimate installation shape, not
  a fault.
- `kubernetes-react`: `KarpenterMachinePool` gains configuration accessors
  (requirements, limits, weight, disruption and budgets, expiry, taints, node
  labels, AMI family and selector terms, block device mappings, kubelet,
  metadata options, IAM role, provider IDs, status conditions) plus exported
  types for the inlined `NodePool` and `EC2NodeClass` specs.
