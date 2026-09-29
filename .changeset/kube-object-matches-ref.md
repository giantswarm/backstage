---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add `KubeObject.matchesRef` and `refMatchesResource`, one shared answer to
"does this reference point at this resource?".

A `spec.controlPlaneRef` or `spec.infrastructureRef` comes in two shapes:
`ObjectReference` with an `apiVersion`, or `TypedLocalObjectReference` with
an `apiGroup`. The static `Model.matchesRef(ref)` and the instance
`resource.matchesRef(ref)` compare the kind and the API group and ignore the
version suffix, so a v1beta1 ref matches a resource read at v1beta2. Core
resources are matched on the exact `apiVersion`. The pure
`refMatchesResource(ref, identity)` and `getApiGroupFromVersion` are
exported for callers without a model class.

`useResource` with `{ enabled: false }` is now quiet all the way down: it no
longer runs API discovery for the resource's group and no longer reports
version incompatibilities to the error reporter. Callers disable the query
exactly when they know the resource is not there to be read, so neither the
discovery request nor the report was wanted.
