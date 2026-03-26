import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { IndexPage } from './IndexPage';
import { DependenciesEntityContent } from './DependenciesEntityContent';
import {
  CircleCIEntityContent,
  GitHubPullRequestsEntityContent,
  GrafanaDashboardsEntityCard,
} from './legacyEntityExtensions';
import { EntityPresentationApi } from './EntityPresentationApi';

export const catalogPluginOverrides = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    IndexPage,
    EntityPresentationApi,
    GitHubPullRequestsEntityContent,
    CircleCIEntityContent,
    DependenciesEntityContent,
    GrafanaDashboardsEntityCard,
  ],
});
