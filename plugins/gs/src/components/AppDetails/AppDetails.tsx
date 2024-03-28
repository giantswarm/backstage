import React from 'react';
import { useApp } from '../hooks';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import {
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
} from '@material-ui/core';
import { StructuredMetadataList } from '../UI/StructuredMetadataList';
import { RevisionDetails } from '../RevisionDetails/RevisionDetails';
import DateComponent from '../UI/Date';
import {
  getAppCatalogName,
  getAppChartName,
  getAppClusterName,
  getAppCreatedTimestamp,
  getAppCurrentVersion,
  getAppUpdatedTimestamp,
  getAppVersion,
} from '../../model/services/mapi/applicationv1alpha1';
import { Heading } from '../UI/Heading';
import { AppDetailsStatus } from '../AppDetailsStatus';
import { formatAppCatalogName, formatVersion } from '../utils/helpers';

type AppDetailsProps = {
  installationName: string;
  namespace: string;
  name: string;
  sourceLocation?: string;
};

export const AppDetails = ({
  installationName,
  namespace,
  name,
  sourceLocation,
}: AppDetailsProps) => {
  const {
    data: app,
    isLoading,
    error,
  } = useApp(installationName, name, namespace);

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
