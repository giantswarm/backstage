import {
  ScmAuth,
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  analyticsApiRef,
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  githubAuthApiRef,
  identityApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';
import { TelemetryDeckAnalyticsApi } from './apis/analytics';
import {
  createFetchApi,
  FetchMiddlewares,
  GithubAuth,
} from '@backstage/core-app-api';
import { GSDiscoveryApiClient } from '@giantswarm/backstage-plugin-gs';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';
import { SentryErrorReporter } from './apis/errorReporter';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: errorReporterApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => SentryErrorReporter.fromConfig(configApi),
  }),
  createApiFactory({
    api: analyticsApiRef,
    deps: {
      configApi: configApiRef,
      identityApi: identityApiRef,
      errorReporterApi: errorReporterApiRef,
    },
    factory: ({ configApi, identityApi, errorReporterApi }) =>
      TelemetryDeckAnalyticsApi.fromConfig({
        configApi,
        identityApi,
        errorReporterApi,
      }),
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
];
