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

export function useControlPlane(installationName: string, cluster: Cluster) {
  const { kind, apiVersion, name, namespace } =
    getClusterControlPlaneRef(cluster);

  const apiVersionOverride = useApiVersionOverride(
    installationName,
    getControlPlaneNames(kind),
  );
  const gvk = getControlPlaneGVK(kind, apiVersionOverride ?? apiVersion);

  return {
    ...useGetResource<ControlPlane>(installationName, gvk, name, namespace),
    queryErrorMessage: 'Failed to fetch control plane',
  };
}
