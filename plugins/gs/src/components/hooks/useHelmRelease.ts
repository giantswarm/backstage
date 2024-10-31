import {
  getHelmReleaseGVK,
  getHelmReleaseNames,
  type HelmRelease,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';

export function useHelmRelease(
  installationName: string,
  name: string,
  namespace?: string,
) {
  const apiVersion = useApiVersionOverride(
    installationName,
    getHelmReleaseNames(),
  );
  const gvk = getHelmReleaseGVK(apiVersion);

  return useGetResource<HelmRelease>(installationName, gvk, name, namespace);
}
