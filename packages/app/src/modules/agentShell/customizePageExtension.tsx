import {
  coreExtensionData,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { CUSTOMIZE_TAB_IDS } from './customizeTabIds';
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
      id: page.node.spec.id,
      path: page.get(coreExtensionData.routePath),
      element: page.get(coreExtensionData.reactElement),
    }));
    // The page routes a sub-page under the tab its path names; a path that
    // names none (a deployment's `config.path` on one) would leave its links
    // bouncing to a list, so say so instead of dropping it silently.
    const unmatched = pages.filter(
      page => !(CUSTOMIZE_TAB_IDS as readonly string[]).includes(page.path),
    );
    if (unmatched.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `The Customize page has no tab for ${unmatched
          .map(page => `${page.id} (path "${page.path}")`)
          .join(
            ', ',
          )}, so it is not routed. A Customize sub-page's path must be one of: ${CUSTOMIZE_TAB_IDS.join(', ')}.`,
      );
    }
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
