import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  microsoftAuthApiRef,
  googleAuthApiRef,
} from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  KubernetesAuthProviders,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import {
  gsAuthProvidersApiRef,
  GSDiscoveryApiClient,
  KubernetesClient,
} from '@giantswarm/backstage-plugin-gs';

export const KubernetesAuthProvidersOverride = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: kubernetesAuthProvidersApiRef,
      deps: {
        microsoftAuthApi: microsoftAuthApiRef,
        googleAuthApi: googleAuthApiRef,
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: ({ microsoftAuthApi, googleAuthApi, gsAuthProvidersApi }) => {
        const oidcProviders = {
          ...gsAuthProvidersApi.getKubernetesAuthApis(),
        };
        return new KubernetesAuthProviders({
          microsoftAuthApi,
          googleAuthApi,
          oidcProviders,
        });
      },
    }),
});

export const KubernetesClientOverride = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: kubernetesApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: ({
        configApi,
        discoveryApi,
        fetchApi,
        kubernetesAuthProvidersApi,
      }) =>
        new KubernetesClient({
          configApi,
          discoveryApi: discoveryApi as GSDiscoveryApiClient,
          fetchApi,
          kubernetesAuthProvidersApi,
        }),
    }),
});
