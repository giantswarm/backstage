import { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Link,
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
  getHelmReleaseSourceKind,
  HelmRelease,
  HelmReleaseKind,
  isHelmReleaseManagedByFlux,
} from '@giantswarm/backstage-plugin-gs-common';
import { useCatalogEntitiesForDeployments, useResource } from '../../hooks';
import { formatSource, formatVersion } from '../../utils/helpers';
import {
  ApplicationLink,
  DateComponent,
  GrafanaDashboardLink,
  Heading,
  NotAvailable,
  StructuredMetadataList,
} from '../../UI';
import { RevisionDetails } from '../RevisionDetails/RevisionDetails';
import { HelmReleaseDetailsStatusConditions } from '../HelmReleaseDetailsStatusConditions';
import { clusterDetailsRouteRef } from '../../../routes';
import { GitOpsCard } from '../../GitOpsCard';

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
  } = useResource<HelmRelease>({
    kind: HelmReleaseKind,
    installationName,
    name,
    namespace,
  });

  const clusterRouteLink = useRouteRef(clusterDetailsRouteRef);

  const catalogEntitiesMap = useCatalogEntitiesForDeployments();

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
  const sourceKind = getHelmReleaseSourceKind(helmrelease);
  const sourceName = getHelmReleaseSourceName(helmrelease);
  const chartName = getHelmReleaseChartName(helmrelease);

  let clusterEl: ReactNode = clusterName ? clusterName : <NotAvailable />;
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

  const entityRef = chartName ? catalogEntitiesMap[chartName] : undefined;
  const entityLink: ReactNode = entityRef ? (
    <EntityRefLink entityRef={entityRef} />
  ) : (
    <NotAvailable />
  );

  const isGitOpsManaged = isHelmReleaseManagedByFlux(helmrelease);

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
                  App: entityLink,
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        {isGitOpsManaged && (
          <Grid item xs={12}>
            <GitOpsCard
              deployment={helmrelease}
              installationName={installationName}
            />
          </Grid>
        )}

        <RevisionDetails
          lastAppliedRevision={lastAppliedRevision}
          lastAttemptedRevision={lastAttemptedRevision}
          sourceLocation={sourceLocation}
        />

        <Grid item xs={12}>
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
                  Name: name,
                  Namespace: namespace,
                  Source: formatSource(sourceKind, sourceName),
                  'Chart name': chartName,
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
