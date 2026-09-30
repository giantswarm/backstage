import {
  AzureCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';

export const AzureClusterLocation = () => {
  const { cluster, installationName } = useCurrentCluster();

  // Without an infrastructure reference there is nothing to read, and the
  // location reads as not available.
  const infrastructureRef = cluster.getInfrastructureRef();
  const name = infrastructureRef?.name ?? '';
  const namespace = infrastructureRef?.namespace;
  const hasInfrastructureRef = infrastructureRef !== undefined;

  const {
    resource: azureCluster,
    isLoading,
    errors,
    error,
    incompatibilities,
  } = useResource(
    installationName,
    AzureCluster,
    { name, namespace },
    { enabled: hasInfrastructureRef },
  );

  let errorMessage: string | undefined;
  if (error) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: AzureCluster.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  // A disabled query still returns cached incompatibilities.
  if (hasInfrastructureRef && incompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(incompatibilities[0]);
  }

  useShowErrors(hasInfrastructureRef ? errors : null);

  const location = azureCluster?.getLocation();

  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={location}
    />
  );
};
