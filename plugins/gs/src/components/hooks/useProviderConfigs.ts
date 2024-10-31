import type { ProviderConfig } from '@giantswarm/backstage-plugin-gs-common';
import { getProviderConfigGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

const resourcePluralName = 'providerconfigs';

export function useProviderConfigs(installations?: string[]) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[resourcePluralName];
      const gvk = getProviderConfigGVK('aws', apiVersion);

      return [installationName, gvk];
    }),
  );

  return useListResources<ProviderConfig>(
    selectedInstallations,
    installationsGVKs,
  );
}
