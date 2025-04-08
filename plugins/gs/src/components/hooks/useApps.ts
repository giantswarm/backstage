import type { App, Resource } from '@giantswarm/backstage-plugin-gs-common';
import { getAppGVK, getAppNames } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

export function useApps(installations?: string[]) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getAppNames().plural];
      const gvk = getAppGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  const queriesInfo = useListResources<App>(
    selectedInstallations,
    installationsGVKs,
  );

  const resources: Resource<App>[] = queriesInfo.installationsData.flatMap(
    ({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
  );

  return {
    ...queriesInfo,
    resources,
  };
}
