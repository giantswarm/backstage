import {
  getClusterControlPlaneRef,
  getControlPlaneGVK,
  getControlPlaneNames,
} from '@giantswarm/backstage-plugin-gs-common';
import type {
  Cluster,
  ControlPlane,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';

export function useControlPlane(installationName: string, cluster: Cluster) {
  const { kind, apiVersion, name, namespace } =
    getClusterControlPlaneRef(cluster);

  const apiVersionOverride = useApiVersionOverride(
    installationName,
    getControlPlaneNames(kind),
  );
  const gvk = getControlPlaneGVK(kind, apiVersionOverride ?? apiVersion);

  const query = useGetResource<ControlPlane>(
    { installationName, gvk, name, namespace },
    { enabled: true },
  );

  return {
    ...query,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: 'control plane',
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}
