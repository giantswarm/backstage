import useAsync from 'react-use/esm/useAsync';
import { jwtDecode } from 'jwt-decode';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useApi } from '@backstage/core-plugin-api';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

type JWT = {
  groups: string[];
};

/**
 * Whether the signed-in person is Giant Swarm staff on this installation: one
 * of the groups in their installation token is listed in `gs.adminGroups`.
 * The groups list is part of the signed-in config, so the answer is undefined
 * until both the config and the token have loaded.
 */
export function useCurrentUser(installationName: string) {
  const { config, isLoading: configIsLoading } = useSignedInConfig();
  const adminGroups = config?.getOptionalStringArray('gs.adminGroups') ?? [];

  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);
  const { loading: tokenIsLoading, value: token } = useAsync(async () => {
    const cluster = await kubernetesApi.getCluster(installationName);

    if (!cluster) {
      throw new Error(`Cluster ${installationName} not found`);
    }

    const authProvider =
      cluster.authProvider === 'oidc'
        ? `${cluster.authProvider}.${cluster.oidcTokenProvider}`
        : cluster.authProvider;

    const credentials =
      await kubernetesAuthProvidersApi.getCredentials(authProvider);

    if (!credentials.token) {
      throw new Error('No token found in credentials');
    }

    return jwtDecode(credentials.token) as JWT;
  });

  const isLoading = tokenIsLoading || configIsLoading;

  let isGSUser = undefined;
  if (!isLoading && token) {
    isGSUser = token.groups.some(group => adminGroups.includes(group));
  }

  return {
    isLoading,
    isGSUser,
  };
}
