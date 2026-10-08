import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { agentShellOn } from './predicates';
import { customizeRouteRef } from './routes';

export const agentShellCustomizePage = PageBlueprint.make({
  name: 'agent-shell-customize',
  if: agentShellOn,
  params: {
    noHeader: true,
    path: '/customize',
    routeRef: customizeRouteRef,
    loader: async () => {
      const { CustomizePage } = await import('./CustomizePage');

      return <CustomizePage />;
    },
  },
});
