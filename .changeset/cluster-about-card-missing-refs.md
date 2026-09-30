---
'@giantswarm/backstage-plugin-gs': patch
---

Render the cluster About card for a Cluster without a control plane
reference.

A Cluster that has no `spec.controlPlaneRef` yet — one still being created, or
an imported one — made the card throw `There is no control plane reference
defined in the cluster resource.`, and the cluster overview showed an error in
its place. The card now renders, and only the Kubernetes version reads "n/a".

The AWS account and the AWS/Azure location fields handle a missing
`spec.infrastructureRef` the same way instead of throwing. They are only
rendered once that reference is known, so this changes nothing visible today.
The AWS account field also no longer shows a cached `AWSClusterRoleIdentity`
incompatibility for a cluster whose identity is of another kind.
