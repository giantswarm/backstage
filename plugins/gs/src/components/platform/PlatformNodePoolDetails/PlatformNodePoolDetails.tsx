import { Flex } from '@backstage/ui';
import type { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type Fact,
  FactList,
  InfoCard,
  Mono,
} from '@giantswarm/backstage-plugin-ui-react';
import { useKarpenterNodePoolStatus } from '../../hooks';
import { ASGNodePoolConfiguration } from '../../clusters/cluster-details/ClusterNodePools/ASGNodePoolConfiguration';
import { AzureNodePoolConfiguration } from '../../clusters/cluster-details/ClusterNodePools/AzureNodePoolConfiguration';
import { NodePoolConfiguration } from '../../clusters/cluster-details/ClusterNodePools/NodePoolConfiguration';
import type { PlatformNodePool } from '../PlatformClusterNodePools/nodePools';

/** `<namespace>/<name>` of a resource, in monospace. */
function resourceFact(
  label: string,
  resource: KubeObject | undefined,
): Fact | undefined {
  return resource
    ? {
        label,
        value: (
          <Mono>{`${resource.getNamespace()}/${resource.getName()}`}</Mono>
        ),
      }
    : undefined;
}

/** The pool's Kubernetes resources, by kind and `<namespace>/<name>`. */
function Resources({ pool }: { pool: PlatformNodePool }) {
  const { resources } = pool;
  const facts = [
    resourceFact('MachinePool', resources.machinePool),
    resourceFact('AWSMachinePool', resources.awsMachinePool),
    resourceFact('MachineDeployment', resources.machineDeployment),
    resourceFact('AzureMachineTemplate', resources.azureMachineTemplate),
  ].filter((fact): fact is Fact => fact !== undefined);
  if (facts.length === 0) {
    return null;
  }
  return (
    <InfoCard title="Resources">
      <FactList facts={facts} maxWidth={null} />
    </InfoCard>
  );
}

function KarpenterDetails({
  pool,
  installationName,
  clusterName,
}: {
  pool: PlatformNodePool;
  installationName: string;
  clusterName: string;
}) {
  // Karpenter's own metrics: the nodes running, the limits and usage, the
  // mix of what runs and the disruptions allowed now.
  const { status } = useKarpenterNodePoolStatus({
    installationName,
    clusterName,
    nodePoolName: pool.name,
  });
  return (
    <NodePoolConfiguration
      pool={pool.resources.karpenterMachinePool}
      nodePoolName={pool.name}
      status={status}
    />
  );
}

export type PlatformNodePoolDetailsProps = {
  pool: PlatformNodePool;
  installationName: string;
  clusterName: string;
};

/**
 * The technical details of a node pool, by its kind: a Karpenter pool's
 * running summary, provisioning envelope, lifecycle and node template (the
 * classic page's `NodePoolConfiguration`); a machine pool's instance shape
 * and scaling (`ASGNodePoolConfiguration`, `AzureNodePoolConfiguration`)
 * and its resources.
 */
export function PlatformNodePoolDetails({
  pool,
  installationName,
  clusterName,
}: PlatformNodePoolDetailsProps) {
  if (pool.kind === 'karpenter') {
    return (
      <KarpenterDetails
        pool={pool}
        installationName={installationName}
        clusterName={clusterName}
      />
    );
  }
  const {
    machinePool,
    awsMachinePool,
    machineDeployment,
    azureMachineTemplate,
  } = pool.resources;
  return (
    <Flex direction="column" gap="4">
      {machinePool && (
        <ASGNodePoolConfiguration
          machinePool={machinePool}
          awsMachinePool={awsMachinePool}
        />
      )}
      {machineDeployment && (
        <AzureNodePoolConfiguration
          machineDeployment={machineDeployment}
          azureMachineTemplate={azureMachineTemplate}
        />
      )}
      <Resources pool={pool} />
    </Flex>
  );
}
