import {
  ScmAuth,
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
  githubAuthApiRef,
  googleAuthApiRef,
  identityApiRef,
  microsoftAuthApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';
import {
  createFetchApi,
  FetchMiddlewares,
  GithubAuth,
} from '@backstage/core-app-api';
import { visitsApiRef, VisitsWebStorageApi } from '@backstage/plugin-home';
import {
  kubernetesApiRef,
  KubernetesAuthProviders,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  gsAuthProvidersApiRef,
  GSDiscoveryApiClient,
  GSScaffolderApiClient,
  KubernetesClient,
} from '@giantswarm/backstage-plugin-gs';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import ErrorReporter from './utils/ErrorReporter';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: errorReporterApiRef,
    deps: {},
    factory: () => ErrorReporter.getInstance(),
  }),
  createApiFactory({
    api: discoveryApiRef,
    deps: {
      configApi: configApiRef,
    },
    factory: ({ configApi }) => GSDiscoveryApiClient.fromConfig(configApi),
  }),
  createApiFactory({
    api: fetchApiRef,
    deps: {
      configApi: configApiRef,
      identityApi: identityApiRef,
      discoveryApi: discoveryApiRef,
    },
    factory: ({ configApi, identityApi, discoveryApi }) => {
      return createFetchApi({
        middleware: [
          FetchMiddlewares.resolvePluginProtocol({
            discoveryApi,
          }),
          FetchMiddlewares.injectIdentityAuth({
            identityApi,
            config: configApi,
            urlPrefixAllowlist:
              GSDiscoveryApiClient.getUrlPrefixAllowlist(configApi),
          }),
        ],
      });
    },
  }),

  createApiFactory({
    api: scaffolderApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      identityApi: identityApiRef,
      scmIntegrationsApi: scmIntegrationsApiRef,
      fetchApi: fetchApiRef,
    },
    factory: ({ scmIntegrationsApi, discoveryApi, identityApi, fetchApi }) =>
      new GSScaffolderApiClient({
        discoveryApi,
        identityApi,
        scmIntegrationsApi,
        fetchApi,
      }),
  }),
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),
  /**
   * Custom GitHub API configuration to modify defaultScopes to include all the scopes that different plugins need.
   * It's needed to prevent different plugins to request additional permissions over sign in popup.
   * ['read:user'] is used by default.
   * ['read:user', 'repo'] is required by @roadiehq/backstage-plugin-github-pull-requests.
   * ['read:user', 'repo', 'read:org'] is required by @backstage-community/plugin-github-actions.
   */
  createApiFactory({
    api: githubAuthApiRef,
    deps: {
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
    },
    factory: ({ configApi, discoveryApi, oauthRequestApi }) =>
      GithubAuth.create({
        configApi,
        discoveryApi,
        oauthRequestApi,
        defaultScopes: ['read:user', 'repo', 'read:org'],
      }),
  }),
  createApiFactory({
    api: visitsApiRef,
    deps: {
      identityApi: identityApiRef,
      errorApi: errorApiRef,
    },
    factory: ({ identityApi, errorApi }) =>
      VisitsWebStorageApi.create({ identityApi, errorApi }),
  }),
  createApiFactory({
    api: kubernetesAuthProvidersApiRef,
    deps: {
      microsoftAuthApi: microsoftAuthApiRef,
      googleAuthApi: googleAuthApiRef,
      gsAuthProvidersApi: gsAuthProvidersApiRef,
    },
    factory: ({ microsoftAuthApi, googleAuthApi, gsAuthProvidersApi }) => {
      const oidcProviders = {
        ...gsAuthProvidersApi.getAuthApis(),
      };

      return new KubernetesAuthProviders({
        microsoftAuthApi,
        googleAuthApi,
        oidcProviders,
      });
    },
  }),
  createApiFactory({
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
    }) => {
      return new KubernetesClient({
        configApi,
        discoveryApi: discoveryApi as GSDiscoveryApiClient,
        fetchApi,
        kubernetesAuthProvidersApi,
      });
    },
  }),
];
