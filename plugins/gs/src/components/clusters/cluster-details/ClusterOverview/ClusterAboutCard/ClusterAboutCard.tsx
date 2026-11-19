import { useMemo } from 'react';
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
import { useClusterControlPlane } from '../../../ClusterDetailsPage/useClusterControlPlane';
import { ProviderClusterLocation } from './ProviderClusterLocation';
import { AWSAccountField } from './AWSAccountField';
import { ClusterSwitch } from '../../ClusterSwitch';
import { clusterDetailsRouteRef } from '../../../../../routes';
import {
  ClusterTypeManagementIcon,
  ClusterTypeWorkloadIcon,
  AWSProviderIcon,
  AzureProviderIcon,
} from '../../../../../assets/icons/CustomIcons';
import { ClusterTypes, ClusterProviders } from '../../../utils';
import { AsyncValue, InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { getClusterKey, useWorkerCapacity } from '../../../../hooks';
import { WorkerCapacity } from '../../../WorkerCapacity';

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

  const managementClusterRouteLink = useRouteRef(clusterDetailsRouteRef)!;

  const {
    isLoading: controlPlaneIsLoading,
    version: k8sVersion,
    errorMessage: controlPlaneErrorMessage,
  } = useClusterControlPlane();

  const clusters = useMemo(() => [cluster], [cluster]);
  const { capacities } = useWorkerCapacity(clusters);
  const workerCapacity = capacities.get(
    getClusterKey({
      installationName,
      namespace: cluster.getNamespace(),
      name: cluster.getName(),
    }),
  );

  const clusterType = calculateClusterType(cluster);
  const description = getClusterDescription(cluster);
  const releaseVersion = getClusterReleaseVersion(cluster);
  const organization = getClusterOrganization(cluster);
  const servicePriority = getClusterServicePriority(cluster);
  const provider = calculateClusterProvider(cluster);
  const creationTimestamp = getClusterCreationTimestamp(cluster);

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

        <AboutField label="Worker capacity">
          <AboutFieldValue>
            <AsyncValue
              isLoading={workerCapacity?.isLoading ?? false}
              errorMessage={workerCapacity?.errorMessage}
              value={
                workerCapacity?.capacity && (
                  <WorkerCapacity
                    capacity={workerCapacity.capacity}
                    metricsStatus={workerCapacity.metricsStatus}
                  />
                )
              }
            />
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
