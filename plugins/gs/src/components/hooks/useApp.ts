import {
  getAppGVK,
  getAppNames,
  type App,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';

export function useApp(
  {
    installationName,
    name,
    namespace,
  }: {
    installationName: string;
    name: string;
    namespace?: string;
  },
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const apiVersion = useApiVersionOverride(installationName, getAppNames());
  const gvk = getAppGVK(apiVersion);

  const query = useGetResource<App>(
    { installationName, gvk, name, namespace },
    { enabled },
  );

  return {
    ...query,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: 'App',
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}
