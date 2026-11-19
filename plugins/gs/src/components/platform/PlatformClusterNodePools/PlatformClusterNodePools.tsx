import { Alert, Flex, Text } from '@backstage/ui';
import {
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
import { useMimirNodePoolNodes } from '../../hooks';
import { AWS_MANAGED_CLUSTER_KIND } from '../../clusters/nodePools';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import { useSelectedNodePool } from '../../clusters/cluster-details/ClusterNodePools/useSelectedNodePool';
import { PlatformNodePoolDetails } from '../PlatformNodePoolDetails';
import { PlatformNodePoolsTable } from '../PlatformNodePoolsTable';
import { PlatformNodesTable } from '../PlatformNodesTable';
import type { PlatformNodePools } from '../hooks';
import type { PlatformNodePool } from '../utils/nodePools';

/** What the empty state calls the clusters of an infrastructure kind. */
const PROVIDER_NAMES: Record<string, string> = {
  [AWS_MANAGED_CLUSTER_KIND]: 'EKS',
  [AzureASOManagedCluster.kind]: 'AKS',
  [VSphereCluster.kind]: 'vSphere',
  [VCDCluster.kind]: 'Cloud Director',
};

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
 * a machine pool, and its technical details. A Karpenter pool has no node
 * table, as the design draws it: its details say what runs.
 */
export function PlatformClusterNodePools({
  nodePools,
}: {
  /** The cluster's pools, which the page reads once (`usePlatformNodePools`). */
  nodePools: PlatformNodePools;
}) {
  const { cluster, installationName } = useCurrentCluster();
  const { isShown, pools, isLoading, errors } = nodePools;
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
