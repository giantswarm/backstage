---
'@giantswarm/backstage-plugin-muster': minor
---

A GitOps-managed workflow's page offers "Edit in Git…" in its ⋮ menu, as a
GitOps-managed connector's page does. The same dialog names the HelmRelease or
Kustomization that manages the workflow, links to its source where one is
found, and lists the steps to change or remove it through a pull request. A
workflow that is not managed through GitOps has no menu.
