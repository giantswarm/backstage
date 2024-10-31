import {
  getClusterSecretStoreGVK,
  getClusterSecretStoreNames,
  type ClusterSecretStore,
} from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

export function useClusterSecretStores(installations?: string[]) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[
          getClusterSecretStoreNames().plural
        ];
      const gvk = getClusterSecretStoreGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  return useListResources<ClusterSecretStore>(
    selectedInstallations,
    installationsGVKs,
  );
}
