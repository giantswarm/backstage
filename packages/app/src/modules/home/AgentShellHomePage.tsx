import type { ComponentType } from 'react';
import { PageBlueprint, useRouteRef } from '@backstage/frontend-plugin-api';
import type { AgentPlatformHomeProps } from '@giantswarm/backstage-plugin-agent-platform';
import { agentShellOn } from '../agentShell/predicates';
import { customizeRouteRef, homeRouteRef } from '../agentShell/routes';

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
 * `/` under the Agent Platform shell: the new-session screen. Bound to the
 * shell's `homeRouteRef`, the home plugin's root route, as `HomePageOverride`
 * is, so links to that route resolve in both shells. Ignores
 * `app.rootRedirect`.
 */
export const AgentShellHomePage = PageBlueprint.make({
  name: 'agent-shell',
  if: agentShellOn,
  params: {
    noHeader: true,
    routeRef: homeRouteRef,
    path: '/',
    loader: async () => {
      const { AgentPlatformHome } =
        await import('@giantswarm/backstage-plugin-agent-platform');

      return <ShellHome Home={AgentPlatformHome} />;
    },
  },
});
