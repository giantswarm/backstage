import { useMemo } from 'react';
import {
  AWSCluster,
  AWSMachinePool,
  AzureASOManagedCluster,
  AzureASOManagedMachinePool,
  AzureCluster,
  AzureMachineTemplate,
  Cluster,
  ErrorInfoUnion,
  MachineDeployment,
  MachinePool,
  VCDCluster,
  VSphereCluster,
  VSphereMachineTemplate,
  getIncompatibilityMessage,
  isNotFoundError,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  NodePoolCapacityInput,
  WorkerCapacity,
  computeWorkerCapacity,
  getClusterNodePools,
  needsNodeMetrics,
} from '../clusters/nodePools';
import { describeClusterError } from '../clusters/ClustersDataProvider/utils';
import { installationsByInfraKind } from '../utils/installationsByInfraKind';
import { useMachineTypeCatalog } from './useMachineTypeCatalog';
import {
  NodePoolMetricsStatus,
  useMimirNodePoolCapacity,
} from './useMimirNodePoolCapacity';

export type ClusterWorkerCapacity = {
  isLoading: boolean;
  /** Undefined while loading, on error, or for an unsupported provider. */
  capacity?: WorkerCapacity;
  errorMessage?: string;
  /** Why `capacity.uncountedPools` could not be read from node metrics. */
  metricsStatus?: NodePoolMetricsStatus;
};

export function getClusterKey(cluster: {
  installationName: string;
  namespace?: string;
  name: string;
}) {
  return `${cluster.installationName}/${cluster.namespace ?? ''}/${cluster.name}`;
}

function keyOf(cluster: Cluster) {
  return getClusterKey({
    installationName: cluster.cluster,
    namespace: cluster.getNamespace(),
    name: cluster.getName(),
  });
}

/**
 * Lists in the namespace of the clusters when an installation's clusters all
 * share one (always so for a single cluster), so a cluster's page needs no
 * more than namespace access; across namespaces otherwise.
 */
function listScopes(
  clusters: Cluster[],
): Record<string, { namespace?: string }> {
  const namespaces = new Map<string, Set<string | undefined>>();
  for (const cluster of clusters) {
    if (!namespaces.has(cluster.cluster)) {
      namespaces.set(cluster.cluster, new Set());
    }
    namespaces.get(cluster.cluster)!.add(cluster.getNamespace());
  }

  const scopes: Record<string, { namespace?: string }> = {};
  for (const [installationName, set] of namespaces) {
    const [namespace] = set;
    if (set.size === 1 && namespace) {
      scopes[installationName] = { namespace };
    }
  }
  return scopes;
}

function errorMessageFor(errors: ErrorInfoUnion[]): string | undefined {
  const [first] = errors;
  if (!first) {
    return undefined;
  }
  if (first.type === 'incompatibility') {
    return getIncompatibilityMessage(first.incompatibility);
  }
  return `Could not read the node pools: ${describeClusterError(first.error)}.`;
}

/**
 * Worker CPU and memory of the given clusters: ready nodes times machine
 * size per node pool, with node metrics from Mimir for pools without a known
 * size. Keyed by {@link getClusterKey}.
 */
