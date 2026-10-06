import { useMemo } from 'react';
import {
  AWSCluster,
  AWSMachinePool,
  AWSManagedMachinePool,
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
import { Labels } from '@giantswarm/backstage-plugin-gs-common';
import {
  AWS_MANAGED_CLUSTER_KIND,
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

type ListScope = {
  namespace?: string;
  labelSelector?: { matchingLabels: Record<string, string> };
};

/**
 * Lists in the namespace of the clusters when an installation's clusters all
 * share one (always so for a single cluster), so a cluster's page needs no
 * more than namespace access; across namespaces otherwise. `pools` also
 * selects the MachinePools and MachineDeployments of an installation's only
 * cluster by its label, as the Node pools tab lists them, so the two share
 * one query.
 */
function listScopes(clusters: Cluster[]): {
  all: Record<string, ListScope>;
  pools: Record<string, ListScope>;
} {
  const byInstallation = new Map<string, Cluster[]>();
  for (const cluster of clusters) {
    const installationClusters = byInstallation.get(cluster.cluster) ?? [];
    installationClusters.push(cluster);
    byInstallation.set(cluster.cluster, installationClusters);
  }

  const all: Record<string, ListScope> = {};
  const pools: Record<string, ListScope> = {};
  for (const [installationName, installationClusters] of byInstallation) {
    const namespaces = new Set(installationClusters.map(c => c.getNamespace()));
    const [namespace] = namespaces;
    if (namespaces.size !== 1 || !namespace) {
      continue;
    }

    all[installationName] = { namespace };
    pools[installationName] =
      installationClusters.length === 1
        ? {
            namespace,
            labelSelector: {
              matchingLabels: {
                [Labels.labelClusterName]: installationClusters[0].getName(),
              },
            },
          }
        : { namespace };
  }
  return { all, pools };
}

type ListState = {
  isLoading: boolean;
  queries: {
    cluster: string;
    query: { isSuccess: boolean; isError: boolean };
  }[];
  errors: ErrorInfoUnion[];
};

/**
 * Whether `list` is still loading on one installation. The list's own
 * `isLoading` covers the whole fleet, so it stays true while any other
 * installation is slow or unreachable.
 */
function isLoadingOn(list: ListState, installationName: string): boolean {
  if (!list.isLoading) {
    return false;
  }
  if (list.errors.some(e => e.cluster === installationName)) {
    return false;
  }
  const entry = list.queries.find(q => q.cluster === installationName);
  return !entry || !(entry.query.isSuccess || entry.query.isError);
}

/** A list or dataset a cluster's node pools are read from. */
type PoolSource = {
  errors: ErrorInfoUnion[];
  isLoadingOn: (installationName: string) => boolean;
};

function listSource(list: ListState): PoolSource {
  return {
    errors: list.errors,
    isLoadingOn: installationName => isLoadingOn(list, installationName),
  };
}

function catalogSource(isLoading: boolean): PoolSource {
  return { errors: [], isLoadingOn: () => isLoading };
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
  const installations = useMemo(() => {
    const byKind = installationsByInfraKind(clusters);
    const aws = byKind[AWSCluster.kind] ?? [];
    const eks = byKind[AWS_MANAGED_CLUSTER_KIND] ?? [];
    const aks = byKind[AzureASOManagedCluster.kind] ?? [];
    const azure = byKind[AzureCluster.kind] ?? [];
    const vsphere = byKind[VSphereCluster.kind] ?? [];
    const vcd = byKind[VCDCluster.kind] ?? [];
    return {
      aws,
      eks,
      aks,
      azure,
      vsphere,
      withMachinePools: Array.from(new Set([...aws, ...eks, ...aks])),
      withMachineDeployments: Array.from(
        new Set([...azure, ...vsphere, ...vcd]),
      ),
    };
  }, [clusters]);
  const { aws, eks, aks, azure, vsphere } = installations;
  const { withMachinePools, withMachineDeployments } = installations;

  const scopes = useMemo(() => listScopes(clusters), [clusters]);

  const machinePoolList = useResources(
    withMachinePools,
    MachinePool,
    scopes.pools,
    { enabled: enabled && withMachinePools.length > 0 },
  );
  const awsMachinePoolList = useResources(aws, AWSMachinePool, scopes.all, {
    enabled: enabled && aws.length > 0,
  });
  const awsManagedMachinePoolList = useResources(
    eks,
    AWSManagedMachinePool,
    scopes.all,
    { enabled: enabled && eks.length > 0 },
  );
  const azureASOManagedMachinePoolList = useResources(
    aks,
    AzureASOManagedMachinePool,
    scopes.all,
    { enabled: enabled && aks.length > 0 },
  );
  const machineDeploymentList = useResources(
    withMachineDeployments,
    MachineDeployment,
    scopes.pools,
    { enabled: enabled && withMachineDeployments.length > 0 },
  );
  const azureMachineTemplateList = useResources(
    azure,
    AzureMachineTemplate,
    scopes.all,
    { enabled: enabled && azure.length > 0 },
  );
  const vsphereMachineTemplateList = useResources(
    vsphere,
    VSphereMachineTemplate,
    scopes.all,
    { enabled: enabled && vsphere.length > 0 },
  );
  const withAwsInstanceTypes = aws.length > 0 || eks.length > 0;
  const { catalog: awsCatalog, isLoading: isLoadingAWSCatalog } =
    useMachineTypeCatalog('aws', {
      enabled: enabled && withAwsInstanceTypes,
    });
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

    const machinePoolSource = listSource(machinePoolList);
    const machineDeploymentSource = listSource(machineDeploymentList);
    const awsCatalogSource = catalogSource(isLoadingAWSCatalog);
    const azureCatalogSource = catalogSource(isLoadingAzureCatalog);
    // The lists and datasets each infrastructure kind reads its pools from.
    const sourcesByKind: Record<string, PoolSource[]> = {
      [AWSCluster.kind]: [
        machinePoolSource,
        listSource(awsMachinePoolList),
        awsCatalogSource,
      ],
      [AWS_MANAGED_CLUSTER_KIND]: [
        machinePoolSource,
        listSource(awsManagedMachinePoolList),
        awsCatalogSource,
      ],
      [AzureASOManagedCluster.kind]: [
        machinePoolSource,
        listSource(azureASOManagedMachinePoolList),
        azureCatalogSource,
      ],
      [AzureCluster.kind]: [
        machineDeploymentSource,
        listSource(azureMachineTemplateList),
        azureCatalogSource,
      ],
      [VSphereCluster.kind]: [
        machineDeploymentSource,
        listSource(vsphereMachineTemplateList),
      ],
      [VCDCluster.kind]: [machineDeploymentSource],
    };
    const resources = {
      machinePools: machinePoolList.resources,
      awsMachinePools: awsMachinePoolList.resources,
      awsManagedMachinePools: awsManagedMachinePoolList.resources,
      azureASOManagedMachinePools: azureASOManagedMachinePoolList.resources,
      machineDeployments: machineDeploymentList.resources,
      azureMachineTemplates: azureMachineTemplateList.resources,
      vsphereMachineTemplates: vsphereMachineTemplateList.resources,
    };
    const catalogs = { aws: awsCatalog, azure: azureCatalog };

    for (const cluster of clusters) {
      const sources =
        sourcesByKind[cluster.getInfrastructureRef()?.kind ?? ''] ?? [];
      // A 404 means the installation does not serve that CRD: no such pools.
      const errorMessage = errorMessageFor(
        sources.flatMap(({ errors }) =>
          errors.filter(
            e => e.cluster === cluster.cluster && !isNotFoundError(e),
          ),
        ),
      );
      const isLoading =
        !errorMessage &&
        sources.some(source => source.isLoadingOn(cluster.cluster));

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
    machinePoolList,
    awsMachinePoolList,
    awsManagedMachinePoolList,
    azureASOManagedMachinePoolList,
    machineDeploymentList,
    azureMachineTemplateList,
    vsphereMachineTemplateList,
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
      const clusterMetrics = installationMetrics?.clusters?.[cluster.getName()];
      let metricsStatus = installationMetrics?.status ?? 'loading';
      // The previous answer, kept while the query for a new set of clusters
      // runs, does not cover a cluster added to it.
      if (metricsStatus === 'ok' && !clusterMetrics) {
        metricsStatus = 'loading';
      }
      result.set(key, {
        isLoading: metricsStatus === 'loading',
        capacity:
          metricsStatus === 'loading'
            ? undefined
            : computeWorkerCapacity(clusterPools, clusterMetrics),
        metricsStatus,
      });
    }
    return result;
  }, [pools, metrics]);

  const errors = useMemo(
    () => [
      ...machinePoolList.errors,
      ...awsMachinePoolList.errors,
      ...awsManagedMachinePoolList.errors,
      ...azureASOManagedMachinePoolList.errors,
      ...machineDeploymentList.errors,
      ...azureMachineTemplateList.errors,
      ...vsphereMachineTemplateList.errors,
    ],
    [
      machinePoolList.errors,
      awsMachinePoolList.errors,
      awsManagedMachinePoolList.errors,
      azureASOManagedMachinePoolList.errors,
      machineDeploymentList.errors,
      azureMachineTemplateList.errors,
      vsphereMachineTemplateList.errors,
    ],
  );

  return { capacities, errors };
}
