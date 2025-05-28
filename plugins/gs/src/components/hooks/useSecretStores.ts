import type {
  Resource,
  SecretStore,
} from '@giantswarm/backstage-plugin-gs-common';
import { getSecretStoreGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';
import { useMemo } from 'react';

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

  const queriesInfo = useListResources<SecretStore>(
    selectedInstallations,
    installationsGVKs,
    namespace,
  );

  const resources: Resource<SecretStore>[] = useMemo(() => {
    return queriesInfo.installationsData.flatMap(({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
    );
  }, [queriesInfo.installationsData]);

  return {
    ...queriesInfo,
    resources,
  };
}
