---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Render the cluster About card for a Cluster without a control plane
reference.

A Cluster that has no `spec.controlPlaneRef` yet — one still being created, or
an imported one — made the card throw `There is no control plane reference
defined in the cluster resource.`, and the cluster overview showed an error in
its place. The card now renders, and only the Kubernetes version reads "n/a".

`ClusterSwitch` passes the infrastructure reference it checked to what it
renders, so the AWS account and AWS/Azure location fields take it as a
required prop instead of looking it up again and throwing when it is missing.
The AWS account field also no longer shows an `AWSClusterRoleIdentity` error
or incompatibility cached for another cluster when this cluster's identity is
of another kind.

In kubernetes-react, `useResource` and `useResources` no longer report API
version issues to Sentry while disabled; those come from discovery another
caller cached, and that caller reports them. `useResource` without a name is
disabled: the request would otherwise go to the list's path, and the list
would be read as if it were one resource.
