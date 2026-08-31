---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-flux-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Degrade gracefully when an installation does not serve an optional API group.

Standalone installations legitimately run without app-platform
(`application.giantswarm.io`) or kustomize-controller
(`kustomize.toolkit.fluxcd.io`). Previously a 404 on API group discovery was
surfaced as a permanent red error banner on the Deployments pages
("Failed to discover API group … Reason: .") and a fallback list query was
sent that could only 404 again.

- API version discovery now treats a 404 on `/apis/{group}` as absence: no
  GVK is resolved for that cluster, so no list query is started and the
  resource set is simply empty. The `NotFoundError` remains visible in the
  hook's errors, so callers can still distinguish "not installed" from
  "couldn't read".
- The Deployments data provider and the Flux "blocked by" card no longer
  report `NotFoundError` through the error banner.
- Discovery error messages now fall back to the HTTP status code when the
  response carries no reason phrase (HTTP/2), instead of ending in
  "Reason: .".
