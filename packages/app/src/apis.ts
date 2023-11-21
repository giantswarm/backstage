import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
  scmAuthApiRef,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  githubAuthApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';
import { GithubAuth } from '@backstage/core-app-api';
import { createScmAuthInstances, gsAuthApiRefs, gsAuthProviderFactories } from '@internal/plugin-gs';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  /**
   * Custom GitHub API configuration to modify defaultScopes to include all the scopes that different plugins need.
   * It's needed to prevent different plugins to request additional permissions over sign in popup.
   * ['read:user'] is used by default.
   * ['read:user', 'repo'] is required by @roadiehq/backstage-plugin-github-pull-requests.
   * ['read:user', 'repo', 'read:org'] is required by @backstage/plugin-github-actions.
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

  /**
   * A set of OIDC auth provider factories for the GS plugin
   */
  ...gsAuthProviderFactories,

  createApiFactory({
    api: scmAuthApiRef,
    deps: {
      configApi: configApiRef,
      githubAuthApi: githubAuthApiRef,
      ...gsAuthApiRefs,
    },
      factory: ({ configApi, githubAuthApi, ...gsAuthApis }) => {
      return ScmAuth.merge(
        ScmAuth.forGithub(githubAuthApi),
        /**
         * ScmAuth instances for GS plugin auth providers
         */
        ...createScmAuthInstances(gsAuthApis, configApi)
      );
    }
  }),
];
