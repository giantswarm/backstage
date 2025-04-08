import {
  getReleaseGVK,
  getReleaseNames,
  type Release,
  type Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';

export function useReleases(installations?: string[]) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getReleaseNames().plural];
      const gvk = getReleaseGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  const queriesInfo = useListResources<Release>(
    selectedInstallations,
    installationsGVKs,
  );

  const resources: Resource<Release>[] = queriesInfo.installationsData.flatMap(
    ({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
  );

  return {
    ...queriesInfo,
    resources,
  };
}
