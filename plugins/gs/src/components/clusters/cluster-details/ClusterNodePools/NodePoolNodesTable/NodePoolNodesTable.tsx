import { Table } from '@backstage/core-components';
import { NodePoolNode } from '../../../../hooks';
import { getColumns } from './columns';

interface NodePoolNodesTableProps {
  nodes: NodePoolNode[];
  isLoading: boolean;
  provider: 'aws' | 'azure';
}

export const NodePoolNodesTable = ({
  nodes,
  isLoading,
  provider,
}: NodePoolNodesTableProps) => {
  const columns = getColumns(provider);

  return (
    <Table
      isLoading={isLoading}
      data={nodes}
      columns={columns}
      options={{
        paging: false,
        padding: 'dense',
      }}
      components={{
        // The node pool name, node count and close control live on the
        // surrounding tabs, so the table needs no chrome of its own.
        Toolbar: () => null,
      }}
      style={{ width: '100%' }}
    />
  );
};
