import type {
  ApiHolder,
  ExtensionDefinition,
} from '@backstage/frontend-plugin-api';
import githubActionsPlugin from '@backstage-community/plugin-github-actions/alpha';
import { hasGithubLogin } from '../auth/hasGithubLogin';

/**
 * The override of a GitHub Actions view's params: none with a GitHub login
 * (the plugin's own filter stays), else a filter that matches no entity.
 */
function githubLoginParams(apis: ApiHolder) {
  return hasGithubLogin(apis) ? undefined : { params: { filter: () => false } };
}

/**
 * The GitHub Actions tab and its recent-runs card (enabled by the plugin
 * unless `app.extensions` turns it off) read GitHub as the signed-in person.
 * On a portal without a GitHub login (`hasGithubLogin`) they are not
 * offered, instead of opening a login dialog that cannot succeed.
 *
 * Typed as a plain ExtensionDefinition: the inferred type names the plugin's
 * own nested @backstage packages, which this module cannot reference.
 */
export const GithubActionsEntityContent: ExtensionDefinition =
  githubActionsPlugin.getExtension('entity-content:github-actions').override({
    factory: (originalFactory, { apis }) =>
      originalFactory(githubLoginParams(apis)),
  });

export const GithubActionsRecentRunsEntityCard: ExtensionDefinition =
  githubActionsPlugin
    .getExtension('entity-card:github-actions/recent-workflow-runs')
    .override({
      factory: (originalFactory, { apis }) =>
        originalFactory(githubLoginParams(apis)),
    });
