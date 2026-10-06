import {
  AWSCluster,
  AWSMachinePool,
  AzureASOManagedCluster,
  AzureCluster,
  AzureMachineTemplate,
  Cluster,
  KubeObject,
  MachineDeployment,
  MachinePool,
  VCDCluster,
  VSphereCluster,
  VSphereMachineTemplate,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Labels } from '@giantswarm/backstage-plugin-gs-common';
import { MachineTypeCatalog, vsphereMachineSize } from './machineTypes';
import {
  NodePoolCapacityInput,
  buildAWSNodePoolRows,
  buildMachineDeploymentNodePoolRows,
} from './nodePoolRows';

/** The node pool CRs of one or more clusters, as listed on their installations. */
export type NodePoolResources = {
  machinePools: MachinePool[];
  awsMachinePools: AWSMachinePool[];
  machineDeployments: MachineDeployment[];
  azureMachineTemplates: AzureMachineTemplate[];
  vsphereMachineTemplates: VSphereMachineTemplate[];
};

export type MachineTypeCatalogs = {
  aws?: MachineTypeCatalog;
  azure?: MachineTypeCatalog;
};

/** Reads an AzureMachineTemplate's VM size and looks it up in `catalog`. */
export function describeAzureMachineTemplate(
  catalog: MachineTypeCatalog | undefined,
) {
  return (template: AzureMachineTemplate) => {
    const vmSize = template.getVmSize();
    return {
      machineType: vmSize,
      info: vmSize ? catalog?.(vmSize) : undefined,
    };
  };
}

function belongsTo(cluster: Cluster) {
  return (resource: KubeObject) =>
    resource.cluster === cluster.cluster &&
    resource.getNamespace() === cluster.getNamespace() &&
    resource.getLabels()?.[Labels.labelClusterName] === cluster.getName();
}

/**
 * The worker node pools of `cluster`, by the CRs its infrastructure kind
 * uses. Undefined for an infrastructure kind without known node pools.
 */
export function getClusterNodePools(
  cluster: Cluster,
  resources: NodePoolResources,
  catalogs: MachineTypeCatalogs,
): NodePoolCapacityInput[] | undefined {
  const isOwn = belongsTo(cluster);

  switch (cluster.getInfrastructureRef()?.kind) {
    case AWSCluster.kind:
      // Karpenter pools have no fixed instance type, so their
      // KarpenterMachinePools add nothing here.
      return buildAWSNodePoolRows(
        resources.machinePools.filter(isOwn),
        resources.awsMachinePools,
        [],
        catalogs.aws,
      );
    case AzureASOManagedCluster.kind:
      return resources.machinePools.filter(isOwn).map(pool => ({
        name: pool.getName(),
        readyReplicas: pool.getReadyReplicas(),
        machineSize: undefined,
      }));
    case AzureCluster.kind:
      return buildMachineDeploymentNodePoolRows(
        resources.machineDeployments.filter(isOwn),
        resources.azureMachineTemplates,
        describeAzureMachineTemplate(catalogs.azure),
      );
    case VSphereCluster.kind:
      return buildMachineDeploymentNodePoolRows(
        resources.machineDeployments.filter(isOwn),
        resources.vsphereMachineTemplates,
        template => ({ info: { size: vsphereMachineSize(template) } }),
      );
    case VCDCluster.kind:
      return buildMachineDeploymentNodePoolRows(
        resources.machineDeployments.filter(isOwn),
        [],
        () => ({}),
      );
    default:
      return undefined;
  }
}
