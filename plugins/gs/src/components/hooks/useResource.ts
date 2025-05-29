import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';
import {
  getResourceGVK,
  getResourceNames,
} from '@giantswarm/backstage-plugin-gs-common';
import { useMemo } from 'react';
import { ErrorInfo } from './utils/queries';

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

  const errors: ErrorInfo[] = useMemo(() => {
    if (!query.error) {
      return [];
    }
    return [
      {
        installationName,
        error: query.error,
        retry: query.refetch,
      },
    ];
  }, [installationName, query.error, query.refetch]);

  return {
    ...query,
    errors,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: kind,
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}
