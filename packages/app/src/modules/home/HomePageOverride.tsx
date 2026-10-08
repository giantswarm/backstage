import { PageBlueprint } from '@backstage/frontend-plugin-api';
import homePlugin from '@backstage/plugin-home/alpha';
import { agentShellOff } from '../agentShell/predicates';

export const HomePageOverride = PageBlueprint.makeWithOverrides({
  if: agentShellOff,
  factory(originalFactory) {
    return originalFactory({
      noHeader: true,
      routeRef: homePlugin.routes.root,
      path: '/',
      loader: async () => {
        const { RootPage } = await import('./RootPage');

        return <RootPage />;
      },
    });
  },
});
