---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Handle missing namespace in TypedLocalObjectReference for CAPI v1beta2

- Update Cluster.getInfrastructureRef() and getControlPlaneRef() to handle both v1beta1 ObjectReference and v1beta2 TypedLocalObjectReference formats
- Update ProviderCluster.getIdentityRef() with the same namespace fallback pattern
- Include apiGroup in returned refs for proper resource matching with findResourceByRef()
- When namespace is missing from a reference, fall back to the parent resource's namespace
