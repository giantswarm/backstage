import { SubvalueCell, Table, TableColumn } from '@backstage/core-components';
import {
  getResourceRequestStatus,
  getResourceRequestStatusMessage,
  Resource,
  ResourceRequest,
} from '@giantswarm/backstage-plugin-gs-common';
import SyncIcon from '@material-ui/icons/Sync';
import { Typography } from '@material-ui/core';
import { useResourceRequests } from '../../hooks';
import { sortAndFilterOptions } from '../../utils/tableHelpers';
import { ResourceRequestStatus } from '../ResourceRequestStatus';

function getResourceRequestDescription(resource: ResourceRequest) {
  switch (resource.kind) {
    case 'GitHubApp':
      return 'Compound resource request.';
    case 'GitHubRepo':
      return 'Create GitHub repository.';
    case 'AppDeployment':
      return 'Create app deployment.';
    default:
      return '';
  }
}

function formatKind(kind: string) {
  switch (kind) {
    case 'githubapp':
      return 'GitHubApp';
    case 'githubrepo':
      return 'GitHubRepo';
    case 'appdeployment':
      return 'AppDeployment';
    default:
      return '';
  }
}

type Row = {
  installationName: string;
  kind: string;
  name: string;
  namespace?: string;
  status?: string;
  description: string;
  apiVersion: string;
};

type ResourceRequestsTableViewProps = {
  loading: boolean;
  retry: () => void;
  resources: Resource<ResourceRequest>[];
  baseRoute: string;
};

const ResourceRequestsTableView = ({
  loading,
  retry,
  resources,
}: ResourceRequestsTableViewProps) => {
  const data: Row[] = resources.map(({ installationName, ...resource }) => ({
    installationName,
    kind: resource.kind,
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
    status: getResourceRequestStatus(resource),
    message: getResourceRequestStatusMessage(resource),
    description: getResourceRequestDescription(resource),
    apiVersion: resource.apiVersion,
  }));

  const generatedColumns: TableColumn<Row>[] = [
    {
      title: 'Namespace/Name',
      field: 'name',
      highlight: true,
      render: row => {
        const LinkWrapper = () => {
          return (
            <>
              {row.namespace && (
                <Typography variant="inherit" noWrap>
                  {row.namespace}/
                </Typography>
              )}
              <Typography variant="inherit" noWrap>
                {row.name}
              </Typography>
            </>
          );
        };

        return (
          <SubvalueCell value={<LinkWrapper />} subvalue={row.description} />
        );
      },
      ...sortAndFilterOptions(row => `${row.namespace} / ${row.name}`),
    },
    {
      title: 'Installation',
      field: 'installationName',
    },
    {
      title: 'Kind',
      field: 'kind',
      render: row => {
        return (
          <Typography variant="inherit" noWrap>
            {formatKind(row.kind)}
          </Typography>
        );
      },
    },
    {
      title: 'Status',
      field: 'status',
      render: row => {
        if (!row.status) {
          return 'n/a';
        }

        return <ResourceRequestStatus status={row.status} />;
      },
      ...sortAndFilterOptions(row => (row.status ?? '').replace(/-/g, ' ')),
    },
    {
      title: 'Status Message',
      field: 'message',
    },
  ];

  return (
    <Table<Row>
      isLoading={loading}
      options={{
        pageSize: 20,
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload resources',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={data}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Resource requests</Typography>}
      columns={generatedColumns}
    />
  );
};

type ResourceRequestsTableProps = {
  kratixResources: {
    installationName: string;
    kind: string;
    name: string;
    namespace: string;
  }[];
  baseRoute: string;
};

export const ResourceRequestsTable = ({
  kratixResources,
  baseRoute,
}: ResourceRequestsTableProps) => {
  const { resources, isLoading, retry } = useResourceRequests(kratixResources);

  return (
    <ResourceRequestsTableView
      loading={isLoading}
      resources={resources}
      baseRoute={baseRoute}
      retry={retry}
    />
  );
};
