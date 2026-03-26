import { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Link } from '@backstage/core-components';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Grid, Tooltip, Typography } from '@material-ui/core';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import {
  AboutField,
  AboutFieldValue,
  ClusterLink,
  DateComponent,
  NotAvailable,
} from '../../../../UI';
import { clusterDetailsRouteRef } from '../../../../../routes';
import { Constants } from '@giantswarm/backstage-plugin-gs-common';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  HelmRelease,
  OCIRepository,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  useCatalogEntityForDeployment,
  useHelmChartNameForDeployment,
} from '../../../../hooks';
import { formatSource } from '../../../../utils/helpers';
import {
  findTargetClusterName,
  findTargetClusterNamespace,
  findTargetClusterType,
} from '../../../utils/findTargetCluster';
import { getSourceKind, getSourceName } from '../../../utils/getSource';
import { getUpdatedTimestamp } from '../../../utils/getUpdatedTimestamp';
import {
  deriveAutoUpgradeMode,
  getAutoUpgradeLabel,
} from '../../../utils/getAutoUpgradeSettings';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';

export function DeploymentAboutCard() {
  const { deployment, installationName } = useCurrentDeployment();

  const clusterRouteLink = useRouteRef(clusterDetailsRouteRef)!;

  const {
    catalogEntity,
    isLoading: isLoadingCatalogEntity,
    errorMessage: catalogEntityErrorMessage,
  } = useCatalogEntityForDeployment(deployment);

  const name = deployment.getName();
  const namespace = deployment.getNamespace();

  const clusterName = findTargetClusterName(deployment);

  const clusterNamespace = findTargetClusterNamespace(deployment);

  const clusterType = findTargetClusterType(deployment);

  const {
    chartName,
    isLoading: isLoadingChartName,
    errorMessage: chartNameErrorMessage,
  } = useHelmChartNameForDeployment(deployment);

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
  ) : null;

  const createdTimestamp = deployment.getCreatedTimestamp();

  const updatedTimestamp = getUpdatedTimestamp(deployment);

  const sourceKind = getSourceKind(deployment);

  const sourceName = getSourceName(deployment);

  const chartRef =
    deployment instanceof HelmRelease ? deployment.getChartRef() : undefined;
  const needsOciRepository = chartRef?.kind === 'OCIRepository';

  const {
    resource: ociRepository,
    isLoading: isLoadingOci,
    error: ociError,
  } = useResource(
    installationName,
    OCIRepository,
    {
      name: chartRef?.name ?? '',
      namespace: chartRef?.namespace ?? '',
    },
    {
      enabled: Boolean(needsOciRepository),
    },
  );

  const autoUpgradeMode = needsOciRepository
    ? deriveAutoUpgradeMode(ociRepository?.getReference())
    : undefined;

  return (
    <InfoCard title="About">
      <Grid container spacing={5}>
        <AboutField
          label="Type"
          value={deployment.getKind()}
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
          <AboutFieldValue>
            <AsyncValue
              isLoading={isLoadingCatalogEntity}
              value={entityLink}
              errorMessage={catalogEntityErrorMessage}
            />
          </AboutFieldValue>
        </AboutField>

        <AboutField
          label="Chart name"
          value={chartName}
          gridSizes={{ xs: 6, md: 4 }}
        >
          <AboutFieldValue>
            <AsyncValue
              isLoading={isLoadingChartName}
              value={chartName}
              errorMessage={chartNameErrorMessage}
            />
          </AboutFieldValue>
        </AboutField>

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

        {needsOciRepository && (
          <AboutField label="Auto-upgrade" gridSizes={{ xs: 6, md: 4 }}>
            <AboutFieldValue>
              <AsyncValue
                isLoading={isLoadingOci}
                value={
                  autoUpgradeMode
                    ? getAutoUpgradeLabel(autoUpgradeMode)
                    : undefined
                }
                errorMessage={ociError?.message}
              />
            </AboutFieldValue>
          </AboutField>
        )}

        <AboutField
          label="Source"
          value={formatSource(sourceKind, sourceName)}
          gridSizes={{ xs: 6, md: 4 }}
        />
      </Grid>
    </InfoCard>
  );
}
