import type { HelmRelease } from '@giantswarm/backstage-plugin-gs-common';
import {
  getHelmReleaseGVK,
  getHelmReleaseNames,
} from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

export function useHelmReleases(installations?: string[]) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getHelmReleaseNames().plural];
      const gvk = getHelmReleaseGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  return useListResources<HelmRelease>(
    selectedInstallations,
    installationsGVKs,
  );
}
