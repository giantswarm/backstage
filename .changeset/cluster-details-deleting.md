---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Handle a cluster in the Deleting state on the cluster details page. The page
says the cluster is being deleted and since when, and it no longer reports
related resources that are already gone (a control plane, provider cluster or
node pool not found) as errors. Other errors, such as missing permissions, are
still shown. A cluster being deleted whose App is already gone opens from
its Cluster resource instead of failing with a not-found error.

- `kubernetes-react`: `ErrorsProvider` takes an `ignoreError` predicate that
  leaves matching errors out of its list, and the `ErrorItem` type is exported.
