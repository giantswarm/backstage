---
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

The Flux UI shows the Flux Operator's resources: FluxInstance, ResourceSet,
ResourceSetInputProvider and FluxReport (`fluxcd.controlplane.io/v1`). They are
listed, have a details panel with their spec and status, and can be reconciled,
suspended and resumed (FluxReport excepted, which the operator regenerates).

The tree descends into the inventory of a ResourceSet or FluxInstance as it does
into a Kustomization's, so the objects a ResourceSet renders nest under it and a
FluxInstance is the root above the Kustomization it syncs. The default "Flux"
view keeps the operator kinds, and the details panel names a resource's parent
by kind ("Parent ResourceSet"). A ResourceSet's panel lists its input providers
and dependencies, a provider's panel the ResourceSets using it, and a
FluxInstance's panel its sync source and FluxReport.

`kubernetes-react` adds the resource classes on a `FluxOperatorObject` base,
which suspends through the `fluxcd.controlplane.io/reconcile` annotation instead
of `spec.suspend` (`FluxObject.getSuspendPatch`), and a `matchesLabelSelector`
helper. `@giantswarm/k8s-types` moves to v0.9.0, whose App types mark nullable
fields as such.
