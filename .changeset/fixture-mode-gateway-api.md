---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-common': minor
---

Fixture mode serves the Gateway API and Envoy Gateway series of the fixture clusters, outside production builds only, so a cluster's Gateways tab shows its Gateway, listeners, routes, backends and policies without an observability stack. Every workload cluster has the bundle's Gateway and routes in each state the tab shows (an uneven split, a backend the route may not reference, a route without status, a route a ListenerSet rejects, a rule with three backends, a redirect); every third one runs older bundles, without the route conditions, policy status and backends; the management cluster has none. `many` gives the first cluster 150 routes, `long-names` names them as long as a Kubernetes name may be. `@giantswarm/backstage-plugin-gs-common/fixtures` exports `gatewayApiSeries` and `gatewayApiSeriesOf`.
