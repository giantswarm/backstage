import { Link as RouterLink } from 'react-router-dom';
import { Grid } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Box, Tooltip, Typography } from '@material-ui/core';
import { Constants } from '@giantswarm/backstage-plugin-gs-common';
import {
  calculateClusterType,
  calculateClusterProvider,
  formatClusterProvider,
  formatClusterType,
  formatServicePriority,
  getClusterCreationTimestamp,
  getClusterDescription,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  isManagementCluster,
} from '../../../utils';
import {
  AboutField,
  AboutFieldValue,
  DateComponent,
  KubernetesVersion,
  NotAvailable,
} from '../../../../UI';
import { formatVersion } from '../../../../utils/helpers';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { useIsExpectedClusterError } from '../../../ClusterDetailsPage/useIsExpectedClusterError';
import { ProviderClusterLocation } from './ProviderClusterLocation';
import { AWSAccountField } from './AWSAccountField';
import { ClusterSwitch } from '../../ClusterSwitch';
import { clusterDetailsRouteRef } from '../../../../../routes';
import {
  AnyControlPlane,
  ControlPlane,
  findControlPlaneModel,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ClusterTypeManagementIcon,
  ClusterTypeWorkloadIcon,
  AWSProviderIcon,
  AzureProviderIcon,
} from '../../../../../assets/icons/CustomIcons';
import { ClusterTypes, ClusterProviders } from '../../../utils';
import { AsyncValue, InfoCard } from '@giantswarm/backstage-plugin-ui-react';

interface ProviderLocationDisplayProps {
  provider: string;
}

