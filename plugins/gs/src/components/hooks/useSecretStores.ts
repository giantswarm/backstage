import type { SecretStore } from '@internal/plugin-gs-common';
import { secretStoreGVK } from '@internal/plugin-gs-common';
import { useListResources } from './useListResources';

export function useSecretStores(installations?: string[], namespace?: string) {
  return useListResources<SecretStore>(
    secretStoreGVK,
    installations,
    namespace,
  );
}
