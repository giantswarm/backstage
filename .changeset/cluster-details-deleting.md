---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Handle a cluster in the Deleting state on the cluster details page. The page
says the cluster is being deleted and since when, and it no longer reports
objects the deletion already removed (a control plane, provider cluster, AWS
identity or node pool not found) as errors, neither in the error panel nor as
error icons in the About card. Other errors, such as missing permissions or an
API the installation does not serve, are still shown. A cluster being deleted
whose App or HelmRelease is already gone opens from its Cluster resource
instead of failing with a not-found error. While the deletion runs, the page
re-reads everything it shows every 10 seconds and shows "Cluster not found"
once the cluster is gone; a re-read that fails for another reason keeps the
cluster on the page and says why. A live cluster is re-read every minute, so a
deletion that starts while the page is open is noticed. **Delete** is no longer
offered on a cluster already being deleted, and a Delete dialog left open stays
open through the deletion, for its **Finish removal** step.

- `gs`: `ClusterPageTarget` has `isDeleting`.
- `kubernetes-react`: `ErrorsProvider` takes an `ignoreError` predicate that
  leaves matching errors out of its list, the `ErrorItem` type is exported,
  `k8sResponseError` names the object a 404 did not find (`notFoundName`), and
  `isObjectNotFound(error)` tells such a 404 from one for an API path the
  apiserver does not serve.
