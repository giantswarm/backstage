---
'@giantswarm/backstage-plugin-gs': patch
---

Show the Kubernetes version, the provider and the location of an AKS cluster.

The cluster details page showed "n/a" for the Kubernetes version and the
provider of a cluster created with `cluster-aks`, and the clusters list left
the same columns empty. Three gaps caused this: the `cluster-aks` app label
was not mapped to a provider; the `AzureASOManagedControlPlane` a CAPZ managed
cluster references had no model, so the version was never read; and the
`AzureASOManagedCluster` infrastructure kind was unknown to the location
lookup.

The About card and the clusters list now read the version from the
`AzureASOManagedControlPlane`, the location from the `AzureASOManagedCluster`,
and show the Azure provider for `cluster-aks` clusters. A control plane kind
that still has no model (an EKS cluster's `AWSManagedControlPlane`) is left
alone as before: no request, no error, version not available.
