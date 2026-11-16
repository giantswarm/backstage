import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { platformSectionOn } from './platformSection';
import { platformRouteRef } from './routes';

/**
 * The shell's Platform section (`/platform`, `page:app/agent-shell-platform`):
 * the clusters the portal reads, one routed tab per area. Mounted only where
 * the shell is available and the deployment turned the section on
 * (`gs.features.platformSection.enabled`); elsewhere neither the route nor
 * the rail item exists.
 */
export const agentShellPlatformPage = PageBlueprint.make({
  name: 'agent-shell-platform',
  if: platformSectionOn,
  params: {
    noHeader: true,
    // eslint-disable-next-line giantswarm/no-restricted-syntax -- the Platform page's route definition
    path: '/platform',
    routeRef: platformRouteRef,
    loader: async () => {
      const { PlatformPage } = await import('./PlatformPage');
      return <PlatformPage />;
    },
  },
});
