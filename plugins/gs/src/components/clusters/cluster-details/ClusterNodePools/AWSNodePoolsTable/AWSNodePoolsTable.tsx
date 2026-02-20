import { useCallback, useMemo, useState } from 'react';
import { Table } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import {
  AWSMachinePool,
  KarpenterMachinePool,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useNodePoolsForCluster } from '../../../../hooks';
import { AWSNodePoolRow, getInitialColumns } from './columns';

const TABLE_ID = 'aws-node-pools';

export const AWSNodePoolsTable = () => {
  const {
    machinePools,
    awsMachinePools,
    karpenterMachinePools,
    isLoading,
    errors,
  } = useNodePoolsForCluster();

  useShowErrors(errors);

  const { visibleColumns, saveVisibleColumns } = useTableColumns(TABLE_ID);

  const [columns, setColumns] = useState(getInitialColumns({ visibleColumns }));

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
  }, [machinePools, awsMachinePools, karpenterMachinePools]);

  return (
    <Table<AWSNodePoolRow>
      isLoading={isLoading}
      options={{
        paging: false,
        columnsButton: true,
      }}
      data={data}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Node pools ({data.length})</Typography>}
      columns={columns}
      onChangeColumnHidden={(column, hidden) => {
        if (column.field) {
          handleChangeColumnHidden(column.field, hidden);
        }
      }}
    />
  );
};
