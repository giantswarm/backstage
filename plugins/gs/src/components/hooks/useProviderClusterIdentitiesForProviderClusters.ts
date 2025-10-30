import {
  AWSClusterRoleIdentity,
  ProviderCluster,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';

export function useProviderClusterIdentitiesForProviderClusters(
  providerClusters: ProviderCluster[],
  { enabled = true },
) {
  const awsInstallations = new Set<string>();
  providerClusters.forEach(providerCluster => {
    const identityRef = providerCluster.getIdentityRef();

    if (!identityRef) {
      return;
    }

    if (identityRef.kind === AWSClusterRoleIdentity.kind) {
      awsInstallations.add(providerCluster.cluster);
    }
  });

  const {
    resources: awsClusterRoleIdentities,
    errors: awsClusterRoleIdentityErrors,
    isLoading: isLoadingAWSClusterRoleIdentities,
  } = useResources(
    Array.from(awsInstallations),
    AWSClusterRoleIdentity,
    {},
    { enabled: enabled && awsInstallations.size > 0 },
  );

  return useMemo(() => {
    return {
      resources: [...awsClusterRoleIdentities],
      errors: [...awsClusterRoleIdentityErrors],
      isLoading: isLoadingAWSClusterRoleIdentities,
    };
  }, [
    awsClusterRoleIdentities,
    awsClusterRoleIdentityErrors,
    isLoadingAWSClusterRoleIdentities,
  ]);
}
