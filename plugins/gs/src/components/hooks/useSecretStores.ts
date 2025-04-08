import type { SecretStore } from '@giantswarm/backstage-plugin-gs-common';
import { getSecretStoreGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

const resourcePluralName = 'secretstores';

export function useSecretStores(installations?: string[], namespace?: string) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[resourcePluralName];
      const gvk = getSecretStoreGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  return useListResources<SecretStore>(
    selectedInstallations,
    installationsGVKs,
    namespace,
  );
}
