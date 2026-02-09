---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Fix API version discovery for resources with different version support

- Implement two-stage API discovery that queries available versions and then checks which version actually serves the specific resource
- Extract shared query logic into `queryFactories.ts` for use by both `usePreferredVersion` and `usePreferredVersions`
