import { useMemo, useState } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import {
  Box,
  Chip,
  FormControlLabel,
  Switch,
  Typography,
} from '@material-ui/core';
import {
  ClusterRoleBinding,
  RoleBinding,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { buildRbacSubjectRows, RbacSubjectRow } from './utils';

const BindingsDetailPanel = ({ row }: { row: RbacSubjectRow }) => {
  return (
    <Box padding={2} paddingLeft={9}>
      {row.bindings.map(binding => (
        <Typography
          key={`${binding.bindingKind}/${binding.namespace ?? ''}/${binding.bindingName}`}
          variant="body2"
        >
          {binding.bindingKind} <b>{binding.bindingName}</b>
          {binding.namespace ? ` in namespace ${binding.namespace}` : ''} grants{' '}
          {binding.roleKind} <b>{binding.roleName}</b>
        </Typography>
      ))}
    </Box>
  );
};

const columns: TableColumn<RbacSubjectRow>[] = [
  {
    title: 'Subject',
    field: 'name',
    highlight: true,
    render: row =>
      row.namespace ? `${row.namespace}/${row.name}` : row.name,
  },
  {
    title: 'Kind',
    field: 'kind',
    width: '150px',
  },
  {
    title: 'Roles',
    field: 'rolesText',
    render: row => (
      <>
        {row.roles.map(role => (
          <Chip
            key={role}
            label={role}
            size="small"
            variant="outlined"
            style={{ marginBottom: 0 }}
          />
        ))}
      </>
    ),
  },
  {
    title: 'Access scope',
    field: 'scopeText',
  },
];

export const ClusterRBAC = () => {
  const { installationName } = useCurrentCluster();
  const [showSystem, setShowSystem] = useState(false);

  const roleBindingsQuery = useResources(installationName, RoleBinding);
  const clusterRoleBindingsQuery = useResources(
    installationName,
    ClusterRoleBinding,
  );

  const errors = useMemo(
    () => [...roleBindingsQuery.errors, ...clusterRoleBindingsQuery.errors],
    [roleBindingsQuery.errors, clusterRoleBindingsQuery.errors],
  );
  useShowErrors(errors, {
    message: `Failed to fetch RBAC resources from ${installationName}. Reading role bindings requires cluster-wide read access.`,
  });

  const isLoading =
    roleBindingsQuery.isLoading || clusterRoleBindingsQuery.isLoading;

  const rows = useMemo(
    () =>
      buildRbacSubjectRows(
        roleBindingsQuery.resources,
        clusterRoleBindingsQuery.resources,
      ),
    [roleBindingsQuery.resources, clusterRoleBindingsQuery.resources],
  );

  const visibleRows = useMemo(
    () => (showSystem ? rows : rows.filter(row => !row.isSystem)),
    [rows, showSystem],
  );

  return (
    <>
      <Box display="flex" alignItems="center" gridGap={24} marginBottom={2}>
        <Typography variant="body2" style={{ flexGrow: 1 }}>
          Who can do what in this cluster: every user, group and service
          account granted access through a RoleBinding or ClusterRoleBinding,
          with the roles it holds and where they apply. Expand a row to see the
          individual bindings.
        </Typography>
        <FormControlLabel
          style={{ flexShrink: 0, marginRight: 0 }}
          control={
            <Switch
              checked={showSystem}
              onChange={event => setShowSystem(event.target.checked)}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Show system subjects (
              {rows.filter(row => row.isSystem).length})
            </Typography>
          }
        />
      </Box>
      <Table<RbacSubjectRow>
        isLoading={isLoading}
        options={{
          paging: false,
          padding: 'dense',
        }}
        data={visibleRows}
        style={{ width: '100%' }}
        title={
          <Typography variant="h6">
            Access grants ({visibleRows.length} subjects)
          </Typography>
        }
        columns={columns}
        detailPanel={({ rowData }) => <BindingsDetailPanel row={rowData} />}
        localization={{
          body: {
            emptyDataSourceMessage: isLoading
              ? 'Loading…'
              : 'No RBAC bindings to show. Either none exist, or your account is not allowed to list them on this cluster.',
          },
        }}
      />
    </>
  );
};
