import {
  AzureCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';
import type { InfrastructureRef } from '../../../ClusterSwitch';

export const AzureClusterLocation = ({
  infrastructureRef,
}: {
  infrastructureRef: InfrastructureRef;
}) => {
  const { installationName } = useCurrentCluster();

  const { name, namespace } = infrastructureRef;

  const {
    resource: azureCluster,
    isLoading,
    errors,
    error,
    incompatibilities,
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
  if (incompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(incompatibilities[0]);
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
