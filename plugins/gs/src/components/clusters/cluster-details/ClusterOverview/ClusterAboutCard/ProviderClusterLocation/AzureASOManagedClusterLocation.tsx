import {
  AzureASOManagedCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';
import type { InfrastructureRef } from '../../../ClusterSwitch';

export const AzureASOManagedClusterLocation = ({
  infrastructureRef,
}: {
  infrastructureRef: InfrastructureRef;
}) => {
  const { installationName } = useCurrentCluster();

  const { name, namespace } = infrastructureRef;

  const {
    resource: azureASOManagedCluster,
    isLoading,
    errors,
    error,
    incompatibilities,
  } = useResource(installationName, AzureASOManagedCluster, {
    name,
    namespace,
  });

  let errorMessage: string | undefined;
  if (error) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: AzureASOManagedCluster.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  if (incompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(incompatibilities[0]);
  }

  useShowErrors(errors);

  const location = azureASOManagedCluster?.getLocation();

  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={location}
    />
  );
};