export function useWorkerCapacity(
  clusters: Cluster[],
  { enabled = true }: { enabled?: boolean } = {},
): {
  capacities: Map<string, ClusterWorkerCapacity>;
  errors: ErrorInfoUnion[];
} {
  const byKind = installationsByInfraKind(clusters);
  const aws = byKind[AWSCluster.kind] ?? [];
  const aks = byKind[AzureASOManagedCluster.kind] ?? [];
  const azure = byKind[AzureCluster.kind] ?? [];
  const vsphere = byKind[VSphereCluster.kind] ?? [];
  const vcd = byKind[VCDCluster.kind] ?? [];
  const withMachinePools = Array.from(new Set([...aws, ...aks]));
  const withMachineDeployments = Array.from(
    new Set([...azure, ...vsphere, ...vcd]),
  );

  const scopes = useMemo(() => listScopes(clusters), [clusters]);

  const {
    resources: machinePools,
    errors: machinePoolErrors,
    isLoading: isLoadingMachinePools,
  } = useResources(withMachinePools, MachinePool, scopes, {
    enabled: enabled && withMachinePools.length > 0,
  });
  const {
    resources: awsMachinePools,
    errors: awsMachinePoolErrors,
    isLoading: isLoadingAWSMachinePools,
  } = useResources(aws, AWSMachinePool, scopes, {
    enabled: enabled && aws.length > 0,
  });
  const {
    resources: azureASOManagedMachinePools,
    errors: azureASOManagedMachinePoolErrors,
    isLoading: isLoadingAzureASOManagedMachinePools,
  } = useResources(aks, AzureASOManagedMachinePool, scopes, {
    enabled: enabled && aks.length > 0,
  });
  const {
    resources: machineDeployments,
    errors: machineDeploymentErrors,
    isLoading: isLoadingMachineDeployments,
  } = useResources(withMachineDeployments, MachineDeployment, scopes, {
    enabled: enabled && withMachineDeployments.length > 0,
  });
  const {
    resources: azureMachineTemplates,
    errors: azureMachineTemplateErrors,
    isLoading: isLoadingAzureMachineTemplates,
  } = useResources(azure, AzureMachineTemplate, scopes, {
    enabled: enabled && azure.length > 0,
  });
  const {
    resources: vsphereMachineTemplates,
    errors: vsphereMachineTemplateErrors,
    isLoading: isLoadingVSphereMachineTemplates,
  } = useResources(vsphere, VSphereMachineTemplate, scopes, {
    enabled: enabled && vsphere.length > 0,
  });
  const { catalog: awsCatalog, isLoading: isLoadingAWSCatalog } =
    useMachineTypeCatalog('aws', { enabled: enabled && aws.length > 0 });
  const withAzureVmSizes = azure.length > 0 || aks.length > 0;
  const { catalog: azureCatalog, isLoading: isLoadingAzureCatalog } =
    useMachineTypeCatalog('azure', { enabled: enabled && withAzureVmSizes });

  const pools = useMemo(() => {
    const result = new Map<
      string,
      {
        cluster: Cluster;
        pools?: NodePoolCapacityInput[];
        isLoading: boolean;
        errorMessage?: string;
      }
    >();
    if (!enabled) {
      return result;
    }

    const machinePoolSource = {
      errors: machinePoolErrors,
      isLoading: isLoadingMachinePools,
    };
    const machineDeploymentSource = {
      errors: machineDeploymentErrors,
      isLoading: isLoadingMachineDeployments,
    };
    // The lists and datasets each infrastructure kind reads its pools from.
    const sourcesByKind: Record<
      string,
      { errors?: ErrorInfoUnion[]; isLoading: boolean }[]
    > = {
      [AWSCluster.kind]: [
        machinePoolSource,
        { errors: awsMachinePoolErrors, isLoading: isLoadingAWSMachinePools },
        { isLoading: isLoadingAWSCatalog },
      ],
      [AzureASOManagedCluster.kind]: [
        machinePoolSource,
        {
          errors: azureASOManagedMachinePoolErrors,
          isLoading: isLoadingAzureASOManagedMachinePools,
        },
        { isLoading: isLoadingAzureCatalog },
      ],
      [AzureCluster.kind]: [
        machineDeploymentSource,
        {
          errors: azureMachineTemplateErrors,
          isLoading: isLoadingAzureMachineTemplates,
        },
        { isLoading: isLoadingAzureCatalog },
      ],
      [VSphereCluster.kind]: [
        machineDeploymentSource,
        {
          errors: vsphereMachineTemplateErrors,
          isLoading: isLoadingVSphereMachineTemplates,
        },
      ],
      [VCDCluster.kind]: [machineDeploymentSource],
    };
    const resources = {
      machinePools,
      awsMachinePools,
      azureASOManagedMachinePools,
      machineDeployments,
      azureMachineTemplates,
      vsphereMachineTemplates,
    };
    const catalogs = { aws: awsCatalog, azure: azureCatalog };

    for (const cluster of clusters) {
      const sources =
        sourcesByKind[cluster.getInfrastructureRef()?.kind ?? ''] ?? [];
      // A 404 means the installation does not serve that CRD: no such pools.
      const errorMessage = errorMessageFor(
        sources.flatMap(({ errors = [] }) =>
          errors.filter(
            e => e.cluster === cluster.cluster && !isNotFoundError(e),
          ),
        ),
      );
      const isLoading =
        !errorMessage && sources.some(source => source.isLoading);

      result.set(keyOf(cluster), {
        cluster,
        pools:
          isLoading || errorMessage
            ? undefined
            : getClusterNodePools(cluster, resources, catalogs),
        isLoading,
        errorMessage,
      });
    }
    return result;
  }, [
    enabled,
    clusters,
    machinePools,
    machinePoolErrors,
    isLoadingMachinePools,
    awsMachinePools,
    awsMachinePoolErrors,
    isLoadingAWSMachinePools,
    azureASOManagedMachinePools,
    azureASOManagedMachinePoolErrors,
    isLoadingAzureASOManagedMachinePools,
    machineDeployments,
    machineDeploymentErrors,
    isLoadingMachineDeployments,
    azureMachineTemplates,
    azureMachineTemplateErrors,
    isLoadingAzureMachineTemplates,
    vsphereMachineTemplates,
    vsphereMachineTemplateErrors,
    isLoadingVSphereMachineTemplates,
    awsCatalog,
    isLoadingAWSCatalog,
    azureCatalog,
    isLoadingAzureCatalog,
  ]);

  const clusterIdsByInstallation = useMemo(() => {
    const ids: Record<string, string[]> = {};
    for (const { cluster, pools: clusterPools } of pools.values()) {
      if (clusterPools && needsNodeMetrics(clusterPools)) {
        (ids[cluster.cluster] ??= []).push(cluster.getName());
      }
    }
    return ids;
  }, [pools]);

  const metrics = useMimirNodePoolCapacity(clusterIdsByInstallation);

  const capacities = useMemo(() => {
    const result = new Map<string, ClusterWorkerCapacity>();
    for (const [key, entry] of pools) {
      const { cluster, pools: clusterPools, isLoading, errorMessage } = entry;
      if (!clusterPools) {
        result.set(key, { isLoading, errorMessage });
        continue;
      }

      if (!needsNodeMetrics(clusterPools)) {
        result.set(key, {
          isLoading: false,
          capacity: computeWorkerCapacity(clusterPools),
        });
        continue;
      }

      const installationMetrics = metrics.get(cluster.cluster);
      const metricsStatus = installationMetrics?.status ?? 'loading';
      result.set(key, {
        isLoading: metricsStatus === 'loading',
        capacity:
          metricsStatus === 'loading'
            ? undefined
            : computeWorkerCapacity(
                clusterPools,
                installationMetrics?.clusters?.get(cluster.getName()),
              ),
        metricsStatus,
      });
    }
    return result;
  }, [pools, metrics]);

  const errors = useMemo(
    () => [
      ...machinePoolErrors,
      ...awsMachinePoolErrors,
      ...azureASOManagedMachinePoolErrors,
      ...machineDeploymentErrors,
      ...azureMachineTemplateErrors,
      ...vsphereMachineTemplateErrors,
    ],
    [
      machinePoolErrors,
      awsMachinePoolErrors,
      azureASOManagedMachinePoolErrors,
      machineDeploymentErrors,
      azureMachineTemplateErrors,
      vsphereMachineTemplateErrors,
    ],
  );

  return { capacities, errors };
}
