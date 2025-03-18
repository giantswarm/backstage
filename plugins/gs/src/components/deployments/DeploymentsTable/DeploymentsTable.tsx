import React, { useMemo } from 'react';
import { Table, TableColumn } from '@backstage/core-components';
import { RouteRef } from '@backstage/core-plugin-api';
import SyncIcon from '@material-ui/icons/Sync';
import { Box, Typography } from '@material-ui/core';
import {
  getAppTargetClusterName,
  getAppTargetClusterNamespace,
  getAppCurrentVersion,
  getAppStatus,
  getAppVersion,
  getAppChartName,
  getAppUpdatedTimestamp,
  getAppCatalogName,
  getHelmReleaseStatus,
  getHelmReleaseTargetClusterName,
  getHelmReleaseTargetClusterNamespace,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseChartName,
  getHelmReleaseUpdatedTimestamp,
  getHelmReleaseSourceName,
  getHelmReleaseSourceKind,
} from '@giantswarm/backstage-plugin-gs-common';
import { formatAppCatalogName, formatVersion } from '../../utils/helpers';
import { DeploymentData, useDeploymentsData } from '../DeploymentsDataProvider';
import { getInitialColumns, Row } from './columns';
import { calculateClusterType } from '../utils';
import { useInstallationsStatuses } from '../../hooks';
import { InstallationsErrors } from '../../InstallationsErrors';

type Props = {
  columns: TableColumn<Row>[];
  loading: boolean;
  retry: () => void;
  deploymentsData: DeploymentData[];
  baseRouteRef: RouteRef;
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

const DeploymentsTableView = ({
  columns,
  loading,
  retry,
  deploymentsData,
  sourceLocation,
}: Props) => {
  const data: Row[] = deploymentsData.map(({ installationName, deployment }) =>
    deployment.kind === 'App'
      ? {
          installationName,
          kind: 'app',
          clusterName: getAppTargetClusterName(deployment, installationName),
          clusterNamespace: getAppTargetClusterNamespace(
            deployment,
            installationName,
          ),
          clusterType: calculateClusterType(deployment, installationName),
          name: deployment.metadata.name,
          namespace: deployment.metadata.namespace,
          version: formatVersion(getAppCurrentVersion(deployment) ?? ''),
          attemptedVersion: formatVersion(getAppVersion(deployment) ?? ''),
          status: getAppStatus(deployment),
          sourceLocation,
          updated: getAppUpdatedTimestamp(deployment),
          sourceKind: 'AppCatalog',
          sourceName: formatAppCatalogName(getAppCatalogName(deployment) ?? ''),
          chartName: getAppChartName(deployment),
          apiVersion: deployment.apiVersion,
        }
      : {
          installationName,
          kind: 'helmrelease',
          clusterName: getHelmReleaseTargetClusterName(
            deployment,
            installationName,
          ),
          clusterNamespace: getHelmReleaseTargetClusterNamespace(deployment),
          clusterType: calculateClusterType(deployment, installationName),
          name: deployment.metadata.name,
          namespace: deployment.metadata.namespace,
          version: formatVersion(
            getHelmReleaseLastAppliedRevision(deployment) ?? '',
          ),
          attemptedVersion: formatVersion(
            getHelmReleaseLastAttemptedRevision(deployment) ?? '',
          ),
          status: getHelmReleaseStatus(deployment),
          sourceLocation,
          updated: getHelmReleaseUpdatedTimestamp(deployment),
          sourceKind: getHelmReleaseSourceKind(deployment),
          sourceName: getHelmReleaseSourceName(deployment),
          chartName: getHelmReleaseChartName(deployment),
          apiVersion: deployment.apiVersion,
        },
  );

  return (
    <Table<Row>
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
      data={data}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Deployments ({data.length})</Typography>}
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
    return getInitialColumns(baseRouteRef, grafanaDashboard, ingressHost);
  }, [baseRouteRef, grafanaDashboard, ingressHost]);

  const { data: deploymentsData, isLoading, retry } = useDeploymentsData();

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
        baseRouteRef={baseRouteRef}
        sourceLocation={sourceLocation}
        grafanaDashboard={grafanaDashboard}
        ingressHost={ingressHost}
      />
    </>
  );
};