function ProviderLocationDisplay({ provider }: ProviderLocationDisplayProps) {
  const renderProvider = () => {
    switch (provider) {
      case ClusterProviders.AWS:
        return (
          <Tooltip title="AWS">
            <Box display="flex">
              <AWSProviderIcon fontSize="small" />
            </Box>
          </Tooltip>
        );
      case ClusterProviders.Azure:
        return (
          <Tooltip title="Azure">
            <Box display="flex">
              <AzureProviderIcon fontSize="small" />
            </Box>
          </Tooltip>
        );
      default:
        return (
          <Typography variant="inherit">
            {formatClusterProvider(provider)}
          </Typography>
        );
    }
  };

  const renderLocation = () => {
    if (
      provider === ClusterProviders.AWS ||
      provider === ClusterProviders.Azure
    ) {
      return (
        <Box ml={1}>
          <Typography variant="inherit">
            <ProviderClusterLocation />
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <Box display="inline-flex" alignItems="center">
      {renderProvider()}
      {renderLocation()}
    </Box>
  );
}

export function ClusterAboutCard() {
  const { cluster, installationName } = useCurrentCluster();
  const isExpectedError = useIsExpectedClusterError();

  const managementClusterRouteLink = useRouteRef(clusterDetailsRouteRef)!;

  // A Cluster may have no control plane reference yet (one still being
  // created, or an imported one). Only the Kubernetes version depends on it,
  // so that reads as not available and the rest of the card renders.
  const controlPlaneRef = cluster.getControlPlaneRef();
  const controlPlaneName = controlPlaneRef?.name ?? '';
  const controlPlaneNamespace = controlPlaneRef?.namespace;

  // The reference decides which control plane kind to read: a
  // KubeadmControlPlane, or the AzureASOManagedControlPlane of an AKS
  // cluster. A kind without a model in CONTROL_PLANE_MODELS (an EKS cluster's
  // AWSManagedControlPlane, say) would only 404, so its fetch stays disabled
  // and the Kubernetes version reads as not available.
  const ControlPlaneModel = controlPlaneRef
    ? findControlPlaneModel(controlPlaneRef)
    : undefined;
  const hasSupportedControlPlane = ControlPlaneModel !== undefined;

  const {
    resource: controlPlane,
    isLoading: controlPlaneIsLoading,
    errors: controlPlaneErrors,
    error: controlPlaneError,
    incompatibilities: controlPlaneIncompatibilities,
  } = useResource<AnyControlPlane>(
    installationName,
    ControlPlaneModel ?? ControlPlane,
    {
      name: controlPlaneName,
      namespace: controlPlaneNamespace,
    },
    { enabled: hasSupportedControlPlane },
  );

  let controlPlaneErrorMessage;
  if (controlPlaneError && !isExpectedError(controlPlaneError)) {
    controlPlaneErrorMessage = getErrorMessage({
      error: controlPlaneError,
      resourceKind: (ControlPlaneModel ?? ControlPlane).kind,
      resourceName: controlPlaneName,
      resourceNamespace: controlPlaneNamespace,
    });
  }
  // A disabled query still returns incompatibilities from ControlPlane
  // discovery that another page has cached. The hook cannot tell whether a
  // caller disabled its query to mean "not yet" or "does not apply", so the
  // card keeps them out itself when there is no supported control plane to
  // read.
  if (hasSupportedControlPlane && controlPlaneIncompatibilities[0]) {
    controlPlaneErrorMessage = getIncompatibilityMessage(
      controlPlaneIncompatibilities[0],
    );
  }

  useShowErrors(hasSupportedControlPlane ? controlPlaneErrors : null);

  const clusterType = calculateClusterType(cluster);
  const description = getClusterDescription(cluster);
  const releaseVersion = getClusterReleaseVersion(cluster);
  const organization = getClusterOrganization(cluster);
  const servicePriority = getClusterServicePriority(cluster);
  const provider = calculateClusterProvider(cluster);
  const creationTimestamp = getClusterCreationTimestamp(cluster);
  const k8sVersion = controlPlane ? controlPlane.getK8sVersion() : undefined;

  return (
    <InfoCard>
      <Grid.Root columns={{ initial: '1', sm: '2', lg: '3' }} gap="5">
        <AboutField label="Description">
          <AboutFieldValue>
            {description ? description : <NotAvailable />}
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Type">
          <AboutFieldValue>
            <Box display="inline-flex" alignItems="center">
              {clusterType === ClusterTypes.Management ? (
                <Tooltip title="Management cluster">
                  <Box display="flex" mr={1}>
                    <ClusterTypeManagementIcon />
                  </Box>
                </Tooltip>
              ) : (
                <Tooltip title="Workload cluster">
                  <Box display="flex" mr={1}>
                    <ClusterTypeWorkloadIcon />
                  </Box>
                </Tooltip>
              )}
              <span>{formatClusterType(clusterType)}</span>
            </Box>
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Kubernetes version">
          <AboutFieldValue>
            <AsyncValue
              isLoading={controlPlaneIsLoading}
              value={k8sVersion}
              errorMessage={controlPlaneErrorMessage}
            >
              {value => (
                <KubernetesVersion
                  version={formatVersion(value)}
                  hideIcon={false}
                  hideLabel
                />
              )}
            </AsyncValue>
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Release">
          <AboutFieldValue>
            {releaseVersion ? formatVersion(releaseVersion) : <NotAvailable />}
          </AboutFieldValue>
        </AboutField>

        {!isManagementCluster(cluster) && (
          <AboutField label="Installation" value={installationName}>
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

        <AboutField
          label={
            provider === ClusterProviders.AWS ||
            provider === ClusterProviders.Azure
              ? 'Provider/Location'
              : 'Provider'
          }
        >
          <AboutFieldValue>
            {provider ? (
              <ProviderLocationDisplay provider={provider} />
            ) : (
              <NotAvailable />
            )}
          </AboutFieldValue>
        </AboutField>

        <ClusterSwitch
          renderAWS={infrastructureRef => (
            <AboutField label="AWS account">
              <AboutFieldValue>
                <AWSAccountField infrastructureRef={infrastructureRef} />
              </AboutFieldValue>
            </AboutField>
          )}
          renderAzure={() => null}
          renderAzureManaged={() => null}
          renderVSphere={() => null}
          renderVCD={() => null}
        />

        <AboutField label="Organization" value={organization} />

        <AboutField label="Service priority">
          <AboutFieldValue>
            {servicePriority ? (
              formatServicePriority(servicePriority)
            ) : (
              <NotAvailable />
            )}
          </AboutFieldValue>
        </AboutField>

        <AboutField label="Created">
          <AboutFieldValue>
            <Typography variant="inherit">
              <DateComponent value={creationTimestamp} relative />
            </Typography>
          </AboutFieldValue>
        </AboutField>
      </Grid.Root>
    </InfoCard>
  );
}
