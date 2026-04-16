/**
 * NFS app-level module that provides core API overrides, custom icons,
 * and sign-in page.
 *
 * In Backstage 1.48+, only modules with pluginId: 'app' can override
 * core APIs and provide app-level extensions like SignInPage and icons.
 */
import {
  createFrontendModule,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  IconBundleBlueprint,
  SignInPageBlueprint,
} from '@backstage/plugin-app-react';
import {
  analyticsApiRef,
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  githubAuthApiRef,
  identityApiRef,
  oauthRequestApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  ScmAuth,
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
} from '@backstage/integration-react';
import {
  createFetchApi,
  FetchMiddlewares,
  GithubAuth,
} from '@backstage/core-app-api';
import {
  GSDiscoveryApiClient,
  gsAuthApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';
import { grafanaPlugin } from '@k-phoen/backstage-plugin-grafana';
import { SentryErrorReporter } from '../../apis/errorReporter';
import { TelemetryDeckAnalyticsApi } from '../../apis/analytics';
import {
  AWSIcon,
  AzureIcon,
  GiantSwarmIcon,
  GrafanaIcon,
} from '../../assets/icons/CustomIcons';

// The Grafana plugin is a legacy plugin whose API factory is not
// auto-registered in the NFS. Extract it and provide via ApiBlueprint.
const [grafanaApiFactory] = grafanaPlugin.getApis();

export const appOverrides = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ApiBlueprint.make({
      name: 'error-reporter',
      params: defineParams =>
        defineParams({
          api: errorReporterApiRef,
          deps: { configApi: configApiRef },
          factory: ({ configApi }) => SentryErrorReporter.fromConfig(configApi),
        }),
    }),
    ApiBlueprint.make({
      name: 'analytics',
      params: defineParams =>
        defineParams({
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
    }),
    ApiBlueprint.make({
      name: 'discovery',
      params: defineParams =>
        defineParams({
          api: discoveryApiRef,
          deps: { configApi: configApiRef },
          factory: ({ configApi }) =>
            GSDiscoveryApiClient.fromConfig(configApi),
        }),
    }),
    ApiBlueprint.make({
      name: 'fetch',
      params: defineParams =>
        defineParams({
          api: fetchApiRef,
          deps: {
            configApi: configApiRef,
            identityApi: identityApiRef,
            discoveryApi: discoveryApiRef,
          },
          factory: ({ configApi, identityApi, discoveryApi }) =>
            createFetchApi({
              middleware: [
                FetchMiddlewares.resolvePluginProtocol({ discoveryApi }),
                FetchMiddlewares.injectIdentityAuth({
                  identityApi,
                  config: configApi,
                  urlPrefixAllowlist:
                    GSDiscoveryApiClient.getUrlPrefixAllowlist(configApi),
                  header: {
                    name: 'X-Backstage-Token',
                    value: (token: string) => `Bearer ${token}`,
                  },
                }),
              ],
            }),
        }),
    }),
    ApiBlueprint.make({
      name: 'scm-integrations',
      params: defineParams =>
        defineParams({
          api: scmIntegrationsApiRef,
          deps: { configApi: configApiRef },
          factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
        }),
    }),
    ApiBlueprint.make({
      name: 'scm-auth',
      params: defineParams => defineParams(ScmAuth.createDefaultApiFactory()),
    }),
    /**
     * Custom GitHub API configuration to include all scopes needed by plugins.
     * ['read:user'] is used by default.
     * ['read:user', 'repo'] is required by @roadiehq/backstage-plugin-github-pull-requests.
     * ['read:user', 'repo', 'read:org'] is required by @backstage-community/plugin-github-actions.
     */
    ApiBlueprint.make({
      name: 'github-auth',
      params: defineParams =>
        defineParams({
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
    }),
    IconBundleBlueprint.make({
      name: 'gs-icons',
      params: {
        icons: {
          giantswarm: <GiantSwarmIcon />,
          grafana: <GrafanaIcon />,
          aws: <AWSIcon />,
          azure: <AzureIcon />,
        },
      },
    }),
    ApiBlueprint.make({
      name: 'grafana-api',
      params: defineParams => defineParams(grafanaApiFactory),
    }),
    SignInPageBlueprint.make({
      params: {
        loader: async () => {
          const { SignInPage, ProxiedSignInPage } =
            await import('@backstage/core-components');
          const CustomSignInPage = (props: {
            onSignInSuccess: (identityApi: any) => void;
          }) => {
            const configApi = useApi(configApiRef);
            if (configApi.has('gs.authProvider')) {
              return (
                <SignInPage
                  {...props}
                  auto
                  providers={[
                    {
                      id: 'dex-auth-provider',
                      title: 'Dex',
                      message: 'Sign in using Dex',
                      apiRef: gsAuthApiRef,
                    },
                  ]}
                />
              );
            }
            return <ProxiedSignInPage {...props} provider="guest" />;
          };
          return CustomSignInPage;
        },
      },
    }),
  ],
});
