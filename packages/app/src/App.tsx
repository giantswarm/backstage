import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
} from '@backstage/plugin-catalog';
import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { ScaffolderFieldExtensions } from '@backstage/plugin-scaffolder-react';
import { orgPlugin } from '@backstage/plugin-org';
import { SearchPage } from '@backstage/plugin-search';
import {
  TechDocsIndexPage,
  techdocsPlugin,
  TechDocsReaderPage,
} from '@backstage/plugin-techdocs';
import {
  DefaultProviderSettings,
  UserSettingsPage,
} from '@backstage/plugin-user-settings';
import { apis } from './apis';
import { CustomCatalogPage } from './components/catalog/CustomCatalogPage';
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { Root } from './components/Root';

import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FeatureFlagged, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';

import { githubAuthApiRef } from '@backstage/core-plugin-api';
import { SignInPage } from '@backstage/core-components';
import { ErrorReporterProvider } from './utils/ErrorReporterProvider';

import { OpsgeniePage } from '@k-phoen/backstage-plugin-opsgenie';
import { FluxRuntimePage } from '@weaveworksoss/backstage-plugin-flux';
import {
  GSClusterPickerFieldExtension,
  GSClustersPage,
  GSFeatureEnabled,
  GSProviderSettings,
} from '@internal/plugin-gs';

const app = createApp({
  apis,
  components: {
    SignInPage: props => (
      <SignInPage
        {...props}
        auto
        providers={[
          {
            id: 'github-auth-provider',
            title: 'GitHub',
            message: 'Sign in using GitHub',
            apiRef: githubAuthApiRef,
          },
        ]}
      />
    ),
  },
  bindRoutes({ bind }) {
    bind(catalogPlugin.externalRoutes, {
      createComponent: scaffolderPlugin.routes.root,
      viewTechDoc: techdocsPlugin.routes.docRoot,
    });
    bind(orgPlugin.externalRoutes, {
      catalogIndex: catalogPlugin.routes.catalogIndex,
    });
  },
  featureFlags: [
    {
      pluginId: '',
      name: 'show-kubernetes-resources',
      description:
        'Show Kubernetes resources for service components. Requires matching labels on resources.',
    },
    {
      pluginId: '',
      name: 'show-flux-deployments',
      description:
        'Show Flux deployments for service components (from weaveworks/backstage-plugin-flux). Requires matching labels on resources.',
    },
    {
      pluginId: '',
      name: 'show-flux-sources',
      description:
        'Show Flux sources for service components (from weaveworks/backstage-plugin-flux). Requires matching labels on resources.',
    },
    {
      pluginId: '',
      name: 'show-flux-runtime',
      description:
        'Show Flux Runtime page (from weaveworks/backstage-plugin-flux).',
    },
  ],
});

const routes = (
  <FlatRoutes>
    <Route path="/" element={<Navigate to="catalog" />} />
    <Route path="/catalog" element={<CatalogIndexPage />}>
      <CustomCatalogPage />
    </Route>
    <Route
      path="/catalog/:namespace/:kind/:name"
      element={<CatalogEntityPage />}
    >
      {entityPage}
    </Route>
    <Route path="/docs" element={<TechDocsIndexPage />} />
    <Route
      path="/docs/:namespace/:kind/:name/*"
      element={<TechDocsReaderPage />}
    />

    <Route
      path="/create"
      element={
        <GSFeatureEnabled feature="scaffolder">
          <ScaffolderPage />
        </GSFeatureEnabled>
      }
    >
      <ScaffolderFieldExtensions>
        <GSClusterPickerFieldExtension />
      </ScaffolderFieldExtensions>
    </Route>
    <Route path="/search" element={<SearchPage />}>
      {searchPage}
    </Route>
    <Route
      path="/settings"
      element={
        <UserSettingsPage
          providerSettings={
            <>
              <DefaultProviderSettings configuredProviders={['github']} />
              <GSProviderSettings />
            </>
          }
        />
      }
    />
    <Route path="/catalog-graph" element={<CatalogGraphPage />} />
    <Route
      path="/opsgenie"
      element={
        <GSFeatureEnabled feature="opsgenie">
          <OpsgeniePage onCallListCardsCount={100} />
        </GSFeatureEnabled>
      }
    />
    <Route path="/clusters" element={<GSClustersPage />} />
    <FeatureFlagged with="show-flux-runtime">
      <Route path="/flux-runtime" element={<FluxRuntimePage />} />
    </FeatureFlagged>
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <ErrorReporterProvider>
      <AlertDisplay />
      <OAuthRequestDialog />
      <AppRouter>
        <Root>{routes}</Root>
      </AppRouter>
    </ErrorReporterProvider>
  </>,
);
