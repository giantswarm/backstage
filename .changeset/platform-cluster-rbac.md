---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
---

Where `gs.features.platformSection.enabled` is set, a Platform management cluster's page has an RBAC tab (`/platform/clusters/<installation>/<namespace>/<name>/rbac`), after Node pools: the classic cluster page's RBAC tab in the shell's style, a table of the users, groups and service accounts the cluster's RoleBindings and ClusterRoleBindings grant roles, with their kind, roles and access scope, a switch that shows the system subjects, and each row opening to its bindings. A workload cluster has no such tab, and its address opens Overview. Fixture mode serves RBAC bindings for each management cluster.
