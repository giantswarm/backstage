import type { ProviderConfig } from '@internal/plugin-gs-common';
import { providerConfigGVK } from '@internal/plugin-gs-common';
import { useListResources } from './useListResources';

export function useProviderConfigs(installations?: string[]) {
  return useListResources<ProviderConfig>(providerConfigGVK, installations);
}
