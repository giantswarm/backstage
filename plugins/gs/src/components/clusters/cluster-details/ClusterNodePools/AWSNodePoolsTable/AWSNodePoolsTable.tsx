import { useCallback, useMemo, useState } from 'react';
import { StructuredMetadataTable, Table } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import {
  AWSMachinePool,
  KarpenterMachinePool,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useNodePoolsForAWSCluster } from '../../../../hooks';
import { AWSNodePoolRow, getInitialColumns } from './columns';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';

const TABLE_ID = 'aws-node-pools';

export const AWSNodePoolsTable = () => {
  const { cluster } = useCurrentCluster();
  const { machinePools, awsMachinePools, isLoading, errors } =
    useNodePoolsForAWSCluster(cluster);

  useShowErrors(errors);

  const { selectedNodePool, setSelectedNodePool, clearSelectedNodePool } =
    useSelectedNodePool();

  const { visibleColumns, saveVisibleColumns } = useTableColumns(TABLE_ID);

  const [columns, setColumns] = useState(
    getInitialColumns({
      visibleColumns,
      onSelectNodePool: setSelectedNodePool,
    }),
  );

  const handleChangeColumnHidden = useCallback(
    (field: string, hidden: boolean) => {
      setColumns(prev =>
        prev.map(column => {
          if (column.field === field) {
            return { ...column, hidden };
          }
          return column;
        }),
      );
    },
    [],
  );

  useDebounce(
    () => {
      const newVisibleColumns = columns
        .filter(column => !Boolean(column.hidden))
        .map(column => column.field) as string[];

      saveVisibleColumns(newVisibleColumns);
    },
    10,
    [columns],
  );

  const data: AWSNodePoolRow[] = useMemo(() => {
    return machinePools.map(pool => {
      const infraRef = pool.getInfrastructureRef();
      const infraKind = infraRef?.kind;
      const infraName = infraRef?.name;

      let type: 'ASG' | 'Karpenter' = 'ASG';
      let instanceType: string | undefined;
      let availabilityZones: string[] | undefined;
      let minSize: number | undefined;
      let maxSize: number | undefined;

      if (infraKind === KarpenterMachinePool.kind && infraName) {
        type = 'Karpenter';
        // Karpenter pools don't expose instance type / scaling in the same way
      } else if (infraKind === AWSMachinePool.kind && infraName) {
        const awsPool = awsMachinePools.find(p => p.getName() === infraName);
        if (awsPool) {
          instanceType = awsPool.getInstanceType();
          availabilityZones = awsPool.getAvailabilityZones();
          minSize = awsPool.getMinSize();
          maxSize = awsPool.getMaxSize();
        }
      }

      return {
        name: pool.getName(),
        type,
        desiredReplicas: pool.getDesiredReplicas(),
        readyReplicas: pool.getReadyReplicas(),
        instanceType,
        availabilityZones,
        minSize,
        maxSize,
        phase: pool.getPhase(),
        created: pool.getCreatedTimestamp(),
      };
    });
  }, [machinePools, awsMachinePools]);

  // TODO: Remove mock data — temporary for testing long tables
  const mockData: AWSNodePoolRow[] = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      name: `mock-pool-${String(i + 1).padStart(2, '0')}`,
      type: (i % 3 === 0 ? 'Karpenter' : 'ASG') as 'ASG' | 'Karpenter',
      desiredReplicas: 3 + (i % 5),
      readyReplicas: 2 + (i % 5),
      instanceType:
        i % 3 === 0 ? undefined : `m5.${['large', 'xlarge', '2xlarge'][i % 3]}`,
      availabilityZones: [`eu-west-1${String.fromCharCode(97 + (i % 3))}`],
      minSize: i % 3 === 0 ? undefined : 1,
      maxSize: i % 3 === 0 ? undefined : 10,
      phase: ['Running', 'Provisioning', 'Running', 'Deleting'][i % 4],
      created: new Date(Date.now() - i * 86400000).toISOString(),
    }));
  }, []);

  const allData = useMemo(() => [...data, ...mockData], [data, mockData]);

  const selectedRow = allData.find(row => row.name === selectedNodePool);
  const details = selectedRow ? (
    <StructuredMetadataTable metadata={selectedRow} />
  ) : null;

  return (
    <NodePoolDetailsLayout
      selectedNodePool={selectedNodePool}
      details={details}
      onClose={clearSelectedNodePool}
    >
      <Table<AWSNodePoolRow>
        isLoading={isLoading}
        options={{
          paging: false,
          columnsButton: true,
        }}
        data={allData}
        style={{ width: '100%' }}
        title={
          <Typography variant="h6">Node pools ({allData.length})</Typography>
        }
        columns={columns}
        onChangeColumnHidden={(column, hidden) => {
          if (column.field) {
            handleChangeColumnHidden(column.field, hidden);
          }
        }}
      />
    </NodePoolDetailsLayout>
  );
};
