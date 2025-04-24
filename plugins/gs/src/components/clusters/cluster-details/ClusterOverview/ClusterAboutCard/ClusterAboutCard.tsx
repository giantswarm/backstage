import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { InfoCard, Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Grid, Tooltip, Typography } from '@material-ui/core';
import {
  getClusterCreationTimestamp,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  getControlPlaneK8sVersion,
  Constants,
  isManagementCluster,
  ControlPlane,
  getClusterControlPlaneRef,
} from '@giantswarm/backstage-plugin-gs-common';
import { AboutField } from '@backstage/plugin-catalog';
import {
  calculateClusterProvider,
  calculateClusterType,
  formatClusterProvider,
  formatClusterType,
  formatServicePriority,
} from '../../../utils';
import { useResource } from '../../../../hooks';
import {
  AboutFieldValue,
  AsyncValue,
  DateComponent,
  KubernetesVersion,
  NotAvailable,
} from '../../../../UI';
import { formatVersion } from '../../../../utils/helpers';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { ClusterSwitch } from '../../ClusterSwitch';
import { ProviderClusterLocation } from './ProviderClusterLocation';
import { useErrors } from '../../../../Errors';
import { clusterDetailsRouteRef } from '../../../../../routes';

export function ClusterAboutCard() {
  const { cluster, installationName } = useCurrentCluster();

  const managementClusterRouteLink = useRouteRef(clusterDetailsRouteRef);

  const {
    kind: controlPlaneKind,
    apiVersion: controlPlaneApiVersion,
    name: controlPlaneName,
    namespace: controlPlaneNamespace,
  } = getClusterControlPlaneRef(cluster);

  const {
    data: controlPlane,
    isLoading: controlPlaneIsLoading,
    error: controlPlaneError,
    queryKey: controlPlaneQueryKey,
    queryErrorMessage: controlPlaneQueryErrorMessage,
    refetch: controlPlaneRefetch,
  } = useResource<ControlPlane>({
    kind: controlPlaneKind,
    apiVersion: controlPlaneApiVersion,
    installationName,
    name: controlPlaneName,
    namespace: controlPlaneNamespace,
  });

  const { showError } = useErrors();
  useEffect(() => {
    if (!controlPlaneError) return;

    showError(controlPlaneError, {
      queryKey: controlPlaneQueryKey,
      message: controlPlaneQueryErrorMessage,
      retry: controlPlaneRefetch,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlPlaneError]);

  const clusterType = calculateClusterType(cluster, installationName);
  const releaseVersion = getClusterReleaseVersion(cluster);
  const organization = getClusterOrganization(cluster);
  const servicePriority = getClusterServicePriority(cluster);
  const provider = calculateClusterProvider(cluster);
  const creationTimestamp = getClusterCreationTimestamp(cluster);
  const k8sVersion = controlPlane
    ? getControlPlaneK8sVersion(controlPlane)
    : undefined;

  return (
    <InfoCard title="About">
      <Grid container spacing={5}>
        <AboutField
          label="Type"
          value={formatClusterType(clusterType)}
          gridSizes={{ xs: 6, md: 4 }}
        />
        <AboutField label="Kubernetes version" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            <AsyncValue
              isLoading={controlPlaneIsLoading}
              value={k8sVersion}
              error={controlPlaneError}
              errorMessage={controlPlaneQueryErrorMessage}
            >
              {value => (
                <KubernetesVersion
                  version={formatVersion(value)}
                  hideIcon
                  hideLabel
                />
              )}
            </AsyncValue>
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Release" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            {releaseVersion ? formatVersion(releaseVersion) : <NotAvailable />}
          </AboutFieldValue>
        </AboutField>
        <AboutField
          label="Organization"
          value={organization}
          gridSizes={{ xs: 6, md: 4 }}
        />
        <AboutField label="Service priority" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            {servicePriority ? (
              formatServicePriority(servicePriority)
            ) : (
              <NotAvailable />
            )}
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Provider" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            {provider ? formatClusterProvider(provider) : <NotAvailable />}
          </AboutFieldValue>
        </AboutField>
        <AboutField label="Location" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            <ClusterSwitch
              renderAWS={() => <ProviderClusterLocation />}
              renderAzure={() => <ProviderClusterLocation />}
              renderVSphere={() => <NotAvailable />}
            />
          </AboutFieldValue>
        </AboutField>
        {!isManagementCluster(cluster, installationName) && (
          <AboutField
            label="Installation"
            value={installationName}
            gridSizes={{ xs: 6, md: 4 }}
          >
            <AboutFieldValue>
              <Tooltip title="Open management cluster">
                <Link
                  component={RouterLink}
                  to={managementClusterRouteLink({
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
        )}
        <AboutField label="Created" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            <Typography variant="inherit">
              <DateComponent value={creationTimestamp} relative />
            </Typography>
          </AboutFieldValue>
        </AboutField>
      </Grid>
    </InfoCard>
  );
}
