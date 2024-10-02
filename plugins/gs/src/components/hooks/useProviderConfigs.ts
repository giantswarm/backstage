import type { ProviderConfig } from '@giantswarm/backstage-plugin-gs-common';
import { providerConfigGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';

export function useProviderConfigs(installations?: string[]) {
  return useListResources<ProviderConfig>(providerConfigGVK, installations);
}
