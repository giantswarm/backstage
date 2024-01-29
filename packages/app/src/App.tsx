import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
} from '@backstage/plugin-catalog';
import {
  CatalogImportPage,
  catalogImportPlugin,
} from '@backstage/plugin-catalog-import';
import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { orgPlugin } from '@backstage/plugin-org';
import { SearchPage } from '@backstage/plugin-search';
// import {
//   TechDocsIndexPage,
//   techdocsPlugin,
//   TechDocsReaderPage,
// } from '@backstage/plugin-techdocs';
// import { TechDocsAddons } from '@backstage/plugin-techdocs-react';
import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import { ReportIssue } from '@backstage/plugin-techdocs-module-addons-contrib';
import { DefaultProviderSettings, UserSettingsPage } from '@backstage/plugin-user-settings';
import { apis } from './apis';
import { CustomCatalogPage } from './components/catalog/CustomCatalogPage';
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { Root } from './components/Root';

import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
// import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes, GithubAuth } from '@backstage/core-app-api';
import { convertLegacyApp } from '@backstage/core-compat-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';

import { configApiRef, createApiFactory, discoveryApiRef, githubAuthApiRef, oauthRequestApiRef } from '@backstage/core-plugin-api';
import { SignInPage } from '@backstage/core-components';
import { ErrorReporterProvider } from './utils/ErrorReporterProvider';

import { OpsgeniePage } from '@k-phoen/backstage-plugin-opsgenie';
// import { GSPluginPage, GSProviderSettings } from '@internal/plugin-gs';
import gsPlugin from '@internal/plugin-gs/alpha';

import {
  coreExtensionData,
  createExtension,
  createApiExtension,
  createExtensionOverrides,
  createSignInPageExtension,
} from '@backstage/frontend-plugin-api';
import { createApp } from '@backstage/frontend-app-api';
import { ScmAuth, ScmIntegrationsApi, scmAuthApiRef, scmIntegrationsApiRef } from '@backstage/integration-react';
import { GSAuth, gsAuthApiRef } from '@internal/plugin-gs';
import { DefaultErrorBoundaryComponent, DefaultProgressComponent } from './extensions';

// const app = createApp({
//   apis,
//   components: {
//     SignInPage: props => (
//       <SignInPage
//         {...props}
//         auto
//         providers={[{
//           id: 'github-auth-provider',
//           title: 'GitHub',
//           message: 'Sign in using GitHub',
//           apiRef: githubAuthApiRef,
//         }]}
//       />
//     ),
//   },
//   bindRoutes({ bind }) {
//     bind(catalogPlugin.externalRoutes, {
//       createComponent: scaffolderPlugin.routes.root,
//       viewTechDoc: techdocsPlugin.routes.docRoot,
//     });
//     bind(scaffolderPlugin.externalRoutes, {
//       registerComponent: catalogImportPlugin.routes.importPage,
//     });
//     bind(orgPlugin.externalRoutes, {
//       catalogIndex: catalogPlugin.routes.catalogIndex,
//     });
//   },
// });

const signInPage = createSignInPageExtension({
  name: 'guest',
  loader: async () => (props) => (
    <SignInPage
      {...props}
      auto
      providers={[{
        id: 'github-auth-provider',
        title: 'GitHub',
        message: 'Sign in using GitHub',
        apiRef: githubAuthApiRef,
      }]}
    />
  )
});

const githubAuthExtension = createApiExtension({
  factory: createApiFactory({
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
});

const gsAuthExtension = createApiExtension({
  factory: createApiFactory({
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
});

const scmAuthExtension = createApiExtension({
  factory: createApiFactory({
    api: scmAuthApiRef,
    deps: {
      githubAuthApi: githubAuthApiRef,
      gsAuthApi: gsAuthApiRef,
    },
    factory: ({ githubAuthApi, gsAuthApi }) => {
      return ScmAuth.merge(
        ScmAuth.forGithub(githubAuthApi),
        ...gsAuthApi.getProviders().map(({ providerName, apiEndpoint }) => {
          return ScmAuth.forAuthApi(gsAuthApi.getAuthApi(providerName), {
            host: apiEndpoint.replace('https://', ''),
            scopeMapping: { default: [], repoWrite: [] },
          });
        }),
      );
    }
  }),
});

const scmIntegrationApi = createApiExtension({
  factory: createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
});

const collectedLegacyPlugins = convertLegacyApp(
  <FlatRoutes>
    <Route path="/catalog-import" element={<CatalogImportPage />} />
    {/* <Route
      path="/catalog-import"
      element={
        <RequirePermission permission={catalogEntityCreatePermission}>
          <CatalogImportPage />
        </RequirePermission>
      }
    /> */}
  </FlatRoutes>,
);

const app = createApp({
  features: [
    // pagesPlugin,
    // techRadarPlugin,
    // techdocsPlugin,
    gsPlugin,
    // userSettingsPlugin,
    // homePlugin,
    // appVisualizerPlugin,
    // ...collectedLegacyPlugins,
    createExtensionOverrides({
      extensions: [
        // homePageExtension,
        githubAuthExtension,
        gsAuthExtension,
        scmAuthExtension,
        scmIntegrationApi,
        signInPage,
        DefaultProgressComponent,
        DefaultErrorBoundaryComponent,
      ],
    }),
  ],
  /* Handled through config instead */
  // bindRoutes({ bind }) {
  //   bind(pagesPlugin.externalRoutes, { pageX: pagesPlugin.routes.pageX });
  // },
});

export default app.createRoot();

// const routes = (
//   <FlatRoutes>
//     <Route path="/" element={<Navigate to="catalog" />} />
//     <Route path="/catalog" element={<CatalogIndexPage />}>
//       <CustomCatalogPage />
//     </Route>
//     <Route
//       path="/catalog/:namespace/:kind/:name"
//       element={<CatalogEntityPage />}
//     >
//       {entityPage}
//     </Route>
//     {/* <Route path="/docs" element={<TechDocsIndexPage />} />
//     <Route
//       path="/docs/:namespace/:kind/:name/*"
//       element={<TechDocsReaderPage />}
//     >
//       <TechDocsAddons>
//         <ReportIssue />
//       </TechDocsAddons>
//     </Route> */}
//     <Route path="/create" element={<ScaffolderPage />} />
//     {/* <Route
//       path="/catalog-import"
//       element={
//         <RequirePermission permission={catalogEntityCreatePermission}>
//           <CatalogImportPage />
//         </RequirePermission>
//       }
//     /> */}
//     <Route path="/search" element={<SearchPage />}>
//       {searchPage}
//     </Route>
//     <Route
//       path="/settings"
//       element={(
//         <UserSettingsPage
//           providerSettings={
//             <>
//               <DefaultProviderSettings configuredProviders={['github']} />
//               <GSProviderSettings />
//             </>
//           }
//         />
//       )}
//     />
//     <Route path="/catalog-graph" element={<CatalogGraphPage />} />
//     <Route path="/opsgenie" element={<OpsgeniePage onCallListCardsCount={100} />} />
//     <Route path="/clusters" element={<GSPluginPage />} />
//   </FlatRoutes>
// );

// export default app.createRoot(
//   <>
//     <ErrorReporterProvider>
//       <AlertDisplay />
//       <OAuthRequestDialog />
//       <AppRouter>
//         <Root>{routes}</Root>
//       </AppRouter>
//     </ErrorReporterProvider>
//   </>,
// );
