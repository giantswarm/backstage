import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Content,
  Link,
  Progress,
  ResponseErrorPanel,
  StatusError,
  StatusOK,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, WorkflowListItem } from '../../apis';
import { workflowDetailRouteRef } from '../../routes';

export function WorkflowsListPage() {
  const musterApi = useApi(musterApiRef);
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'workflows'],
    queryFn: () => musterApi.listWorkflows(),
  });

  const columns: TableColumn<WorkflowListItem>[] = [
    {
      title: 'Name',
      field: 'name',
      highlight: true,
      render: workflow => (
        <Link to={workflowDetailLink?.({ name: workflow.name }) ?? '#'}>
          {workflow.name}
        </Link>
      ),
    },
    {
      title: 'Description',
      field: 'description',
    },
    {
      title: 'Availability',
      field: 'available',
      width: '150px',
      render: workflow =>
        workflow.available ? (
          <StatusOK>Available</StatusOK>
        ) : (
          <StatusError>Unavailable</StatusError>
        ),
    },
  ];

  if (error) {
    return (
      <Content>
        <ResponseErrorPanel error={error as Error} />
      </Content>
    );
  }

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  const workflows = data?.workflows ?? [];

  return (
    <Content>
      <Table<WorkflowListItem>
        options={{
          pageSize: 50,
          pageSizeOptions: [10, 25, 50, 100],
          emptyRowsWhenPaging: false,
        }}
        data={workflows}
        columns={columns}
        style={{ width: '100%' }}
        title={
          <Typography variant="h6">Workflows ({workflows.length})</Typography>
        }
        emptyContent={
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ padding: 16 }}
          >
            No workflows defined in muster.
          </Typography>
        }
      />
    </Content>
  );
}
