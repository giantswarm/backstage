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
  githubAuthApiRef,
  gitlabAuthApiRef,
  googleAuthApiRef,
  microsoftAuthApiRef,
  oauthRequestApiRef,
  oktaAuthApiRef,
  oneloginAuthApiRef,
} from '@backstage/core-plugin-api';
import { GithubAuth } from '@backstage/core-app-api';
import {
  KubernetesAuthProviders,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes';
import { gsAuthApiRef, GSAuth } from '@giantswarm/backstage-plugin-gs';

export const apis: AnyApiFactory[] = [
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
    api: gsAuthApiRef,
    deps: {
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
    },
    factory: ({ configApi, discoveryApi, oauthRequestApi }) =>
      GSAuth.create({
        configApi,
        discoveryApi,
        oauthRequestApi,
      }),
  }),

  createApiFactory({
    api: kubernetesAuthProvidersApiRef,
    deps: {
      gitlabAuthApi: gitlabAuthApiRef,
      googleAuthApi: googleAuthApiRef,
      microsoftAuthApi: microsoftAuthApiRef,
      oktaAuthApi: oktaAuthApiRef,
      oneloginAuthApi: oneloginAuthApiRef,
      gsAuthApi: gsAuthApiRef,
    },
    factory: ({
      gitlabAuthApi,
      googleAuthApi,
      microsoftAuthApi,
      oktaAuthApi,
      oneloginAuthApi,
      gsAuthApi,
    }) => {
      const oidcProviders = {
        gitlab: gitlabAuthApi,
        google: googleAuthApi,
        microsoft: microsoftAuthApi,
        okta: oktaAuthApi,
        onelogin: oneloginAuthApi,
        ...gsAuthApi.getAuthApis(),
      };

      return new KubernetesAuthProviders({
        microsoftAuthApi,
        googleAuthApi,
        oidcProviders,
      });
    },
  }),
];
