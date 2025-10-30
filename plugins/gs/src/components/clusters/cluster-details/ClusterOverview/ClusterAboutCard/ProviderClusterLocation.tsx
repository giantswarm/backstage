import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '../../../../UI';
import { useShowErrors } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useProviderClusterForCluster } from '../../../../hooks';

export const ProviderClusterLocation = () => {
  const { cluster } = useCurrentCluster();

  const {
    resource: providerCluster,
    isLoading: providerClusterIsLoading,
    errors: providerClusterErrors,
    errorMessage: providerClusterErrorMessage,
  } = useProviderClusterForCluster(cluster);

  const infrastructureRef = cluster.getInfrastructureRef();
  if (!infrastructureRef) {
    throw new Error(
      'There is no infrastructure reference defined in the cluster resource.',
    );
  }

  useShowErrors(providerClusterErrors, {
    message: providerClusterErrorMessage,
  });

  const location = providerCluster ? providerCluster.getLocation() : undefined;

  const firstError = providerClusterErrors[0]?.error ?? null;

  return (
    <AsyncValue
      isLoading={providerClusterIsLoading}
      error={firstError}
      errorMessage={providerClusterErrorMessage}
      value={location}
    >
      {value => value}
    </AsyncValue>
  );
};
