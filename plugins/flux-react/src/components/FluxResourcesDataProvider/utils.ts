import {
  Kustomization,
  HelmRelease,
  FluxResourceStatus,
  FluxObject,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findTargetClusterName } from '../../utils/findTargetClusterName';

export type FluxResourceData = {
  cluster: string;
  name: string;
  namespace?: string;
  kind: string;
  targetCluster?: string;
  status: FluxResourceStatus;
  createdTimestamp?: string;
};

export function collectResourceData(resource: FluxObject): FluxResourceData {
  const targetCluster =
    resource instanceof HelmRelease || resource instanceof Kustomization
      ? findTargetClusterName(resource)
      : undefined;

  return {
    cluster: resource.cluster,
    name: resource.getName(),
    namespace: resource.getNamespace(),
    kind: resource.getKind(),
    targetCluster,
    status: resource.getOrCalculateFluxStatus(),
    createdTimestamp: resource.getCreatedTimestamp(),
  };
}
