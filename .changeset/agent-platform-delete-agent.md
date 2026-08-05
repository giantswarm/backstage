---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Add the companion delete to agent creation. The agent detail page's kebab menu
gains **Delete agent…**, which removes the agent's `HelmRelease` — the object that
owns its existence, since an `Agent` rendered by a chart would just be rendered
again. Deleting it makes helm-controller uninstall the release and take the `Agent`
CR with it. The owner is resolved through the Flux provenance labels rather than by
assuming the release is named after the agent, so it also works for agents created
outside the wizard.

**The delete is offered only to users who may perform it.** A
`SelfSubjectAccessReview` for `delete` on that named `HelmRelease` in its namespace
runs first, and the menu item is withheld while the checks are still in flight, so
it never appears and then disappears. The review decides what is _shown_;
authorization stays the apiserver's, since the proxy forwards the user's own OIDC
token — a bypassed menu item still gets a real 403. Two further conditions hide it:
no resolvable owner (an `Agent` applied by hand has no release to delete), and a
release applied by a Kustomization, whose desired state is in Git and which would
be recreated on the next reconciliation.

**The shared `OCIRepository` goes only when it is provably unused.** Every agent in
a namespace shares one `agent` chart source, so the `HelmRelease`es in the source's
namespace are listed first and any other release referencing the same object keeps
it. A failed list read keeps it too — an empty list because the read failed is not
the same answer as an empty list because nothing references it. A failure to delete
the source is swallowed: the agent is gone, which is what was asked for, and a
chart source nobody references is inert and re-applied identically by the next
agent creation. This is also why the permission gate does not require `delete` on
`ocirepositories`.

**The confirmation modal says one thing**: that this ends any session currently
running with the agent, including ones started by other people that are not shown.
That is the only thing the person clicking cannot work out for themselves, since
kagent scopes its session list to the caller and a quiet list is therefore not
evidence that an agent is idle. Nothing mechanical appears in it — not the
`HelmRelease`, not the shared chart source, not the fact that a suspended release is
not uninstalled at all. True, and all of it noise at the moment of deciding; it is
documented in `docs/agent-platform.md` instead.

On success the user returns to the agents list with a toast that says "Deleting",
not "Deleted": the `HelmRelease` has a finalizer, so all that is certain is that the
apiserver accepted the request, and the agent can still be in the list for a few
seconds. On failure the dialog stays open with the message inline — no toast, since
the user is still looking at the modal they pressed Delete in.

**New in `ui-react`: `ConfirmDialog`** — the repo's first reusable modal, for asking
before doing something that cannot be taken back. Controlled rather than wrapping a
`DialogTrigger`, which is the only thing that works when the trigger is a `MenuItem`
(react-aria unmounts the menu on selection, taking any trigger inside it along).
Confirming deliberately does not close it: an action that can fail needs somewhere
to report that, and a dialog that dismisses itself on confirm has thrown away the
only place the user was still looking. So the caller runs the action, passes
`isBusy` while it is in flight and `error` if it fails, and closes on success. While
busy the dialog is undismissable, so a stray click or Escape cannot orphan a request
already on its way to a server.

**New in `kubernetes-react`: `deleteResource`** — the package's first mutating verb
besides `patchResource`, and the first Kubernetes `DELETE` in the app. It goes
through the same proxy, with the same trailing-slash stripping and the same
`ForbiddenError`/`NotFoundError` naming, so an idempotent caller can treat a 404 as
success. The details both verbs need moved into a shared `k8sMutation` module;
`BACKSTAGE_FIELD_MANAGER` keeps its existing import path.

Toasts here use `toastApiRef` from `@backstage/frontend-plugin-api` rather than the
deprecated `alertApi`, which upstream has scheduled for removal.
