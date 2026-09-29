---
'@giantswarm/backstage-plugin-gs': minor
---

Uninstall an app from its deployment page. The page header gets an **Uninstall** button next to **Edit**, which confirms and then deletes the `HelmRelease` through the Kubernetes proxy as the signed-in user, so the apiserver decides. The chart's `OCIRepository` goes with it when the deployment owns it (same name and namespace as the release, the shape the deploy flow creates); a source under any other name may feed other releases and stays. The `valuesFrom` ConfigMaps and Secrets stay, and the dialog says so. The button is withheld when a Flux `Kustomization`, a parent Helm release or another tool owns the deployment, because the reconciler would re-create it, and when a `SelfSubjectAccessReview` says the user may not delete it.
