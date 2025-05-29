import {
  getClusterSecretStoreGVK,
  getClusterSecretStoreNames,
  Resource,
  type ClusterSecretStore,
} from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';
import { useMemo } from 'react';

export function useClusterSecretStores(installations?: string[]) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

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

  const queriesInfo = useListResources<ClusterSecretStore>(
    selectedInstallations,
    installationsGVKs,
  );

  const resources: Resource<ClusterSecretStore>[] = useMemo(() => {
    return queriesInfo.installationsData.flatMap(({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
    );
  }, [queriesInfo.installationsData]);

  return {
    ...queriesInfo,
    resources,
  };
}
