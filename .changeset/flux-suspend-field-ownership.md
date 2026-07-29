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
  tooltip naming the owning manager(s) and pointing at the source that applies
  the field — deliberately not "change it in Git", since the applier may equally
  be a chart rendered by helm-controller or a human's
  `kubectl apply --server-side`.
- Not restricted to `kustomize-controller`: a human `kubectl apply --server-side`,
  or helm-controller's drift correction when `spec.driftDetection` is enabled, has
  the same effect.
- Stale ownership is accounted for. A `managedFields` entry is only rewritten by a
  write, so it outlives the applier: an object handed over for manual control with
  `kustomize.toolkit.fluxcd.io/reconcile: disabled` or
  `kustomize.toolkit.fluxcd.io/ssa: Ignore` keeps a stale `Apply` entry naming the
  field, and `ssa: IfNotPresent` objects carry one from creation onwards despite
  never being applied again. Those three annotations short-circuit the check, so
  such objects keep a working toggle instead of a permanently disabled one.
- **Detection is limited to SSA appliers**, and is a best-effort signal rather
  than a guarantee. The two common non-SSA declarative writers are recorded as
  `operation: Update` and so are not detected, even though both keep a stored
  desired state and re-assert it: client-side `kubectl apply`
  (`kubectl-client-side-apply`), and a plain `helm upgrade`, whose three-way merge
  resets drift on chart-declared fields. A chart that ships a Kustomization with
  `spec.suspend` declared will therefore still show an enabled toggle whose change
  the next upgrade reverts. Documented on
  `KubeObject.getApplyFieldOwners` rather than guessed at from manager names.
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
