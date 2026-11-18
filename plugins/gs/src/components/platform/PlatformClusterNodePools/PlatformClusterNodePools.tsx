import { useMemo } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import {
  AWSCluster,
  AzureCluster,
  AzureASOManagedCluster,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  EmptyStateCard,
  MetricsUnavailableAlert,
  SectionHeader,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  useMachineTypeCatalog,
  useMimirNodePoolNodes,
  useNodePoolsForAWSCluster,
  useNodePoolsForAzureCluster,
} from '../../hooks';
import {
  buildNodePoolRows,
  describeAzureVmSize,
  AWS_MANAGED_CLUSTER_KIND,
} from '../../clusters/nodePools';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import { useSelectedNodePool } from '../../clusters/cluster-details/ClusterNodePools/useSelectedNodePool';
import { PlatformNodePoolDetails } from '../PlatformNodePoolDetails';
import { PlatformNodePoolsTable } from '../PlatformNodePoolsTable';
import { PlatformNodesTable } from '../PlatformNodesTable';
import {
  awsNodePools,
  azureNodePools,
  type PlatformNodePool,
} from './nodePools';

/** What the empty state calls the clusters of an infrastructure kind. */
const PROVIDER_NAMES: Record<string, string> = {
  [AWS_MANAGED_CLUSTER_KIND]: 'EKS',
  [AzureASOManagedCluster.kind]: 'AKS',
  [VSphereCluster.kind]: 'vSphere',
  [VCDCluster.kind]: 'Cloud Director',
};

export type PlatformNodePools = {
  /** False for an infrastructure kind the tab does not show yet. */
  isShown: boolean;
  pools: PlatformNodePool[];
  isLoading: boolean;
  /** The messages of the reads that failed. */
  errors: string[];
};

/** A failed read of `useResources`, as the classic hooks return them. */
type ReadError = ReturnType<typeof useNodePoolsForAWSCluster>['errors'][number];

function messagesOf(errors: ReadError[]): string[] {
  return errors.map(info =>
    info.type === 'incompatibility'
      ? `${info.cluster} serves an API version the portal cannot read.`
      : info.error.message,
  );
}

/**
 * The node pools of the current cluster, read as the classic cluster page
 * reads them: an AWS cluster's MachinePools with their AWSMachinePools and
 * KarpenterMachinePools, an Azure cluster's MachineDeployments with their
 * AzureMachineTemplates. Each read runs only for its kind of cluster.
 */
export function usePlatformNodePools(): PlatformNodePools {
  const { cluster } = useCurrentCluster();
  const kind = cluster.getInfrastructureRef()?.kind;
  const aws = useNodePoolsForAWSCluster(cluster);
  const azure = useNodePoolsForAzureCluster(cluster);
  const { catalog: awsCatalog } = useMachineTypeCatalog('aws', {
    enabled: kind === AWSCluster.kind,
  });
  const { catalog: azureCatalog } = useMachineTypeCatalog('azure', {
    enabled: kind === AzureCluster.kind,
  });

  return useMemo(() => {
    if (kind === AWSCluster.kind) {
      return {
        isShown: true,
        pools: awsNodePools(
          aws.machinePools,
          aws.awsMachinePools,
          aws.karpenterMachinePools,
          awsCatalog,
        ),
        isLoading: aws.isLoading,
        errors: messagesOf(aws.errors),
      };
    }
    if (kind === AzureCluster.kind) {
      return {
        isShown: true,
        pools: azureNodePools(
          buildNodePoolRows(
            azure.machineDeployments,
            azure.azureMachineTemplates,
            describeAzureVmSize(azureCatalog),
          ),
          azure.machineDeployments,
        ),
        isLoading: azure.isLoading,
        errors: messagesOf(azure.errors),
      };
    }
    return { isShown: false, pools: [], isLoading: false, errors: [] };
  }, [kind, aws, azure, awsCatalog, azureCatalog]);
}

