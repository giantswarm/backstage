import React from 'react';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
} from '@material-ui/core';
import {
  getHelmReleaseChartName,
  getHelmReleaseClusterName,
  getHelmReleaseCreatedTimestamp,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseSourceName,
  getHelmReleaseUpdatedTimestamp,
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

  const clusterName = getHelmReleaseClusterName(helmrelease);
  const lastAppliedRevision = formatVersion(
    getHelmReleaseLastAppliedRevision(helmrelease) ?? '',
  );
  const lastAttemptedRevision = formatVersion(
    getHelmReleaseLastAttemptedRevision(helmrelease) ?? '',
  );
  const sourceName = getHelmReleaseSourceName(helmrelease);
  const chartName = getHelmReleaseChartName(helmrelease);

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
                  Cluster: clusterName ? clusterName : 'n/a',
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
