/**
 * NFS entity extensions for third-party plugins that don't provide
 * their own EntityContentBlueprint / EntityCardBlueprint extensions.
 *
 * These are converted from legacy components using helpers from
 * @backstage/plugin-catalog-react/alpha.
 */
import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import {
  convertLegacyEntityContentExtension,
  convertLegacyEntityCardExtension,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  EntityCircleCIContent,
  isCircleCIAvailable,
} from '@backstage/plugin-circleci';
import {
  EntityGithubPullRequestsContent,
  githubPullRequestsPlugin,
} from '@roadiehq/backstage-plugin-github-pull-requests';
import {
  EntityGrafanaDashboardsCard,
  isDashboardSelectorAvailable,
} from '@backstage-community/plugin-grafana';
import { hasGithubLogin } from '../auth/hasGithubLogin';

/**
 * The Pull Requests tab on Components. It reads GitHub as the signed-in
 * person, so on a portal without a GitHub login (`hasGithubLogin`) its filter
 * matches no entity and the tab is not offered, instead of opening a login
 * dialog that cannot succeed.
 *
 * Built with `EntityContentBlueprint` directly instead of
 * `convertLegacyEntityContentExtension`, whose filter is fixed before the
 * APIs exist; the route ref and loader are the converter's.
 */
export const GitHubPullRequestsEntityContent =
  EntityContentBlueprint.makeWithOverrides({
    name: 'pull-requests',
    factory: (originalFactory, { apis }) =>
      originalFactory({
        filter: hasGithubLogin(apis) ? 'kind:component' : () => false,
        path: '/pull-requests',
        title: 'Pull Requests',
        routeRef: convertLegacyRouteRef(
          githubPullRequestsPlugin.routes.entityContent,
        ),
        loader: async () => compatWrapper(<EntityGithubPullRequestsContent />),
      }),
  });

export const CircleCIEntityContent = convertLegacyEntityContentExtension(
  EntityCircleCIContent,
  {
    name: 'circleci',
    filter: entity => isCircleCIAvailable(entity),
    path: '/circleci',
    title: 'CircleCI',
  },
);

export const GrafanaDashboardsEntityCard = convertLegacyEntityCardExtension(
  EntityGrafanaDashboardsCard,
  {
    name: 'grafana-dashboards',
    filter: entity => Boolean(isDashboardSelectorAvailable(entity)),
  },
);
