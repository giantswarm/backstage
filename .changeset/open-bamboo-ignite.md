---
'@giantswarm/backstage-plugin-flux-react': minor
---

Flux tree search now also matches the Ready condition messages of failing resources. Flux embeds the names of resources it fails to apply in its build/apply error messages, so searching for a service that never got created leads straight to the Kustomization that is blocking it. Messages of healthy resources are not matched to avoid noise.
