---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-common': minor
---

A cluster's Gateways tab lists the cluster's Gateway API ReferenceGrants: each grant's namespace, the kinds and namespaces that may reference into it (From), and the resources they may reference there (To): one named resource, or any resource of a kind. A kind outside the core and Gateway API groups names its group. They load on their own, so they stay shown when the Gateway API topology fails to load, and at phone width they stack. The data comes from the `gatewayapi_referencegrant_*` metrics, which observability-bundle exports since 3.3.0. gs-common adds the `GatewayApiReferencegrantCreated`, `GatewayApiReferencegrantFromInfo` and `GatewayApiReferencegrantToInfo` metrics, and fixture mode serves the ReferenceGrants of the fixture routes.
