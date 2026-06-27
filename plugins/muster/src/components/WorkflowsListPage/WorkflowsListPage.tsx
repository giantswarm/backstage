import { ReactNode } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Content,
  EmptyState,
  Link,
  Progress,
  StatusError,
  StatusOK,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { Chip, Typography } from '@material-ui/core';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterData } from '../MusterDataProvider';
import { MusterWorkflow } from '../../lib/k8s';
import { workflowDetailRouteRef } from '../../routes';

/** Flat, table-friendly projection of a Workflow CR (kept alongside the CR). */
interface WorkflowRow {
  id: string;
  name: string;
  description: string;
  valid: string;
  steps: number;
  category: string;
  installation: string;
  created?: string;
  workflow: MusterWorkflow;
}

function toRow(workflow: MusterWorkflow): WorkflowRow {
  return {
    id: `${workflow.cluster}/${workflow.getName()}`,
    name: workflow.getName(),
    description: workflow.getDescription() ?? '',
    valid: workflow.isValid() ? 'Valid' : 'Invalid',
    steps: workflow.getStepCount(),
    category: workflow.getCategory() ?? '-',
    installation: workflow.cluster,
    created: workflow.getCreatedTimestamp(),
    workflow,
  };
}

export function WorkflowsListPage() {
  const { workflows, activeInstallations, isLoading } = useMusterData();
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);

  const detailLink = (row: WorkflowRow) => {
    const base = workflowDetailLink?.({ name: row.name }) ?? '#';
    const params = new URLSearchParams();
    if (row.installation) {
      params.set('installation', row.installation);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const columns: TableColumn<WorkflowRow>[] = [
    {
      title: 'Name',
      field: 'name',
      highlight: true,
      render: row => <Link to={detailLink(row)}>{row.name}</Link>,
    },
    { title: 'Description', field: 'description' },
    {
      title: 'Valid',
      field: 'valid',
      width: '110px',
      render: row =>
        row.workflow.isValid() ? (
          <StatusOK>Valid</StatusOK>
        ) : (
          <StatusError>Invalid</StatusError>
        ),
    },
    { title: 'Steps', field: 'steps', type: 'numeric', width: '90px' },
    {
      title: 'Category',
      field: 'category',
      render: row =>
        row.category === '-' ? (
          <Typography variant="body2" color="textSecondary">
            -
          </Typography>
        ) : (
          <Chip size="small" label={row.category} />
        ),
    },
    { title: 'Installation', field: 'installation' },
    {
      title: 'Age',
      field: 'created',
      width: '120px',
      render: row =>
        row.created ? (
          <DateComponent value={row.created} relative tooltip />
        ) : (
          <>-</>
        ),
    },
  ];

  let body: ReactNode;
  if (isLoading) {
    body = <Progress />;
  } else if (activeInstallations.length === 0) {
    body = (
      <EmptyState
        missing="data"
        title="Select an installation"
        description="Choose one or more muster installations above to list their workflows."
      />
    );
  } else {
    const rows = workflows.map(toRow);
    body = (
      <Table<WorkflowRow>
        title={<Typography variant="h6">Workflows ({rows.length})</Typography>}
        columns={columns}
        data={rows}
        style={{ width: '100%' }}
        options={{
          search: true,
          filtering: true,
          paging: rows.length > 50,
          pageSize: 50,
          pageSizeOptions: [25, 50, 100],
          emptyRowsWhenPaging: false,
          actionsColumnIndex: -1,
        }}
        emptyContent={
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ padding: 16 }}
          >
            No Workflow CRs found in the selected installation(s). The muster
            CRDs may not be installed there.
          </Typography>
        }
      />
    );
  }

  return (
    <Content>
      <InstallationPicker />
      {body}
      <Typography variant="caption" color="textSecondary">
        Read-only view of muster Workflow CRs.{' '}
        <Link to="https://github.com/giantswarm/muster">muster docs</Link>
      </Typography>
    </Content>
  );
}
