import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';
import {
  getResourceGVK,
  getResourceNames,
} from '@giantswarm/backstage-plugin-gs-common';

export function useResource<T>(
  {
    kind,
    apiVersion,
    installationName,
    name,
    namespace,
  }: {
    kind: string;
    apiVersion?: string;
    installationName: string;
    name: string;
    namespace?: string;
  },
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const apiVersionOverride = useApiVersionOverride(
    installationName,
    getResourceNames(kind),
  );
  const gvk = getResourceGVK(kind, apiVersionOverride ?? apiVersion);

  const query = useGetResource<T>(
    { installationName, gvk, name, namespace },
    { enabled },
  );

  return {
    ...query,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: kind,
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}
