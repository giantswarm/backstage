---
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-flux-react': minor
---

Detect when a Flux resource's `spec.suspend` is under declarative management, and
disable the Suspend/Resume toggle rather than offering a change that would be
silently undone.

- Server-side apply is field-level, so what matters is not whether a resource is
  GitOps-managed but whether the _applied manifest asserts `spec.suspend`_. When it
  does, the applying controller force-takes the field back on its next apply
  (Flux's SSA always passes `ForceOwnership`) and an imperative suspend lasts only
  until then. `FluxObject.isSuspendFieldManaged()` reads this off
  `metadata.managedFields`, which the API already returns: any entry with
  operation `Apply` that owns `f:spec.f:suspend`. The toggle is disabled with a
  tooltip naming the owning manager(s).
- Not restricted to `kustomize-controller`: a Flux object deployed by a
  HelmRelease is applied by `helm-controller`, and a human
  `kubectl apply --server-side` has the same effect. `Update`-operation owners are
  ignored — they hold ownership but have no declared desired state to restore, so
  they never revert anything. That includes our own merge patches.
- **Reconcile is deliberately left enabled**, including on managed resources. The
  `reconcile.fluxcd.io/requestedAt` annotation is never part of an applied
  manifest, so no apply-owner asserts or prunes it, and the controller records the
  value into `status.lastHandledReconcileAt` rather than clearing it. There is no
  race to lose.
- `kubernetes-react` gains a general `KubeObject.getApplyFieldOwners(path)` for
  this, handling `fieldsV1`'s `f:`-prefixed encoding and atomic parent fields.
- Writes now set `?fieldManager=giantswarm-backstage` explicitly
  (`BACKSTAGE_FIELD_MANAGER`). The apiserver otherwise derives the manager name
  from the request's User-Agent, which for a write proxied through the Backstage
  backend is unpredictable and useless for auditing. A deliberate name makes our
  changes attributable in `--show-managed-fields`, and gives operators a value for
  a controller's `--override-manager`. We deliberately do not masquerade as
  `flux`: nothing in Flux keys off that name — the CLI never sets a field manager
  at all, and kustomize-controller's disallowed-manager list does not include it —
  so impersonation would buy nothing and destroy attribution.
- Corrects the `ImagePolicy` justification in the actionable-kinds list. The claim
  that Flux offers neither operation for the kind was wrong: both `v1` and
  `v1beta2` declare `spec.suspend` and `status.lastHandledReconcileAt`, and the
  CLI covers it as well (`flux reconcile|suspend|resume image policy`). Including
  the kind was right; the stated reason was not.
