---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
---

The HTTPRoutes table on a cluster's Gateways tab shows the backends of each route, with the namespace when it differs from the route's and the weights of an uneven traffic split, and the search finds routes by backend name. The data comes from the `gatewayapi_httproute_rule_backend_info` metric of the Gateway API bundle, which exports the first three backends of each rule. On clusters with an older bundle the column says the backends are not available. gs-common adds the `GatewayApiHttprouteRuleBackendInfo` metric.
