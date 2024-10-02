import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import type { HelmRelease } from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';

export function useHelmRelease(
  installationName: string,
  gvk: CustomResourceMatcher,
  name: string,
  namespace?: string,
) {
  return useGetResource<HelmRelease>(installationName, gvk, name, namespace);
}
