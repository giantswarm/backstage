import { Link as RouterLink } from 'react-router-dom';
import { InfoCard, Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Grid, Tooltip, Typography } from '@material-ui/core';
import { Constants } from '@giantswarm/backstage-plugin-gs-common';
import { AboutField } from '@backstage/plugin-catalog';
import {
  calculateClusterType,
  calculateClusterProvider,
  formatClusterProvider,
  formatClusterType,
  formatServicePriority,
  getClusterCreationTimestamp,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  isManagementCluster,
} from '../../../utils';
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
import { clusterDetailsRouteRef } from '../../../../../routes';
import {
  ControlPlane,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { getErrorMessage } from '../../../../hooks/utils/helpers';

export function ClusterAboutCard() {
  const { cluster, installationName } = useCurrentCluster();

  const managementClusterRouteLink = useRouteRef(clusterDetailsRouteRef);

  const controlPlaneRef = cluster.getControlPlaneRef();
  if (!controlPlaneRef) {
    throw new Error(
      'There is no control plane reference defined in the cluster resource.',
    );
  }

  const {
    apiVersion: controlPlaneApiVersion,
    name: controlPlaneName,
    namespace: controlPlaneNamespace,
  } = controlPlaneRef;

  const {
    resource: controlPlane,
    isLoading: controlPlaneIsLoading,
    errors: controlPlaneErrors,
    error: controlPlaneError,
  } = useResource(installationName, ControlPlane, {
    apiVersion: controlPlaneApiVersion,
    name: controlPlaneName,
    namespace: controlPlaneNamespace,
  });

  let controlPlaneErrorMessage;
  if (controlPlaneError) {
    controlPlaneErrorMessage = getErrorMessage({
      error: controlPlaneError,
      resourceKind: ControlPlane.kind,
      resourceName: controlPlaneName,
      resourceNamespace: controlPlaneNamespace,
    });
  }

  useShowErrors(controlPlaneErrors);

  const clusterType = calculateClusterType(cluster);
  const releaseVersion = getClusterReleaseVersion(cluster);
  const organization = getClusterOrganization(cluster);
  const servicePriority = getClusterServicePriority(cluster);
  const provider = calculateClusterProvider(cluster);
  const creationTimestamp = getClusterCreationTimestamp(cluster);
  const k8sVersion = controlPlane ? controlPlane.getK8sVersion() : undefined;

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
              errorMessage={controlPlaneErrorMessage}
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
        <AboutField label="Region" gridSizes={{ xs: 6, md: 4 }}>
          <AboutFieldValue>
            <ClusterSwitch
              renderAWS={() => <ProviderClusterLocation />}
              renderAzure={() => <ProviderClusterLocation />}
              renderVSphere={() => <NotAvailable />}
              renderVCD={() => <NotAvailable />}
            />
          </AboutFieldValue>
        </AboutField>
        {!isManagementCluster(cluster) && (
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
