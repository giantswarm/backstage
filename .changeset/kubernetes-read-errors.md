---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Explain failed Kubernetes reads instead of ending them in `Reason: .`.

Resource, list, access-review and API discovery errors were built from the
response's reason phrase alone, which HTTP/2 and proxied responses leave empty.
They now quote the Kubernetes `Status` message when the response has one, and
the HTTP status (`HTTP 404`) otherwise. `getErrorMessage` reports a 404 as "not
found" and no longer prints `namespace "undefined"` for cluster-scoped
resources.

A 401 is now named `UnauthorizedError`, so the plugins' query clients stop
retrying an expired token three times before showing the error.

`useResource` and `useResources` with `enabled: false` no longer run API
discovery, so a disabled query sends no requests, doesn't report as loading,
and reports no API version issues to Sentry.
