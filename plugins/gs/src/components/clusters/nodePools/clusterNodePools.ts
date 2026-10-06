import {
  AWSCluster,
  AWSMachinePool,
  AzureASOManagedCluster,
  AzureASOManagedMachinePool,
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
  buildNodePoolRows,
} from './nodePoolRows';

/** The node pool CRs of one or more clusters, as listed on their installations. */
export type NodePoolResources = {
  machinePools: MachinePool[];
  awsMachinePools: AWSMachinePool[];
  azureASOManagedMachinePools: AzureASOManagedMachinePool[];
  machineDeployments: MachineDeployment[];
  azureMachineTemplates: AzureMachineTemplate[];
  vsphereMachineTemplates: VSphereMachineTemplate[];
};

export type MachineTypeCatalogs = {
  aws?: MachineTypeCatalog;
  azure?: MachineTypeCatalog;
};

/**
 * Reads the VM size of an AzureMachineTemplate or an AKS agent pool and looks
 * it up in `catalog`.
 */
export function describeAzureVmSize(catalog: MachineTypeCatalog | undefined) {
  return (infrastructure: { getVmSize(): string | undefined }) => {
    const vmSize = infrastructure.getVmSize();
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
      return buildNodePoolRows(
        resources.machinePools.filter(isOwn),
        resources.azureASOManagedMachinePools,
        describeAzureVmSize(catalogs.azure),
      );
    case AzureCluster.kind:
      return buildNodePoolRows(
        resources.machineDeployments.filter(isOwn),
        resources.azureMachineTemplates,
        describeAzureVmSize(catalogs.azure),
      );
    case VSphereCluster.kind:
      return buildNodePoolRows(
        resources.machineDeployments.filter(isOwn),
        resources.vsphereMachineTemplates,
        template => ({ info: { size: vsphereMachineSize(template) } }),
      );
    case VCDCluster.kind:
      return buildNodePoolRows(
        resources.machineDeployments.filter(isOwn),
        [],
        () => ({}),
      );
    default:
      return undefined;
  }
}
