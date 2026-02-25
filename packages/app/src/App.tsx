import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { SignalsDisplay } from '@backstage/plugin-signals';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { orgPlugin } from '@backstage/plugin-org';
import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import homePlugin from '@backstage/plugin-home/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import catalogGraphPlugin from '@backstage/plugin-catalog-graph/alpha';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import apiDocsPlugin from '@backstage/plugin-api-docs/alpha';
import { Root } from './components/Root';
import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/frontend-defaults';
import { convertLegacyAppRoot } from '@backstage/core-compat-api';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';

import gsPlugin from '@giantswarm/backstage-plugin-gs';
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
import {
  homePageOverrides,
  catalogPageOverrides,
  searchPageOverrides,
  userSettingsPageOverrides,
} from './routeOverrides';

// Convert legacy app root to new frontend system features
const legacyAppRoot = convertLegacyAppRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <SignalsDisplay />
    <AppRouter>
      <Root>
        {/* Empty FlatRoutes required by convertLegacyAppRoot — all pages
            are now provided by NFS PageBlueprint overrides in routeOverrides.tsx */}
        <FlatRoutes>{null}</FlatRoutes>
      </Root>
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
    // Upstream NFS plugins (pages provided by routeOverrides or defaults):
    homePlugin,
    catalogPlugin,
    searchPlugin,
    userSettingsPlugin,
    techdocsPlugin,
    catalogGraphPlugin,
    kubernetesPlugin,
    apiDocsPlugin,
    // App-level overrides (core APIs, icons, sign-in page, feature flags):
    appOverrides,
    // API overrides for upstream NFS plugins (custom GS implementations):
    catalogApiOverrides,
    scaffolderApiOverrides,
    apiDocsApiOverrides,
    kubernetesApiOverrides,
    aiChatApiOverrides,
    // Page overrides for upstream NFS plugins:
    homePageOverrides,
    catalogPageOverrides,
    searchPageOverrides,
    userSettingsPageOverrides,
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
