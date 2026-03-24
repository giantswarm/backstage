---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Fix false "Client outdated" warning for resources that only exist in older API group versions. Refactor API discovery hooks: `usePreferredVersion` now delegates to `usePreferredVersions`, version resolution uses resource-level versions only, and API discovery errors are propagated through `useResources`.
