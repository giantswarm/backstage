import { useMemo } from 'react';
import {
  AWSCluster,
  AzureCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  useMachineTypeCatalog,
  useNodePoolsForAWSCluster,
  useNodePoolsForAzureCluster,
} from '../../hooks';
import {
  buildAWSNodePoolRows,
  buildNodePoolRows,
  describeAzureVmSize,
} from '../../clusters/nodePools';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import {
  awsNodePools,
  azureNodePools,
  type PlatformNodePool,
} from '../utils/nodePools';

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

const NOT_SHOWN: PlatformNodePools = {
  isShown: false,
  pools: [],
  isLoading: false,
  errors: [],
};

/**
 * The node pools of the current cluster, read as the classic cluster page
 * reads them: an AWS cluster's MachinePools with their AWSMachinePools and
 * KarpenterMachinePools, an Azure cluster's MachineDeployments with their
 * AzureMachineTemplates. Each read runs only for its kind of cluster. The
 * cluster page calls it once and hands the result to the tab.
 */
export function usePlatformNodePools(): PlatformNodePools {
  const { cluster } = useCurrentCluster();
  const kind = cluster.getInfrastructureRef()?.kind;
  const {
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    isLoading: isLoadingAWS,
    errors: awsErrors,
  } = useNodePoolsForAWSCluster(cluster);
  const {
    machineDeployments,
    azureMachineTemplates,
    isLoading: isLoadingAzure,
    errors: azureErrors,
  } = useNodePoolsForAzureCluster(cluster);
  const { catalog: awsCatalog } = useMachineTypeCatalog('aws', {
    enabled: kind === AWSCluster.kind,
  });
  const { catalog: azureCatalog } = useMachineTypeCatalog('azure', {
    enabled: kind === AzureCluster.kind,
  });

  const aws = useMemo(
    () =>
      kind === AWSCluster.kind
        ? {
            isShown: true,
            pools: awsNodePools(
              buildAWSNodePoolRows(
                machinePools,
                awsMachinePools,
                karpenterMachinePools,
                awsCatalog,
              ),
            ),
            isLoading: isLoadingAWS,
            errors: messagesOf(awsErrors),
          }
        : undefined,
    [
      kind,
      machinePools,
      awsMachinePools,
      karpenterMachinePools,
      awsCatalog,
      isLoadingAWS,
      awsErrors,
    ],
  );
  const azure = useMemo(
    () =>
      kind === AzureCluster.kind
        ? {
            isShown: true,
            pools: azureNodePools(
              buildNodePoolRows(
                machineDeployments,
                azureMachineTemplates,
                describeAzureVmSize(azureCatalog),
              ),
            ),
            isLoading: isLoadingAzure,
            errors: messagesOf(azureErrors),
          }
        : undefined,
    [
      kind,
      machineDeployments,
      azureMachineTemplates,
      azureCatalog,
      isLoadingAzure,
      azureErrors,
    ],
  );
  return aws ?? azure ?? NOT_SHOWN;
}

/**
 * The number on the Node pools tab: none while the pools are read, where a
 * read failed (it would miss pools) or where the tab shows none.
 */
export function nodePoolCount({
  isShown,
  pools,
  isLoading,
  errors,
}: PlatformNodePools): number | undefined {
  return isShown && !isLoading && errors.length === 0
    ? pools.length
    : undefined;
}
