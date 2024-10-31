import {
  getAppGVK,
  getAppNames,
  type App,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';

export function useApp(
  installationName: string,
  name: string,
  namespace?: string,
) {
  const apiVersion = useApiVersionOverride(installationName, getAppNames());
  const gvk = getAppGVK(apiVersion);

  return useGetResource<App>(installationName, gvk, name, namespace);
}
