import {
  compatWrapper,
  convertLegacyRouteRef,
} from '@backstage/core-compat-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import {
  EntityGithubActionsContent,
  githubActionsPlugin,
  isGithubActionsAvailable,
} from '@backstage-community/plugin-github-actions';
import { GithubConnectionGate } from './GithubConnectionGate';

/**
 * The community plugin's "GitHub Actions" entity tab, behind the connect
 * step: same path, title, filter and route ref, so nothing else changes.
 */
export const GithubActionsEntityContentOverride = EntityContentBlueprint.make({
  params: {
    path: 'github-actions',
    title: 'GitHub Actions',
    filter: isGithubActionsAvailable,
    routeRef: convertLegacyRouteRef(githubActionsPlugin.routes.entityContent),
    loader: async () =>
      compatWrapper(
        <GithubConnectionGate>
          <EntityGithubActionsContent />
        </GithubConnectionGate>,
      ),
  },
});
