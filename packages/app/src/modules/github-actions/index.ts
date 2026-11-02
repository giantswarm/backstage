import { createFrontendModule } from '@backstage/frontend-plugin-api';
import {
  GithubActionsEntityContent,
  GithubActionsRecentRunsEntityCard,
} from './GithubActionsOverrides';

export const githubActionsPluginOverrides = createFrontendModule({
  pluginId: 'github-actions',
  extensions: [GithubActionsEntityContent, GithubActionsRecentRunsEntityCard],
});
