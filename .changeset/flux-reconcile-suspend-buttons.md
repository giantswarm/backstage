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
  its label follows the current state.
- All eight kinds the panel renders get the buttons, `ImagePolicy` included.
  Note this is a wider set than the `flux` CLI covers: there is no
  `flux reconcile image policy` subcommand, but image-reflector-controller does
  honour the reconcile-request annotation and `spec.suspend` for ImagePolicy, so
  the UI can offer both.
- Reconcile stays disabled until a requested reconciliation has been picked up,
  determined from the resource itself by comparing the annotation against
  `status.lastHandledReconcileAt` (new `FluxObject.isReconcileRequestPending()`).
  Because that is the resource's own record, the button is also disabled for a
  request someone else made — via the `flux` CLI, say — and the state survives a
  page reload. Reconcile is likewise disabled while a resource is suspended, since
  a suspended resource ignores the annotation.
- A pending request also triggers the fast (3s) refetch interval so the button
  re-enables promptly, but only for requests that can actually converge:
  suspended objects are excluded (Flux returns early on `spec.suspend` without
  patching status, so the request would stay outstanding forever), and the
  acceleration is bounded in time so an object nothing reconciles — a CRD whose
  controller is not running, say — cannot pin every list on the Flux page at the
  fast interval indefinitely.
- Buttons are only rendered to users whose cluster RBAC actually permits the
  write. `kubernetes-react` gains a `SelfSubjectAccessReview` probe
  (`useSelfSubjectAccessReview`) that checks `patch` per cluster, API group,
  resource and namespace, cached so one review covers every card of that kind in
  that namespace. It fails closed: while the review is in flight, or if it fails,
  no buttons appear. Note that omitting the resource name means a user granted
  access through an RBAC rule with `resourceNames` will not see the buttons.
- The verdict is deliberately kept out of the persisted (localStorage) query
  cache, which outlives the session — a rehydrated `allowed: true` could belong
  to a previous user on a shared browser or to a since-revoked grant, and would
  render the buttons on first paint only for them to vanish. `kubernetes-react`
  exports `NON_PERSISTED_QUERY_META` and a `shouldDehydrateQuery` filter for this,
  now wired into the `flux`, `gs` and `agent-platform` QueryClientProviders.
- The redundant `flux reconcile`, `flux suspend` and `flux resume` entries are
  removed from the card's copy-command menu; `kubectl get -o yaml` and
  `kubectl describe` remain.
- `kubernetes-react`: new `patchResource` helper and `useFluxResourceActions`
  hook (the first Kubernetes write path from the browser — authorization is the
  signed-in user's own OIDC token against the cluster's RBAC, and a rejected
  patch is reported as a permission error), plus
  `KubeObject.getResolvedGVK()`, which reports the group and API version an
  object was actually read at so writes and cache invalidations target the same
  version discovery resolved (and reports an empty group for core resources,
  where `getGroup()` returns the version).
