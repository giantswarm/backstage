import { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { InfoCard, Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { AboutField } from '@backstage/plugin-catalog';
import { Grid, Tooltip, Typography } from '@material-ui/core';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { calculateClusterType, formatDeploymentType } from '../../../utils';
import {
  AboutFieldValue,
  ClusterLink,
  DateComponent,
  NotAvailable,
} from '../../../../UI';
import { clusterDetailsRouteRef } from '../../../../../routes';
import {
  AppKind,
  Constants,
  getAppCatalogName,
  getAppChartName,
  getAppCreatedTimestamp,
  getAppTargetClusterName,
  getAppTargetClusterNamespace,
  getAppUpdatedTimestamp,
  getHelmReleaseChartName,
  getHelmReleaseCreatedTimestamp,
  getHelmReleaseSourceKind,
  getHelmReleaseSourceName,
  getHelmReleaseTargetClusterName,
  getHelmReleaseTargetClusterNamespace,
  getHelmReleaseUpdatedTimestamp,
} from '@giantswarm/backstage-plugin-gs-common';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { useCatalogEntityForDeployment } from '../../../../hooks';
import { formatAppCatalogName, formatSource } from '../../../../utils/helpers';

export function DeploymentAboutCard() {
  const { deployment, installationName } = useCurrentDeployment();

  const clusterRouteLink = useRouteRef(clusterDetailsRouteRef);

  const { catalogEntity } = useCatalogEntityForDeployment(deployment);

  const name = deployment.metadata.name;
  const namespace = deployment.metadata.namespace;

  const clusterName =
    deployment.kind === AppKind
      ? getAppTargetClusterName(deployment, installationName)
      : getHelmReleaseTargetClusterName(deployment, installationName);

  const clusterNamespace =
    deployment.kind === AppKind
      ? getAppTargetClusterNamespace(deployment, installationName)
      : getHelmReleaseTargetClusterNamespace(deployment);

  const clusterType = calculateClusterType(deployment, installationName);

  const chartName =
    deployment.kind === AppKind
      ? getAppChartName(deployment)
      : getHelmReleaseChartName(deployment);

  let clusterEl: ReactNode = clusterName ? clusterName : <NotAvailable />;
  if (clusterName && clusterNamespace) {
    clusterEl = (
      <ClusterLink
        installationName={installationName}
        namespace={clusterNamespace}
        name={clusterName}
        type={clusterType}
      />
    );
  }

  const entityRef = catalogEntity
    ? stringifyEntityRef(catalogEntity)
    : undefined;
  const entityLink: ReactNode = entityRef ? (
    <EntityRefLink entityRef={entityRef} />
  ) : (
    <NotAvailable />
  );

  const createdTimestamp =
    deployment.kind === AppKind
      ? getAppCreatedTimestamp(deployment)
      : getHelmReleaseCreatedTimestamp(deployment);

  const updatedTimestamp =
    deployment.kind === AppKind
      ? getAppUpdatedTimestamp(deployment)
      : getHelmReleaseUpdatedTimestamp(deployment);

  const sourceKind =
    deployment.kind === AppKind
      ? 'AppCatalog'
      : getHelmReleaseSourceKind(deployment);

  const sourceName =
    deployment.kind === AppKind
      ? formatAppCatalogName(getAppCatalogName(deployment) ?? '')
      : getHelmReleaseSourceName(deployment);

  return (
    <InfoCard title="About">
      <Grid container spacing={5}>
        <AboutField
          label="Type"
          value={formatDeploymentType(deployment.kind)}
          gridSizes={{ xs: 6, md: 4 }}
        />

        <AboutField label="Name" value={name} gridSizes={{ xs: 6, md: 4 }} />

        <AboutField
          label="Namespace"
          value={namespace}
          gridSizes={{ xs: 6, md: 4 }}
        />

        <AboutField
          label="Installation"
          value={installationName}
          gridSizes={{ xs: 6, md: 4 }}
        >
          <AboutFieldValue>
            <Tooltip title="Open management cluster">
              <Link
                component={RouterLink}
                to={clusterRouteLink({
                  installationName: installationName,
                  namespace: Constants.MANAGEMENT_CLUSTER_NAMESPACE,
                  name: installationName,
                })}
              >
                {installationName}
              </Link>
            </Tooltip>
          </AboutFieldValue>
        </AboutField>
        <AboutField
          label="Cluster"
          value={clusterName}
          gridSizes={{ xs: 6, md: 4 }}
        >
          <AboutFieldValue>{clusterEl}</AboutFieldValue>
        </AboutField>
        <AboutField label="App" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>{entityLink}</AboutFieldValue>
        </AboutField>

        <AboutField
          label="Chart name"
          value={chartName}
          gridSizes={{ xs: 6, md: 4 }}
        />

        <AboutField label="Created" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            <Typography variant="inherit">
              <DateComponent value={createdTimestamp} relative />
            </Typography>
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Updated" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            <Typography variant="inherit">
              <DateComponent value={updatedTimestamp} relative />
            </Typography>
          </AboutFieldValue>
        </AboutField>

        <AboutField
          label="Source"
          value={formatSource(sourceKind, sourceName)}
          gridSizes={{ xs: 12 }}
        />
      </Grid>
    </InfoCard>
  );
}
