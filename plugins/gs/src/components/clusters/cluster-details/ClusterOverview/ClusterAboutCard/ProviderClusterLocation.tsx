import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '../../../../UI';
import { useResource } from '../../../../hooks';
import {
  getClusterInfrastructureRef,
  getProviderClusterLocation,
  ProviderCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { useShowErrors } from '../../../../Errors/useErrors';

export const ProviderClusterLocation = () => {
  const { cluster, installationName } = useCurrentCluster();

  const {
    kind: providerClusterKind,
    apiVersion: providerClusterApiVersion,
    name: providerClusterName,
    namespace: providerClusterNamespace,
  } = getClusterInfrastructureRef(cluster);
  const {
    data: providerCluster,
    isLoading: providerClusterIsLoading,
    errors: providerClusterErrors,
    queryErrorMessage: providerClusterQueryErrorMessage,
  } = useResource<ProviderCluster>({
    kind: providerClusterKind,
    apiVersion: providerClusterApiVersion,
    installationName,
    name: providerClusterName,
    namespace: providerClusterNamespace,
  });

  useShowErrors(providerClusterErrors, {
    message: providerClusterQueryErrorMessage,
  });

  const location = providerCluster
    ? getProviderClusterLocation(providerCluster)
    : undefined;

  const firstError = providerClusterErrors[0]?.error ?? null;

  return (
    <AsyncValue
      isLoading={providerClusterIsLoading}
      error={firstError}
      errorMessage={providerClusterQueryErrorMessage}
      value={location}
    >
      {value => value}
    </AsyncValue>
  );
};
