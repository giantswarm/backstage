import type { App } from '@giantswarm/backstage-plugin-gs-common';
import { getAppGVK, getAppNames } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

export function useApps(installations?: string[]) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getAppNames().plural];
      const gvk = getAppGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  return useListResources<App>(selectedInstallations, installationsGVKs);
}
