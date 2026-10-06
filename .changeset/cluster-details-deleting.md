---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Handle a cluster in the Deleting state on the cluster details page. The page
says the cluster is being deleted and since when, and it no longer reports
related resources that are already gone (a control plane, provider cluster or
node pool not found) as errors, neither in the error panel nor as error icons
in the About card. Other errors, such as missing permissions, are still shown.
A cluster being deleted whose App is already gone opens from its Cluster
resource instead of failing with a not-found error. While the deletion runs,
the page re-reads the cluster every 10 seconds, and shows "Cluster not found"
once it is gone. **Delete** is no longer offered on a cluster already being
deleted.

- `gs`: `ClusterPageTarget` has `isDeleting`.
- `kubernetes-react`: `ErrorsProvider` takes an `ignoreError` predicate that
  leaves matching errors out of its list, the `ErrorItem` type is exported, and
  `isNotFound(error)` tells a 404 from a plain `Error`.
