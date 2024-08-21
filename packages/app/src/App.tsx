import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
} from '@backstage/plugin-catalog';
import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
import {
  ScaffolderFieldExtensions,
  ScaffolderLayouts,
} from '@backstage/plugin-scaffolder-react';
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
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { Root } from './components/Root';

import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';

import { githubAuthApiRef } from '@backstage/core-plugin-api';
import { SignInPage } from '@backstage/core-components';
import { ErrorReporterProvider } from './utils/ErrorReporterProvider';

import { OpsgeniePage } from '@k-phoen/backstage-plugin-opsgenie';
import {
  GSClusterPickerFieldExtension,
  GSTemplateStringInputFieldExtension,
  GSClustersPage,
  GSCustomCatalogPage,
  GSInstallationsPage,
  GSFeatureEnabled,
  GSProviderSettings,
  GSStepLayout,
  GSDeploymentDetailsPickerFieldExtension,
  GSSecretStorePickerFieldExtension,
} from '@internal/plugin-gs';

import { GiantSwarmIcon, GrafanaIcon } from './assets/icons/CustomIcons';

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
      name: 'show-installations-page',
      description: 'Show Giant Swarm installations page in the main menu.',
    },
  ],
  icons: {
    giantswarm: GiantSwarmIcon,
    grafana: GrafanaIcon,
  },
});

const createHeaderOptions = {
  pageTitleOverride: 'Create things',
  title: 'Create things',
  subtitle: 'Create new things from templates',
};

const routes = (
  <FlatRoutes>
    <Route path="/" element={<Navigate to="catalog" />} />
    <Route path="/catalog" element={<CatalogIndexPage />}>
      <GSCustomCatalogPage />
    </Route>
    <Route
      path="/installations"
      element={
        <GSFeatureEnabled feature="installationsPage">
          <CatalogIndexPage />
        </GSFeatureEnabled>
      }
    >
      <GSInstallationsPage />
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
          <ScaffolderPage headerOptions={createHeaderOptions} />
        </GSFeatureEnabled>
      }
    >
      <ScaffolderFieldExtensions>
        <GSClusterPickerFieldExtension />
        <GSDeploymentDetailsPickerFieldExtension />
        <GSSecretStorePickerFieldExtension />
        <GSTemplateStringInputFieldExtension />
      </ScaffolderFieldExtensions>
      <ScaffolderLayouts>
        <GSStepLayout />
      </ScaffolderLayouts>
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
    <Route
      path="/clusters"
      element={
        <GSFeatureEnabled feature="clustersPage">
          <GSClustersPage />
        </GSFeatureEnabled>
      }
    />
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
