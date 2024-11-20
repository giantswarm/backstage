import { configApiRef, useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/esm/useAsync';
import { jwtDecode } from 'jwt-decode';
import { gsKubernetesApiRef } from '../../apis/kubernetes';
import { gsKubernetesAuthProvidersApiRef } from '../../apis/kubernetes-auth-providers';

type JWT = {
  groups: string[];
};

export function useCurrentUser(installationName: string) {
  const configApi = useApi(configApiRef);
  const adminGroups = configApi.getOptionalStringArray('gs.adminGroups') || [];

  const kubernetesApi = useApi(gsKubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(gsKubernetesAuthProvidersApiRef);
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

  let isGSUser = undefined;
  if (!tokenIsLoading && token) {
    isGSUser = token.groups.some(group => adminGroups.includes(group));
  }

  return {
    isLoading: tokenIsLoading,
    isGSUser,
  };
}
