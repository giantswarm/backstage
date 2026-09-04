import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { GithubActionsApiOverride, GithubActionsConnectionApi } from './apis';
import { GithubActionsEntityContentOverride } from './EntityContentOverride';

/**
 * The GitHub Actions tab as the signed-in person through muster: the plugin's
 * API replaced by the github-actions backend client, plus the "Connect
 * GitHub" step in front of the tab.
 */
export const githubActionsPluginOverrides = createFrontendModule({
  pluginId: 'github-actions',
  extensions: [
    GithubActionsApiOverride,
    GithubActionsConnectionApi,
    GithubActionsEntityContentOverride,
  ],
});
