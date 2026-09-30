---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add the `AzureASOManagedControlPlane` and `AzureASOManagedCluster` models for
CAPZ managed (AKS) clusters, and export `CONTROL_PLANE_MODELS`,
`findControlPlaneModel` and the `AnyControlPlane` type, the list of control
plane kinds the plugins can read a Kubernetes version from.

`@giantswarm/k8s-types` does not ship the CAPZ managed CRDs, so both models
type only the fields the plugins read. `AzureASOManagedControlPlane.getK8sVersion()`
reads `spec.version`, as `ControlPlane.getK8sVersion()` does for a
`KubeadmControlPlane`, and falls back to the observed `status.version` when
the spec has no version. `AzureASOManagedCluster.getLocation()` reads the
location of the ASO `ResourceGroup` embedded in `spec.resources`, since the
managed cluster has no `spec.location` of its own; without a resource group
location the location is unknown.
