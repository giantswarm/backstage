---
'@giantswarm/backstage-plugin-gs': patch
---

Stop the cluster details page from fetching a `KubeadmControlPlane` for
clusters that do not have one.

The About card resolved every cluster's `spec.controlPlaneRef` by name only
and always requested it from the `kubeadmcontrolplanes` endpoint. For a
managed control plane — an AKS cluster references an
`AzureASOManagedControlPlane`, an EKS cluster an `AWSManagedControlPlane` —
that request can only 404, and the page showed an error banner
(`Failed to fetch resources from <installation> at
/apis/controlplane.cluster.x-k8s.io/v1beta2/namespaces/<ns>/kubeadmcontrolplanes/<name>/.
Reason: .`) for a perfectly healthy cluster.

The card now checks the ref's kind and API group first. When the ref is not
a `KubeadmControlPlane`, the request is skipped, no error is shown, and the
Kubernetes version reads "not available" until the portal learns to read
managed control planes.
