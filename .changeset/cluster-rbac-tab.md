---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': minor
---

Add an **RBAC tab** to the cluster details page, giving customers an overview of
who can do what in a cluster.

The tab groups every RoleBinding and ClusterRoleBinding by subject, so each row
is one user, group or service account with the roles it holds and where they
apply (cluster-wide and/or per namespace). Expanding a row lists the individual
bindings behind the summary. Subjects whose name starts with `system:` (or whose
service-account namespace starts with `kube-`) are hidden behind a "Show system
subjects" toggle, so the Kubernetes control-plane plumbing does not drown out
the grants customers actually manage. The table's filter box searches subjects,
roles and scopes.

The tab only appears on **management cluster** pages: Backstage's Kubernetes
access terminates at the management clusters, so a workload cluster's own RBAC
(which lives inside the workload cluster) is not reachable — showing the
management cluster's bindings on a workload cluster page would be wrong rather
than helpful. Listing role bindings cluster-wide also requires read access the
viewer may not have; a denied request surfaces as the usual errors banner plus
an empty-state message that names permissions as a likely cause.

`kubernetes-react` gains `RoleBinding`, `ClusterRoleBinding`, `Role` and
`ClusterRole` resource classes (`rbac.authorization.k8s.io/v1`) with
`RbacSubject`/`RbacRoleRef`/`RbacPolicyRule` types. `Role`/`ClusterRole` are not
fetched by the tab yet — they are there for the natural next step of showing a
role's rules.
