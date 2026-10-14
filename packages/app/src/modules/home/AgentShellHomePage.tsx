import type { ComponentType } from 'react';
import { PageBlueprint, useRouteRef } from '@backstage/frontend-plugin-api';
import homePlugin from '@backstage/plugin-home/alpha';
import type { AgentPlatformHomeProps } from '@giantswarm/backstage-plugin-agent-platform';
import { agentShellOn } from '../agentShell/predicates';
import { customizeRouteRef } from '../agentShell/routes';

function ShellHome({ Home }: { Home: ComponentType<AgentPlatformHomeProps> }) {
  const customizeLink = useRouteRef(customizeRouteRef);
  const customizeHref = customizeLink?.();
  return (
    <Home
      manageAgentsHref={customizeHref ? `${customizeHref}/agents` : undefined}
    />
  );
}

/**
 * `/` under the Agent Platform shell: the new-session screen. Bound to the home
 * plugin's root route, as `HomePageOverride` is, so links to that route
 * resolve in both shells. Ignores `app.rootRedirect`.
 */
export const AgentShellHomePage = PageBlueprint.make({
  name: 'agent-shell',
  if: agentShellOn,
  params: {
    noHeader: true,
    routeRef: homePlugin.routes.root,
    path: '/',
    loader: async () => {
      const { AgentPlatformHome } =
        await import('@giantswarm/backstage-plugin-agent-platform');

      return <ShellHome Home={AgentPlatformHome} />;
    },
  },
});
