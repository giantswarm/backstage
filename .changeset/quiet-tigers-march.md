---
'@giantswarm/backstage-plugin-gs': patch
---

Refactor ProviderClusterLocation to separate components per provider

- Split ProviderClusterLocation into AWSClusterLocation and AzureClusterLocation
- Use ClusterSwitch pattern for provider-specific rendering
- Remove useProviderClusterForCluster hook (was calling 4 useResource hooks with only one enabled)
- Each provider component now uses a single useResource hook
