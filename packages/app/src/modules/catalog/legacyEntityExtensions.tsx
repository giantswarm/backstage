/**
 * NFS entity extensions for third-party plugins that don't provide
 * their own EntityContentBlueprint / EntityCardBlueprint extensions.
 *
 * These are converted from legacy components using helpers from
 * @backstage/plugin-catalog-react/alpha.
 */
import { compatWrapper } from '@backstage/core-compat-api';
import {
  convertLegacyEntityContentExtension,
  EntityCardBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  EntityCircleCIContent,
  isCircleCIAvailable,
} from '@backstage/plugin-circleci';
import { EntityGithubPullRequestsContent } from '@roadiehq/backstage-plugin-github-pull-requests';
import {
  EntityGrafanaDashboardsCard,
  isDashboardSelectorAvailable,
} from '@backstage-community/plugin-grafana';

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

/**
 * The Grafana dashboards card, disabled by default.
 *
 * The card reads Grafana through the portal's `/grafana/api` proxy endpoint,
 * which only a portal that wires the plugin (a service-account token for its
 * Grafana host) carries. The `grafana` config section itself is required by
 * the plugin's schema on every portal, so its presence cannot be the switch,
 * and the entities carrying `grafana/dashboard-selector` are shared through
 * the catalog by every portal, so neither can the annotation. A portal that
 * wires the plugin enables the card through `app.extensions`
 * (`entity-card:catalog/grafana-dashboards: true`, see docs/configuration.md);
 * everywhere else the annotated entities show neither the card nor its fetch
 * error.
 *
 * Built with `EntityCardBlueprint` directly instead of
 * `convertLegacyEntityCardExtension`, which has no `disabled` option; the
 * loader is the converter's `compatWrapper` of the legacy component.
 */
export const GrafanaDashboardsEntityCard = EntityCardBlueprint.make({
  name: 'grafana-dashboards',
  disabled: true,
  params: {
    filter: entity => Boolean(isDashboardSelectorAvailable(entity)),
    loader: async () => compatWrapper(<EntityGrafanaDashboardsCard />),
  },
});
