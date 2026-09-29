---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

`ModelConfig.getDisplayNameAnnotation()` returns the
`ui.giantswarm.io/display-name` annotation, or `undefined` when it is missing
or blank. `getDisplayName()` now falls back to the resource name for a blank
annotation too, instead of returning an empty name.
