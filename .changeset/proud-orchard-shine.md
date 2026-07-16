---
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-gs': minor
---

Show a warning banner on the deployment details page when an ancestor Flux Kustomization is suspended or failing and therefore blocking updates to the deployment. The banner names the topmost blocked Kustomization, shows its Ready condition message, and links to the Flux overview with the resource selected. flux-react exports the new `FluxBlockedByCard` component and the `findKustomizationAncestors`/`findBlockedAncestors` utilities.
