import { Route } from 'react-router-dom';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
} from '@backstage/plugin-catalog';
import { SignalsDisplay } from '@backstage/plugin-signals';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
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
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { Root } from './components/Root';
import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/frontend-defaults';
import { convertLegacyAppRoot } from '@backstage/core-compat-api';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';

import { HomepageCompositionRoot, VisitListener } from '@backstage/plugin-home';
import { HomePage } from './components/home/HomePage';

import gsPlugin, {
  GSCustomCatalogPage,
  GSProviderSettings,
} from '@giantswarm/backstage-plugin-gs';
import fluxPlugin from '@giantswarm/backstage-plugin-flux';
import aiChatPlugin from '@giantswarm/backstage-plugin-ai-chat';
import { fluxPluginOverrides } from './flux';
import {
  catalogApiOverrides,
  scaffolderApiOverrides,
  apiDocsApiOverrides,
  kubernetesApiOverrides,
  aiChatApiOverrides,
} from './apiOverrides';
import { scaffolderPluginOverrides } from './scaffolder';
import { appOverrides } from './appModules';

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
    ...legacyAppRoot,
    // NFS plugins:
    aiChatPlugin,
    fluxPlugin,
    fluxPluginOverrides,
    gsPlugin,
    scaffolderPlugin,
    scaffolderPluginOverrides,
    // App-level overrides (core APIs, icons, sign-in page, feature flags):
    appOverrides,
    // API overrides for upstream NFS plugins (custom GS implementations):
    catalogApiOverrides,
    scaffolderApiOverrides,
    apiDocsApiOverrides,
    kubernetesApiOverrides,
    aiChatApiOverrides,
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
