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
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import {
  getHelmReleaseChartName,
  getHelmReleaseClusterName,
  getHelmReleaseCreatedTimestamp,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseSourceName,
  getHelmReleaseUpdatedTimestamp,
} from '@internal/plugin-gs-common';
import { useHelmRelease } from '../../hooks';
import { formatVersion } from '../../utils/helpers';
import {
  DateComponent,
  Heading,
  GitOpsUILink,
  StructuredMetadataList,
} from '../../UI';
import { RevisionDetails } from '../RevisionDetails/RevisionDetails';
import { HelmReleaseDetailsStatusConditions } from '../HelmReleaseDetailsStatusConditions';

type HelmReleaseDetailsProps = {
  installationName: string;
  gvk: CustomResourceMatcher;
  namespace: string;
  name: string;
  sourceLocation?: string;
};

export const HelmReleaseDetails = ({
  installationName,
  gvk,
  namespace,
  name,
  sourceLocation,
}: HelmReleaseDetailsProps) => {
  const {
    data: helmrelease,
    isLoading,
    error,
  } = useHelmRelease(installationName, gvk, name, namespace);

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
      <Box display="flex" marginBottom={2}>
        <GitOpsUILink
          installationName={installationName}
          clusterName={installationName}
          kind="helmrelease"
          name={name}
          namespace={namespace}
          text="Open this application in the GitOps UI"
        />
      </Box>

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
              title={<Heading>HelmRelease details</Heading>}
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
