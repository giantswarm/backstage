---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Explain and name every failed Kubernetes proxy request the same way.

kubernetes-react now exports `k8sResponseError`, the helper its own reads and
writes use, along with its two parts: `k8sResponseReason` (the Kubernetes
`Status` message, the Backstage proxy's error message, or the HTTP status) and
`k8sErrorNameForStatus` (401 `UnauthorizedError`, 403 `ForbiddenError`, 404
`NotFoundError`, 409 `ConflictError`).

The three requests that built their own errors use it now:

- The deployment picker's ConfigMap and Secret reads (gs) said
  `Failed to fetch Secret my-values: ` with nothing after the colon when the
  response had no reason phrase, and left a 401 or 403 unnamed.
- The pod lists behind the Agent Platform's KServe serving view name a 401
  `UnauthorizedError`, so an expired token is no longer retried, and quote the
  apiserver's `Status` message.
- The installation inventory probe (gs) quotes the apiserver's `Status`
  message, e.g. which RBAC rule refused `/apis`, instead of only the HTTP
  status. It keeps naming a 503 `ServiceUnavailableError`.
