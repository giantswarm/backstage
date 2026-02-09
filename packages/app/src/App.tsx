import { Route } from 'react-router-dom';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
} from '@backstage/plugin-catalog';
import { SignalsDisplay } from '@backstage/plugin-signals';
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
import { createApp } from '@backstage/frontend-defaults';
import {
  convertLegacyAppOptions,
  convertLegacyAppRoot,
} from '@backstage/core-compat-api';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';

import { SignInPage } from '@backstage/core-components';

import { HomepageCompositionRoot, VisitListener } from '@backstage/plugin-home';
import { HomePage } from './components/home/HomePage';

import {
  GSChartPickerFieldExtension,
  GSChartTagPickerFieldExtension,
  GSClusterPickerFieldExtension,
  GSTemplateStringInputFieldExtension,
  GSClustersPage,
  GSCustomCatalogPage,
  GSInstallationsPage,
  GSProviderSettings,
  GSStepLayout,
  GSProviderConfigPickerFieldExtension,
  GSOIDCTokenFieldExtension,
  GSInstallationPickerFieldExtension,
  GSReleasePickerFieldExtension,
  GSOrganizationPickerFieldExtension,
  GSSecretStorePickerFieldExtension,
  GSYamlValuesEditorFieldExtension,
  GSYamlValuesValidationFieldExtension,
  gsAuthApiRef,
  GSDeploymentsPage,
  gsPlugin,
} from '@giantswarm/backstage-plugin-gs';

import { GiantSwarmIcon, GrafanaIcon } from './assets/icons/CustomIcons';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import fluxPlugin from '@giantswarm/backstage-plugin-flux';
import aiChatPlugin from '@giantswarm/backstage-plugin-ai-chat';

// Convert legacy app options to new frontend system features
const legacyAppOptions = convertLegacyAppOptions({
  apis,
  components: {
    SignInPage: props => {
      const providers = [];
      const configApi = useApi(configApiRef);
      if (configApi.has('gs.authProvider')) {
        providers.push({
          id: 'dex-auth-provider',
          title: 'Dex',
          message: 'Sign in using Dex',
          apiRef: gsAuthApiRef,
        });
      }
      return <SignInPage {...props} auto providers={providers} />;
    },
  },
  // Note: bindRoutes moved to app-config.yaml under app.routes.bindings
  featureFlags: [
    {
      pluginId: '',
      name: 'show-kubernetes-resources',
      description:
        'Show Kubernetes resources for service components. Requires matching labels on resources.',
    },
    {
      pluginId: 'ai-chat',
      name: 'ai-chat-verbose-debugging',
    },
  ],
  icons: {
    giantswarm: GiantSwarmIcon,
    grafana: GrafanaIcon,
  },
  // Legacy plugins that need route bindings
  plugins: [
    catalogPlugin,
    orgPlugin,
    scaffolderPlugin,
    techdocsPlugin,
    gsPlugin,
  ],
});

const createHeaderOptions = {
  pageTitleOverride: 'Create things',
  title: 'Create things',
  subtitle: 'Create new things from templates',
};

const routes = (
  <FlatRoutes>
    <Route path="/" element={<HomepageCompositionRoot />}>
      <HomePage />
    </Route>
    <Route path="/catalog" element={<CatalogIndexPage />}>
      <GSCustomCatalogPage />
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
      element={<ScaffolderPage headerOptions={createHeaderOptions} />}
    >
      <ScaffolderFieldExtensions>
        <GSChartPickerFieldExtension />
        <GSChartTagPickerFieldExtension />
        <GSClusterPickerFieldExtension />
        <GSProviderConfigPickerFieldExtension />
        <GSOIDCTokenFieldExtension />
        <GSSecretStorePickerFieldExtension />
        <GSTemplateStringInputFieldExtension />
        <GSInstallationPickerFieldExtension />
        <GSReleasePickerFieldExtension />
        <GSOrganizationPickerFieldExtension />
        <GSYamlValuesEditorFieldExtension />
        <GSYamlValuesValidationFieldExtension />
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
    <Route path="/clusters" element={<GSClustersPage />} />
    <Route path="/deployments" element={<GSDeploymentsPage />} />
    <Route path="/installations" element={<GSInstallationsPage />} />
  </FlatRoutes>
);

// Convert legacy app root to new frontend system features
const legacyAppRoot = convertLegacyAppRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <SignalsDisplay />
    <AppRouter>
      <VisitListener />
      <Root>{routes}</Root>
    </AppRouter>
  </>,
);

// Create app with new frontend system in hybrid mode
// This allows running both legacy and new-style plugins together
const app = createApp({
  features: [
    legacyAppOptions,
    ...legacyAppRoot,
    // Add new NFS plugins here as they are migrated:
    aiChatPlugin,
    fluxPlugin,
    // import('@giantswarm/backstage-plugin-gs/alpha'),
  ],
  bindRoutes({ bind }) {
    bind(catalogPlugin.externalRoutes, {
      createComponent: scaffolderPlugin.routes.root,
      viewTechDoc: techdocsPlugin.routes.docRoot,
    });
    bind(orgPlugin.externalRoutes, {
      catalogIndex: catalogPlugin.routes.catalogIndex,
    });
    bind(gsPlugin.externalRoutes, {
      fluxOverview: fluxPlugin.routes.overview,
      fluxResources: fluxPlugin.routes.root,
    });
  },
});

// The app.createRoot() returns a React element that can be rendered directly
export default app.createRoot();
