import {
  AzureCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '../../../../../UI';

export const AzureClusterLocation = () => {
  const { cluster, installationName } = useCurrentCluster();

  const infrastructureRef = cluster.getInfrastructureRef();
  if (!infrastructureRef) {
    throw new Error(
      'There is no infrastructure reference defined in the cluster resource.',
    );
  }

  const { name, namespace } = infrastructureRef;

  const {
    resource: azureCluster,
    isLoading,
    errors,
    error,
    incompatibility,
  } = useResource(installationName, AzureCluster, { name, namespace });

  let errorMessage: string | undefined;
  if (error) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: AzureCluster.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  if (incompatibility) {
    errorMessage = getIncompatibilityMessage(incompatibility);
  }

  useShowErrors(errors);

  const location = azureCluster?.getLocation();

  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={location}
    />
  );
};
