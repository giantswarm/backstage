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
  Typography,
} from '@material-ui/core';
import {
  getHelmReleaseChartName,
  getHelmReleaseTargetClusterName,
  getHelmReleaseCreatedTimestamp,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseSourceName,
  getHelmReleaseUpdatedTimestamp,
  getHelmReleaseTargetClusterNamespace,
} from '@giantswarm/backstage-plugin-gs-common';
import { useHelmRelease } from '../../hooks';
import { formatVersion } from '../../utils/helpers';
import {
  ApplicationLink,
  DateComponent,
  GrafanaDashboardLink,
  Heading,
  StructuredMetadataList,
} from '../../UI';
import { RevisionDetails } from '../RevisionDetails/RevisionDetails';
import { HelmReleaseDetailsStatusConditions } from '../HelmReleaseDetailsStatusConditions';
import { clusterDetailsRouteRef } from '../../../routes';

type HelmReleaseDetailsProps = {
  installationName: string;
  namespace: string;
  name: string;
  sourceLocation?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

export const HelmReleaseDetails = ({
  installationName,
  namespace,
  name,
  sourceLocation,
  grafanaDashboard,
  ingressHost,
}: HelmReleaseDetailsProps) => {
  const {
    data: helmrelease,
    isLoading,
    error,
  } = useHelmRelease(installationName, name, namespace);

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

  if (!helmrelease) {
    return (
      <EmptyState
        missing="info"
        title="No HelmRelease found"
        description={`HelmRelease ${installationName}:${namespace}/${name} was not found`}
      />
    );
  }

  const clusterName = getHelmReleaseTargetClusterName(
    helmrelease,
    installationName,
  );
  const clusterNamespace = getHelmReleaseTargetClusterNamespace(helmrelease);
  const lastAppliedRevision = formatVersion(
    getHelmReleaseLastAppliedRevision(helmrelease) ?? '',
  );
  const lastAttemptedRevision = formatVersion(
    getHelmReleaseLastAttemptedRevision(helmrelease) ?? '',
  );
  const sourceName = getHelmReleaseSourceName(helmrelease);
  const chartName = getHelmReleaseChartName(helmrelease);

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
          <HelmReleaseDetailsStatusConditions helmrelease={helmrelease} />
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading level="h3">HelmRelease details</Heading>}
              titleTypographyProps={{ variant: undefined }}
            />
            <CardContent>
              <StructuredMetadataList
                metadata={{
                  Namespace: namespace,
                  Name: name,
                  Source: (
                    <>
                      {sourceName && (
                        <Typography variant="inherit" noWrap>
                          {sourceName}/
                        </Typography>
                      )}
                      {chartName && (
                        <Typography variant="inherit" noWrap>
                          {chartName}
                        </Typography>
                      )}
                    </>
                  ),
                  Created: (
                    <DateComponent
                      value={getHelmReleaseCreatedTimestamp(helmrelease)}
                      relative
                    />
                  ),
                  Updated: (
                    <DateComponent
                      value={getHelmReleaseUpdatedTimestamp(helmrelease)}
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
