import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { IndexPage } from './IndexPage';
import { DependenciesEntityContent } from './DependenciesEntityContent';
import { GraphEntityContent } from './GraphEntityContent';
import {
  CircleCIEntityContent,
  GitHubPullRequestsEntityContent,
  GrafanaDashboardsEntityCard,
} from './legacyEntityExtensions';
import { EntityPresentationApi } from './EntityPresentationApi';
import { WhoIsOnCallEntityCard } from './WhoIsOnCallEntityCard';
import {
  SubcomponentOfEntityCard,
  SubcomponentsOfEntityCard,
} from './RelationEntityCards';

export const catalogPluginOverrides = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    IndexPage,
    EntityPresentationApi,
    GitHubPullRequestsEntityContent,
    CircleCIEntityContent,
    DependenciesEntityContent,
    GraphEntityContent,
    GrafanaDashboardsEntityCard,
    WhoIsOnCallEntityCard,
    SubcomponentOfEntityCard,
    SubcomponentsOfEntityCard,
  ],
});
