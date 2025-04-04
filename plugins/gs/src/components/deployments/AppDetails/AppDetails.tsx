import React, { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Link,
} from '@material-ui/core';
import {
  getAppCatalogName,
  getAppChartName,
  getAppTargetClusterName,
  getAppCreatedTimestamp,
  getAppCurrentVersion,
  getAppUpdatedTimestamp,
  getAppVersion,
  getAppTargetClusterNamespace,
  App,
  AppKind,
} from '@giantswarm/backstage-plugin-gs-common';
import { useResource } from '../../hooks';
import {
  formatAppCatalogName,
  formatSource,
  formatVersion,
} from '../../utils/helpers';
import {
  ApplicationLink,
  DateComponent,
  GrafanaDashboardLink,
  Heading,
  StructuredMetadataList,
} from '../../UI';
import { AppDetailsStatus } from '../AppDetailsStatus';
import { RevisionDetails } from '../RevisionDetails';
import { clusterDetailsRouteRef } from '../../../routes';

type AppDetailsProps = {
  installationName: string;
  namespace: string;
  name: string;
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

export const AppDetails = ({
  installationName,
  namespace,
  name,
  sourceLocation,
  grafanaDashboard,
  ingressHost,
}: AppDetailsProps) => {
  const {
    data: app,
    isLoading,
    error,
  } = useResource<App>({
    kind: AppKind,
    installationName,
    name,
    namespace,
  });

  const clusterRouteLink = useRouteRef(clusterDetailsRouteRef);

  if (isLoading) {
    return <Progress />;
  }

  if (error) {
    return (
      <WarningPanel
        severity="error"
        title={`Could not load ${namespace}/${name} resource.`}
      >
        {(error as Error).message}
      </WarningPanel>
    );
  }

  if (!app) {
    return (
      <EmptyState
        missing="info"
        title="No App CR found"
        description={`App CR ${installationName}:${namespace}/${name} was not found`}
      />
    );
  }

  const clusterName = getAppTargetClusterName(app, installationName);
  const clusterNamespace = getAppTargetClusterNamespace(app, installationName);
  const lastAppliedRevision = formatVersion(getAppCurrentVersion(app) ?? '');
  const lastAttemptedRevision = formatVersion(getAppVersion(app) ?? '');
  const sourceName = formatAppCatalogName(getAppCatalogName(app) ?? '');
  const chartName = getAppChartName(app);

  let clusterEl: ReactNode = clusterName ? clusterName : 'n/a';
  if (clusterName && clusterNamespace) {
    clusterEl = (
      <Link
        component={RouterLink}
        to={clusterRouteLink({
          installationName: installationName,
          namespace: clusterNamespace,
          name: clusterName,
        })}
      >
        {clusterName}
      </Link>
    );
  }

  return (
    <div>
      {ingressHost || grafanaDashboard ? (
        <Box display="flex" flexDirection="column" gridGap={4} marginBottom={2}>
          {ingressHost && (
            <ApplicationLink
              ingressHost={ingressHost}
              text="Open application"
            />
          )}
          {grafanaDashboard && (
            <GrafanaDashboardLink
              dashboard={grafanaDashboard}
              installationName={installationName}
              clusterName={clusterName}
              applicationName={name}
              text="Open Grafana dashboard for this application"
            />
          )}
        </Box>
      ) : null}
      <Grid container direction="column">
        <Grid item>
          <Card>
            <CardContent>
              <StructuredMetadataList
                metadata={{
                  Installation: installationName,
                  Cluster: clusterEl,
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        <RevisionDetails
          lastAppliedRevision={lastAppliedRevision}
          lastAttemptedRevision={lastAttemptedRevision}
          sourceLocation={sourceLocation}
        />

        <Grid item>
          <AppDetailsStatus app={app} />
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading level="h3">App CR details</Heading>}
              titleTypographyProps={{ variant: undefined }}
            />
            <CardContent>
              <StructuredMetadataList
                metadata={{
                  Name: name,
                  Namespace: namespace,
                  Source: formatSource('AppCatalog', sourceName),
                  'Chart name': chartName,
                  Created: (
                    <DateComponent
                      value={getAppCreatedTimestamp(app)}
                      relative
                    />
                  ),
                  Updated: (
                    <DateComponent
                      value={getAppUpdatedTimestamp(app)}
                      relative
                    />
                  ),
                }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
};
