import { useEffect } from 'react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { AsyncValue } from '../../../../UI';
import { useResource } from '../../../../hooks';
import {
  getClusterInfrastructureRef,
  getProviderClusterLocation,
  ProviderCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { useErrors } from '../../../../Errors';

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
    error: providerClusterError,
    refetch: providerClusterRefetch,
    queryKey: providerClusterQueryKey,
    queryErrorMessage: providerClusterQueryErrorMessage,
  } = useResource<ProviderCluster>({
    kind: providerClusterKind,
    apiVersion: providerClusterApiVersion,
    installationName,
    name: providerClusterName,
    namespace: providerClusterNamespace,
  });

  const { showError } = useErrors();
  useEffect(() => {
    if (!providerClusterError) return;

    showError(providerClusterError, {
      queryKey: providerClusterQueryKey,
      message: providerClusterQueryErrorMessage,
      retry: providerClusterRefetch,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerClusterError]);

  const location = providerCluster
    ? getProviderClusterLocation(providerCluster)
    : undefined;

  return (
    <AsyncValue
      isLoading={providerClusterIsLoading}
      error={providerClusterError}
      errorMessage={providerClusterQueryErrorMessage}
      value={location}
    >
      {value => value}
    </AsyncValue>
  );
};
