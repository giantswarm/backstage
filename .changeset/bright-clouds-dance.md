---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add dynamic API version discovery for Kubernetes resources

- Add useApiDiscovery hooks to automatically detect supported API versions
- Support multi-version resources with `supportedVersions` array on KubeObject classes
- Add version utilities for comparing and selecting preferred API versions
- Improve resource fetching to use cluster-supported versions
