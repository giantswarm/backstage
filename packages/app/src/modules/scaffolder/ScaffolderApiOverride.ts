import {
  ApiBlueprint,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/frontend-plugin-api';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { scmIntegrationsApiRef } from '@backstage/integration-react';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { GSScaffolderApiClient } from '@giantswarm/backstage-plugin-gs';

export const ScaffolderApiOverride = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: scaffolderApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        identityApi: identityApiRef,
        scmIntegrationsApi: scmIntegrationsApiRef,
        fetchApi: fetchApiRef,
        kubernetesApi: kubernetesApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: ({
        scmIntegrationsApi,
        discoveryApi,
        identityApi,
        fetchApi,
        kubernetesApi,
        kubernetesAuthProvidersApi,
      }) =>
        new GSScaffolderApiClient({
          discoveryApi,
          identityApi,
          scmIntegrationsApi,
          fetchApi,
          kubernetesApi,
          kubernetesAuthProvidersApi,
        }),
    }),
});
