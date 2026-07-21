/**
 * NFS app-level module that provides core API overrides, custom icons,
 * and sign-in page.
 *
 * In Backstage 1.48+, only modules with pluginId: 'app' can override
 * core APIs and provide app-level extensions like SignInPage and icons.
 */
import {
  createFrontendModule,
  analyticsApiRef,
  ApiBlueprint,
  AppRootElementBlueprint,
  PageLayout,
} from '@backstage/frontend-plugin-api';
import {
  IconBundleBlueprint,
  SignInPageBlueprint,
  SwappableComponentBlueprint,
  ThemeBlueprint,
} from '@backstage/plugin-app-react';
import DarkIcon from '@material-ui/icons/Brightness2';
import LightIcon from '@material-ui/icons/WbSunny';
import {
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
  InstallationsConfigLoader,
} from '@giantswarm/backstage-plugin-gs';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';
import { grafanaPlugin } from '@backstage-community/plugin-grafana';
import { SentryErrorReporter } from '../../apis/errorReporter';
import { TelemetryDeckAnalyticsApi } from '../../apis/analytics';
import {
  AWSIcon,
  AzureIcon,
  GiantSwarmIcon,
  GrafanaIcon,
} from '../../assets/icons/CustomIcons';
import { BrandingFavicon } from '../branding';
import { DarkThemeProvider, LightThemeProvider } from './customThemes';
import { GSPageLayout } from './GSPageLayout';

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
                  // Per-request matcher (not a static allowlist): the
                  // per-installation `backendUrl` overrides are loaded from the
                  // backend after sign-in, so the set of URLs needing the
                  // Backstage token grows after app boot.
                  allowUrl:
                    GSDiscoveryApiClient.createUrlPrefixAllowlistMatcher(
                      configApi,
                    ),
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
    AppRootElementBlueprint.make({
      name: 'branding-favicon',
      params: {
        element: <BrandingFavicon />,
      },
    }),
    /**
     * Loads the `gs.installations` config from the authenticated backend
     * endpoint once, after sign-in, and publishes it to the module-level source
     * consumed by the boot-time APIs and UI. The block is no longer shipped in
     * the unauthenticated frontend config (it deanonymized customers).
     */
    AppRootElementBlueprint.make({
      name: 'installations-config-loader',
      params: {
        element: <InstallationsConfigLoader />,
      },
    }),
    /**
     * Override the NFS `PageLayout` swappable component so every page header —
     * and, crucially, the sub-page tabs rendered by `PageBlueprint` (flux
     * list/tree, muster, …) — uses the bui `PluginHeader` with absolute tab
     * links and active-state highlighting, instead of the upstream stub whose
     * relative `<a href>` tabs break navigation.
     */
    SwappableComponentBlueprint.make({
      name: 'page-layout',
      params: define =>
        define({
          component: PageLayout,
          loader: () => GSPageLayout,
        }),
    }),
    /**
     * Override the built-in `theme:app/light` and `theme:app/dark` extensions
     * so palette overrides under `app.branding.theme` in app-config take effect.
     * The `id`/`title`/`variant` match upstream defaults so the theme switcher
     * UI and persisted user selections continue to work unchanged.
     */
    ThemeBlueprint.make({
      name: 'light',
      params: {
        theme: {
          id: 'light',
          title: 'Light Theme',
          variant: 'light',
          icon: <LightIcon />,
          Provider: LightThemeProvider,
        },
      },
    }),
    ThemeBlueprint.make({
      name: 'dark',
      params: {
        theme: {
          id: 'dark',
          title: 'Dark Theme',
          variant: 'dark',
          icon: <DarkIcon />,
          Provider: DarkThemeProvider,
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
