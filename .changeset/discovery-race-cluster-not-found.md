---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Stop racing resource requests against API discovery, and render a "Cluster not
found" state on the cluster details page.

During the persisted-cache restore window, enabled queries report fetchStatus
'idle', which the discovery-settled check mistook for "settled": a fallback
GVK was resolved for one render and the resource request fired alongside
discovery. On installations that don't serve the API group at all (standalone
installations without Cluster API or app-platform) that raced request is a
guaranteed 404 whose error sticks in the query cache even after discovery
correctly resolves no GVK — the cluster details page rendered it as a
permanent error banner. Discovery now only counts as settled once its queries
have produced a result, and the cluster details page shows a "Cluster not
found" empty state instead of an error when neither the Cluster nor the
cluster App exists.
