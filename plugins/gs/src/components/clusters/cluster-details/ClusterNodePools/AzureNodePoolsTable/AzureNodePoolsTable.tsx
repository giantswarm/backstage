import { useCallback, useMemo, useState } from 'react';
import { Table } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import useDebounce from 'react-use/esm/useDebounce';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useNodePoolsForAzureCluster } from '../../../../hooks';
import { AzureNodePoolRow, getInitialColumns } from './columns';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { NodePoolDetailsLayout } from '../NodePoolDetailsLayout';
import { useSelectedNodePool } from '../useSelectedNodePool';
import { NodePoolNodes } from '../NodePoolNodes';

const TABLE_ID = 'azure-node-pools';

export const AzureNodePoolsTable = () => {
  const { installationName, cluster } = useCurrentCluster();
  const { machineDeployments, azureMachineTemplates, isLoading, errors } =
    useNodePoolsForAzureCluster(cluster);

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

  const data: AzureNodePoolRow[] = useMemo(() => {
    return machineDeployments.map(deployment => {
      const infraRef = deployment.getInfrastructureRef();
      const infraName = infraRef?.name;

      let vmSize: string | undefined;

      if (infraName) {
        const template = azureMachineTemplates.find(
          t => t.getName() === infraName,
        );
        if (template) {
          vmSize = template.getVmSize();
        }
      }

      return {
        id: deployment.getName(),
        name: deployment.getName(),
        desiredReplicas: deployment.getDesiredReplicas(),
        readyReplicas: deployment.getReadyReplicas(),
        vmSize,
        phase: deployment.getPhase(),
        created: deployment.getCreatedTimestamp(),
      };
    });
  }, [machineDeployments, azureMachineTemplates]);

  const details = selectedNodePool ? (
    <NodePoolNodes
      installationName={installationName}
      clusterName={cluster.getName()}
      nodePoolName={selectedNodePool}
    />
  ) : null;

  return (
    <NodePoolDetailsLayout
      selectedNodePool={selectedNodePool}
      details={details}
      onClose={clearSelectedNodePool}
    >
      <Table<AzureNodePoolRow>
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
    </NodePoolDetailsLayout>
  );
};
