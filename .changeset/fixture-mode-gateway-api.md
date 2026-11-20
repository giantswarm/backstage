---
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-common': minor
---

Fixture mode serves the Gateway API and Envoy Gateway series of the fixture clusters, outside production builds only, so a cluster's Gateways tab shows its Gateway, listeners, routes, backends and policies without an observability stack. Every ready workload cluster has the bundle's Gateway and routes in each state the tab shows (an uneven split, a backend the route may not reference, a route without status, a route a ListenerSet rejects, a rule with three backends, a redirect); every third ready one runs older bundles, without the route conditions, policy status and backends; the management cluster and clusters being created or deleted have none. `many` gives the first ready workload cluster 150 routes; on a cluster with a name of 60 characters or more, `long-names` gives the routes, their namespaces and backends, and the policies on those routes names of up to 63 characters. `@giantswarm/backstage-plugin-gs-common/fixtures` exports `gatewayApiSeries` and `gatewayApiSeriesOf`.
