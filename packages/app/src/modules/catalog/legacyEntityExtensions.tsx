/**
 * NFS entity extensions for third-party plugins that don't provide
 * their own EntityContentBlueprint / EntityCardBlueprint extensions.
 *
 * These are converted from legacy components using helpers from
 * @backstage/plugin-catalog-react/alpha.
 */
import {
  convertLegacyEntityContentExtension,
  convertLegacyEntityCardExtension,
} from '@backstage/plugin-catalog-react/alpha';
import {
  EntityCircleCIContent,
  isCircleCIAvailable,
} from '@backstage/plugin-circleci';
import { EntityGithubPullRequestsContent } from '@roadiehq/backstage-plugin-github-pull-requests';
import {
  EntityGrafanaDashboardsCard,
  isDashboardSelectorAvailable,
} from '@k-phoen/backstage-plugin-grafana';

export const GitHubPullRequestsEntityContent =
  convertLegacyEntityContentExtension(EntityGithubPullRequestsContent, {
    name: 'pull-requests',
    filter: 'kind:component',
    path: '/pull-requests',
    title: 'Pull Requests',
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
