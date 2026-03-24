import catalogPlugin from '@backstage/plugin-catalog/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { orgPlugin } from '@backstage/plugin-org';
import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import homePlugin from '@backstage/plugin-home/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import catalogGraphPlugin from '@backstage/plugin-catalog-graph/alpha';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import apiDocsPlugin from '@backstage/plugin-api-docs/alpha';
import signalsPlugin from '@backstage/plugin-signals/alpha';
import githubActionsPlugin from '@backstage-community/plugin-github-actions/alpha';
import { createApp } from '@backstage/frontend-defaults';

import gsPlugin from '@giantswarm/backstage-plugin-gs';
import fluxPlugin from '@giantswarm/backstage-plugin-flux';
import aiChatPlugin from '@giantswarm/backstage-plugin-ai-chat';
import { fluxPluginOverrides } from './flux';
import { catalogApiOverrides, apiDocsApiOverrides } from './apiOverrides';
import { scaffolderPluginOverrides } from './modules/scaffolder';
import { appOverrides } from './appModules';
import {
  circleCINfsPlugin,
  githubPullRequestsNfsPlugin,
} from './legacyPlugins';
import { navModule } from './modules/nav';
import { homePluginOverrides } from './modules/home';
import { userSettingsPluginOverrides } from './modules/userSettings';
import { aiChatPluginOverrides } from './modules/ai-chat';
import { kubernetesPluginOverrides } from './modules/kubernetes';
import { catalogPageOverrides } from './routeOverrides';

const app = createApp({
  features: [
    // NFS plugins:
    aiChatPlugin,
    aiChatPluginOverrides,
    fluxPlugin,
    fluxPluginOverrides,
    gsPlugin,
    scaffolderPlugin,
    scaffolderPluginOverrides,
    signalsPlugin,
    // Upstream NFS plugins (pages provided by routeOverrides or defaults):
    homePlugin,
    homePluginOverrides,
    catalogPlugin,
    searchPlugin,
    userSettingsPlugin,
    userSettingsPluginOverrides,
    techdocsPlugin,
    catalogGraphPlugin,
    kubernetesPlugin,
    kubernetesPluginOverrides,
    apiDocsPlugin,
    githubActionsPlugin,
    // Legacy plugins converted for NFS route ref discovery:
    circleCINfsPlugin,
    githubPullRequestsNfsPlugin,
    // App-level overrides (core APIs, icons, sign-in page, feature flags):
    appOverrides,
    // Nav sidebar layout:
    navModule,
    // API overrides for upstream NFS plugins (custom GS implementations):
    catalogApiOverrides,
    apiDocsApiOverrides,
    // Page overrides for upstream NFS plugins:
    catalogPageOverrides,
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

export default app.createRoot();
