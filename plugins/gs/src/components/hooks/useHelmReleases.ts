import type {
  HelmRelease,
  Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  getHelmReleaseGVK,
  getHelmReleaseNames,
} from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';
import { useInstallations } from './useInstallations';
import { useApiVersionOverrides } from './useApiVersionOverrides';
import { useMemo } from 'react';

export function useHelmReleases(installations?: string[]) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getHelmReleaseNames().plural];
      const gvk = getHelmReleaseGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  const queriesInfo = useListResources<HelmRelease>(
    selectedInstallations,
    installationsGVKs,
  );

  const resources: Resource<HelmRelease>[] = useMemo(() => {
    return queriesInfo.installationsData.flatMap(({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
    );
  }, [queriesInfo.installationsData]);

  return {
    ...queriesInfo,
    resources,
  };
}
