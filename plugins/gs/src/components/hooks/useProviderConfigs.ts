import type {
  ProviderConfig,
  Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import { getProviderConfigGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

const resourcePluralName = 'providerconfigs';

export function useProviderConfigs(installations?: string[]) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[resourcePluralName];
      const gvk = getProviderConfigGVK('aws', apiVersion);

      return [installationName, gvk];
    }),
  );

  const queriesInfo = useListResources<ProviderConfig>(
    selectedInstallations,
    installationsGVKs,
  );

  const resources: Resource<ProviderConfig>[] =
    queriesInfo.installationsData.flatMap(({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
    );

  return {
    ...queriesInfo,
    resources,
  };
}
