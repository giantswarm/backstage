---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': patch
---

Where `gs.features.platformSection.enabled` is set and the installation has Mimir, a Platform cluster's page has a Gateways tab (`/platform/clusters/<installation>/<namespace>/<name>/gateways`), after Node pools: a table of the cluster's Gateway API Gateways with one status each, one selected (`?gateway=<namespace>/<name>`, the first by default) with its listeners, HTTP routes and Envoy Gateway policies below, the routes and policies no Gateway takes in a section of their own, and a finder that finds a Gateway by a hostname, route, backend or policy on it. Without Mimir there is no such tab, and its address opens Overview. Fixture mode serves three Gateways per ready workload cluster, one of them not programmed, and a route on two Gateways.
