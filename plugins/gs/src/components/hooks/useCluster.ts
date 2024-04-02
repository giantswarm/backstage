import type { Cluster } from '@internal/plugin-gs-common';
import { useGetResource } from './useGetResource';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';

export function useCluster(
  installationName: string,
  gvk: CustomResourceMatcher,
  name: string,
  namespace?: string,
) {
  return useGetResource<Cluster>(installationName, gvk, name, namespace);
}
