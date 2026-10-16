import {
  coreExtensionData,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { agentShellOn } from './predicates';
import { customizeRouteRef } from './routes';

/**
 * The shell's Customize page (`/customize`, `page:app/agent-shell-customize`),
 * the parent of the plugins' tabs below their lists: agent-platform's Agents,
 * Skills and Models and muster's Connectors and Workflows attach their
 * sub-pages to its `pages` input by this id, the way upstream's
 * `catalog-unprocessed-entities` attaches to `page:devtools`. The page routes
 * each tab's bare path to its own list screen and everything deeper to the
 * sub-page's router, whose route refs resolve under `/customize/<tab>`.
 */
export const agentShellCustomizePage = PageBlueprint.makeWithOverrides({
  name: 'agent-shell-customize',
  if: agentShellOn,
  factory(originalFactory, { inputs }) {
    const pages = inputs.pages.map(page => ({
      path: page.get(coreExtensionData.routePath),
      element: page.get(coreExtensionData.reactElement),
    }));
    return originalFactory({
      noHeader: true,
      // eslint-disable-next-line giantswarm/no-restricted-syntax -- the Customize page's route definition
      path: '/customize',
      routeRef: customizeRouteRef,
      loader: async () => {
        const { CustomizePage } = await import('./CustomizePage');

        return <CustomizePage pages={pages} />;
      },
    });
  },
});
