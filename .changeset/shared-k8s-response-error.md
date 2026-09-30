---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Explain and name every failed Kubernetes proxy request the same way.

kubernetes-react now exports `k8sResponseError`, the helper its own reads and
writes use, along with its two parts: `k8sResponseReason` (the Kubernetes
`Status` message, the Backstage proxy's error message, or the HTTP status;
`withStatus` keeps the status in front of a message) and
`k8sErrorNameForStatus` (401 `UnauthorizedError`, 403 `ForbiddenError`, 404
`NotFoundError`, 409 `ConflictError`).

The two requests that built their own errors use it now:

- The deployment picker (gs) warns when a `valuesFrom` ConfigMap or Secret
  could not be read, naming each one and why. Such a source used to look
  exactly like an empty one, so its values were silently missing from the
  configuration being edited.
- The pod lists behind the Agent Platform's KServe serving view name a 401
  `UnauthorizedError`, so an expired token is no longer retried, and quote the
  apiserver's `Status` message.
