import React, { useMemo } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { RouteRef } from '@backstage/core-plugin-api';
import SyncIcon from '@material-ui/icons/Sync';
import { Box, Typography } from '@material-ui/core';
import { DeploymentData, useDeploymentsData } from '../DeploymentsDataProvider';
import { getInitialColumns } from './columns';
import { useInstallationsStatuses } from '../../hooks';
import { InstallationsErrors } from '../../InstallationsErrors';

type Props = {
  columns: TableColumn<DeploymentData>[];
  loading: boolean;
  retry: () => void;
  deploymentsData: DeploymentData[];
};

const DeploymentsTableView = ({
  columns,
  loading,
  retry,
  deploymentsData,
}: Props) => {
  return (
    <Table<DeploymentData>
      isLoading={loading}
      options={{
        pageSize: 50,
        pageSizeOptions: [50, 100],
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      actions={[
        {
          icon: () => <SyncIcon />,
          tooltip: 'Reload deployments',
          isFreeAction: true,
          onClick: () => retry(),
        },
      ]}
      data={deploymentsData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">
          Deployments ({deploymentsData.length})
        </Typography>
      }
      columns={columns}
    />
  );
};

type DeploymentsTableProps = {
  baseRouteRef: RouteRef;
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

export const DeploymentsTable = ({
  baseRouteRef,
  sourceLocation,
  grafanaDashboard,
  ingressHost,
}: DeploymentsTableProps) => {
  const columns = useMemo(() => {
    return getInitialColumns({
      baseRouteRef,
      grafanaDashboard,
      ingressHost,
      sourceLocation,
    });
  }, [baseRouteRef, grafanaDashboard, ingressHost, sourceLocation]);

  const {
    filteredData: deploymentsData,
    isLoading,
    retry,
  } = useDeploymentsData();

  const { installationsStatuses } = useInstallationsStatuses();
  const installationsErrors = installationsStatuses.some(
    installationStatus => installationStatus.isError,
  );

  return (
    <>
      {installationsErrors && (
        <Box mb={2}>
          <InstallationsErrors installationsStatuses={installationsStatuses} />
        </Box>
      )}
      <DeploymentsTableView
        columns={columns}
        loading={isLoading}
        deploymentsData={deploymentsData}
        retry={retry}
      />
    </>
  );
};
