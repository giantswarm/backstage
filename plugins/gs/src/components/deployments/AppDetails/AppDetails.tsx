import React from 'react';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import {
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
} from '@material-ui/core';
import {
  getAppCatalogName,
  getAppChartName,
  getAppClusterName,
  getAppCreatedTimestamp,
  getAppCurrentVersion,
  getAppUpdatedTimestamp,
  getAppVersion,
} from '@internal/plugin-gs-common';
import { useApp } from '../../hooks';
import { formatAppCatalogName, formatVersion } from '../../utils/helpers';
import { StructuredMetadataList } from '../../UI/StructuredMetadataList';
import DateComponent from '../../UI/Date';
import { Heading } from '../../UI/Heading';
import { AppDetailsStatus } from '../AppDetailsStatus';
import { RevisionDetails } from '../RevisionDetails';

type AppDetailsProps = {
  installationName: string;
  gvk: CustomResourceMatcher;
  namespace: string;
  name: string;
  sourceLocation?: string;
};

export const AppDetails = ({
  installationName,
  gvk,
  namespace,
  name,
  sourceLocation,
}: AppDetailsProps) => {
  const {
    data: app,
    isLoading,
    error,
  } = useApp(installationName, gvk, name, namespace);

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

  const clusterName = getAppClusterName(app);
  const lastAppliedRevision = formatVersion(getAppCurrentVersion(app) ?? '');
  const lastAttemptedRevision = formatVersion(getAppVersion(app));
  const sourceName = formatAppCatalogName(getAppCatalogName(app));
  const chartName = getAppChartName(app);

  return (
    <div>
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
          <AppDetailsStatus app={app} />
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading>App CR details</Heading>}
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
