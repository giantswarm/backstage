import type { App } from '@internal/plugin-gs-common';
import { useGetResource } from './useGetResource';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';

export function useApp(
  installationName: string,
  gvk: CustomResourceMatcher,
  name: string,
  namespace?: string,
) {
  return useGetResource<App>(installationName, gvk, name, namespace);
}
