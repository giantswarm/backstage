import { Link as RouterLink } from 'react-router-dom';
import { Grid } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { AsyncValue, InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { AboutField, AboutFieldValue, NotAvailable } from '../../../../UI';
import { formatVersion } from '../../../../utils/helpers';
import { useHelmChartNameForDeployment } from '../../../../hooks';
import { DeploymentStatus } from '../../../../deployments/DeploymentStatus';
import { getAggregatedStatus } from '../../../../deployments/utils/getStatus';
import { deploymentDetailsRouteRef } from '../../../../../routes';

const ReleaseName = ({
  installationName,
  release,
}: {
  installationName: string;
  release: HelmRelease;
}) => {
  // The deployments page can be disabled, in which case there is no route to
  // link to.
  const routeLink = useRouteRef(deploymentDetailsRouteRef);
  const name = release.getName();

  if (!routeLink) {
    return <>{name}</>;
  }

  return (
    <Link
      component={RouterLink}
      to={routeLink({
        installationName,
        kind: HelmRelease.kind.toLowerCase(),
        namespace: release.getNamespace() ?? 'default',
        name,
      })}
    >
      {name}
    </Link>
  );
};

const ClusterReleaseFields = ({
  installationName,
  release,
}: {
  installationName: string;
  release: HelmRelease;
}) => {
  const {
    chartName,
    isLoading: isLoadingChartName,
    errorMessage: chartNameErrorMessage,
  } = useHelmChartNameForDeployment(release);

  const version = release.getLastAppliedRevision();
  const status = getAggregatedStatus(release);
  const readyCondition = release.findReadyCondition();

  return (
    <InfoCard title="Installed by">
      <Grid.Root columns={{ initial: '1', sm: '2' }} gap="5">
        <AboutField label="HelmRelease">
          <AboutFieldValue>
            <ReleaseName
              installationName={installationName}
              release={release}
            />
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Chart" value={chartName}>
          <AboutFieldValue>
            <AsyncValue
              isLoading={isLoadingChartName}
              value={chartName}
              errorMessage={chartNameErrorMessage}
            />
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Version">
          <AboutFieldValue>
            {version ? formatVersion(version) : <NotAvailable />}
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Status">
          <AboutFieldValue>
            {status ? <DeploymentStatus status={status} /> : <NotAvailable />}
          </AboutFieldValue>
        </AboutField>

        {readyCondition?.status !== 'True' && readyCondition?.message && (
          <AboutField label="Ready condition" value={readyCondition.message} />
        )}
      </Grid.Root>
    </InfoCard>
  );
};

/**
 * The HelmRelease that installs the cluster, for a cluster that has no App:
 * its chart, version and Ready condition.
 */
export const ClusterReleaseCard = () => {
  const { clusterRelease, installationName } = useCurrentCluster();

  if (!clusterRelease) {
    return null;
  }

  return (
    <ClusterReleaseFields
      installationName={installationName}
      release={clusterRelease}
    />
  );
};