/** The node pools tab's count: undefined until the pools are read. */
export function usePlatformNodePoolCount(): number | undefined {
  const { isShown, pools, isLoading } = usePlatformNodePools();
  return isShown && !isLoading ? pools.length : undefined;
}

/** "Nodes in <pool>": the pool's nodes, from Mimir. */
function PoolNodes({
  pool,
  installationName,
  clusterName,
}: {
  pool: PlatformNodePool;
  installationName: string;
  clusterName: string;
}) {
  const { nodes, isLoading, error } = useMimirNodePoolNodes({
    installationName,
    clusterName,
    nodePoolName: pool.name,
  });
  let content;
  if (error) {
    content = (
      <MetricsUnavailableAlert
        error={error}
        title="Node metrics could not be loaded"
        description={error.message}
      />
    );
  } else if (!isLoading && nodes.length === 0) {
    content = (
      <Text variant="body-medium" color="secondary">
        No node metrics for this node pool.
      </Text>
    );
  } else {
    content = <PlatformNodesTable nodes={nodes} isLoading={isLoading} />;
  }
  return (
    <section aria-label={`Nodes in ${pool.name}`}>
      <Flex direction="column" gap="3">
        <SectionHeader
          as="h2"
          variant="title-x-small"
          title={`Nodes in ${pool.name}`}
          compact
        />
        {content}
      </Flex>
    </section>
  );
}

/**
 * The Node pools tab of a Platform cluster page: the cluster's pools, one
 * of which a person selects (`?name=<pool>`, as on the classic page, so a
 * reload or a shared link shows the same pool); then that pool's nodes, for
 * a machine pool, and its technical details. A Karpenter pool has no fixed
 * nodes to list: its details say what runs.
 */
export function PlatformClusterNodePools() {
  const { cluster, installationName } = useCurrentCluster();
  const { isShown, pools, isLoading, errors } = usePlatformNodePools();
  const { selectedNodePool, setSelectedNodePool } = useSelectedNodePool();
  const kind = cluster.getInfrastructureRef()?.kind;

  if (!isShown) {
    const provider = (kind && PROVIDER_NAMES[kind]) ?? 'these';
    return (
      <EmptyStateCard
        title="Node pools aren’t shown here yet"
        description={`Node pools of ${provider} clusters aren't shown here yet.`}
      />
    );
  }

  const selected = pools.find(pool => pool.name === selectedNodePool);
  const readFailed = errors.length > 0;

  if (!isLoading && pools.length === 0) {
    return readFailed ? (
      <Alert
        role="alert"
        status="danger"
        icon
        title="Could not read the node pools"
        description={errors.join(' ')}
      />
    ) : (
      <EmptyStateCard
        title="No node pools yet"
        description="This cluster has no worker node pools."
      />
    );
  }

  return (
    <Flex direction="column" gap="5">
      {readFailed && (
        <Alert
          status="warning"
          icon
          title="Some node pools could not be read"
          description={errors.join(' ')}
        />
      )}
      <PlatformNodePoolsTable
        pools={pools}
        isLoading={isLoading && pools.length === 0}
        selected={selected?.name}
        onSelect={setSelectedNodePool}
      />
      {!isLoading && !selected && (
        <Text variant="body-medium" color="secondary">
          Select a node pool to see its nodes and details.
        </Text>
      )}
      {selected && (
        // Keyed by the pool, so another pool's details start open again.
        <Flex key={selected.name} direction="column" gap="5">
          {selected.kind === 'machinePool' && (
            <PoolNodes
              pool={selected}
              installationName={installationName}
              clusterName={cluster.getName()}
            />
          )}
          <TechnicalDetailsFoldOut
            defaultExpanded
            title={`Technical details of ${selected.name}`}
          >
            <PlatformNodePoolDetails
              pool={selected}
              installationName={installationName}
              clusterName={cluster.getName()}
            />
          </TechnicalDetailsFoldOut>
        </Flex>
      )}
    </Flex>
  );
}
