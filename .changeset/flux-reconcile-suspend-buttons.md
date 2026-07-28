---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-flux-react': minor
---

Add "Reconcile" and "Suspend"/"Resume" buttons to the Flux resource cards in the
details panel, so the two common Flux operations no longer require leaving
Backstage for a terminal.

- The buttons sit in the card footer and appear on every card in the panel — the
  selected resource as well as its source and dependency cards. Reconcile patches
  the `reconcile.fluxcd.io/requestedAt` annotation (equivalent to
  `flux reconcile <kind> <name>`); the suspend toggle patches `spec.suspend`, and
  its label follows the current state. `ImagePolicy` gets no buttons — Flux
  supports neither operation for it.
- Reconcile stays disabled until a requested reconciliation has been picked up,
  determined from the resource itself by comparing the annotation against
  `status.lastHandledReconcileAt` (new `FluxObject.isReconcileRequestPending()`).
  Because that is the resource's own record, the button is also disabled for a
  request someone else made — via the `flux` CLI, say — and the state survives a
  page reload. Such a pending request now also triggers the fast (3s) refetch
  interval, so the button re-enables promptly instead of waiting out the 15s poll.
  Reconcile is likewise disabled while a resource is suspended, since a suspended
  resource ignores the annotation.
- Buttons are only rendered to users whose cluster RBAC actually permits the
  write. `kubernetes-react` gains a `SelfSubjectAccessReview` probe
  (`useSelfSubjectAccessReview`) that checks `patch` per cluster, API group,
  resource and namespace, cached so one review covers every card of that kind in
  that namespace. It fails closed: while the review is in flight, or if it fails,
  no buttons appear. Note that omitting the resource name means a user granted
  access through an RBAC rule with `resourceNames` will not see the buttons.
- The redundant `flux reconcile`, `flux suspend` and `flux resume` entries are
  removed from the card's copy-command menu; `kubectl get -o yaml` and
  `kubectl describe` remain.
- `kubernetes-react`: new `patchResource` helper and `useFluxResourceActions`
  hook (the first Kubernetes write path from the browser — authorization is the
  signed-in user's own OIDC token against the cluster's RBAC, and a rejected
  patch is reported as a permission error), plus
  `KubeObject.getResolvedGVK()`, which reports the API version an object was
  actually read at so writes and cache invalidations target the same version
  discovery resolved.
