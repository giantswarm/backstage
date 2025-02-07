import {
  getKustomizationGVK,
  getKustomizationNames,
  type Kustomization,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';

export function useKustomization(
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
  const apiVersion = useApiVersionOverride(
    installationName,
    getKustomizationNames(),
  );
  const gvk = getKustomizationGVK(apiVersion);

  const query = useGetResource<Kustomization>(
    { installationName, gvk, name, namespace },
    { enabled },
  );

  return {
    ...query,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: 'Kustomization',
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}
