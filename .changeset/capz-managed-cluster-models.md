---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add the `AzureASOManagedControlPlane` and `AzureASOManagedCluster` models for
CAPZ managed (AKS) clusters.

`@giantswarm/k8s-types` does not ship the CAPZ managed CRDs, so both models
type only the fields the plugins read. `AzureASOManagedControlPlane.getK8sVersion()`
reads `spec.version`, as `ControlPlane.getK8sVersion()` does for a
`KubeadmControlPlane`. `AzureASOManagedCluster.getLocation()` reads the
location of the ASO `ResourceGroup` embedded in `spec.resources`, since the
managed cluster has no `spec.location` of its own.
