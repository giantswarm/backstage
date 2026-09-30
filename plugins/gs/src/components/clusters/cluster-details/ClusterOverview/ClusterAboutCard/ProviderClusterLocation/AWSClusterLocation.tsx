import {
  AWSCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';
import type { InfrastructureRef } from '../../../ClusterSwitch';

export const AWSClusterLocation = ({
  infrastructureRef,
}: {
  infrastructureRef: InfrastructureRef;
}) => {
  const { installationName } = useCurrentCluster();

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
