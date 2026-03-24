import {
  AWSCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';

export const AWSClusterLocation = () => {
  const { cluster, installationName } = useCurrentCluster();

  const infrastructureRef = cluster.getInfrastructureRef();
  if (!infrastructureRef) {
    throw new Error(
      'There is no infrastructure reference defined in the cluster resource.',
    );
  }

  const { name, namespace } = infrastructureRef;

  const {
    resource: awsCluster,
    isLoading,
    errors,
    error,
    incompatibilities,
  } = useResource(installationName, AWSCluster, { name, namespace });

  let errorMessage: string | undefined;
  if (error) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: AWSCluster.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  if (incompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(incompatibilities[0]);
  }

  useShowErrors(errors);

  const location = awsCluster?.getLocation();

  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={location}
    />
  );
};
