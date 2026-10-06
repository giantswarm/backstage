import {
  AWSCluster,
  AzureASOManagedCluster,
  AzureCluster,
  getErrorMessage,
  getIncompatibilityMessage,
  ProviderCluster,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../../ClusterDetailsPage/useCurrentCluster';
import { useIsExpectedClusterError } from '../../../../ClusterDetailsPage/useIsExpectedClusterError';
import { AsyncValue } from '@giantswarm/backstage-plugin-ui-react';
import type { InfrastructureRef } from '../../../ClusterSwitch';

/** The infrastructure cluster kinds that carry a location. */
export type LocatedProviderClusterModel =
  typeof AWSCluster | typeof AzureCluster | typeof AzureASOManagedCluster;

/**
 * Reads the infrastructure cluster a Cluster references through the given
 * model and renders its location, with the fetch and API-version errors of
 * that one resource.
 */
export const ProviderClusterLocationValue = ({
  model,
  infrastructureRef,
}: {
  model: LocatedProviderClusterModel;
  infrastructureRef: InfrastructureRef;
}) => {
  const { installationName } = useCurrentCluster();
  const isExpectedError = useIsExpectedClusterError();

  const { name, namespace } = infrastructureRef;

  const {
    resource: providerCluster,
    isLoading,
    errors,
    error,
    incompatibilities,
  } = useResource<ProviderCluster>(installationName, model, {
    name,
    namespace,
  });

  let errorMessage: string | undefined;
  if (error && !isExpectedError(error)) {
    errorMessage = getErrorMessage({
      error,
      resourceKind: model.kind,
      resourceName: name,
      resourceNamespace: namespace,
    });
  }
  if (incompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(incompatibilities[0]);
  }

  useShowErrors(errors);

  const location = providerCluster?.getLocation();

  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={location}
    />
  );
};
