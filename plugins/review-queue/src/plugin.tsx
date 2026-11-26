import {
  createExtension,
  createFrontendPlugin,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import { fixtureMcpServersDataRef } from '@giantswarm/backstage-plugin-muster';
import { FIXTURE_MCP_SERVERS } from '@giantswarm/backstage-plugin-gs-common';

import { rootRouteRef } from './routes';

// Hive's Reviews tab (`/hive/reviews`): a sub-page attached to the plans
// plugin's Hive page by node id, as the roadmap plugin attaches its Roadmap
// tab. Hive is disabled by default (internal only); this tab follows its
// page, so it shows wherever Hive is on and nowhere else. Its place in Hive's
// row is `HIVE_TAB_ORDER` (plans' `lib/hiveTabs.ts`).
const hiveReviewsSubPage = SubPageBlueprint.make({
  name: 'hive',
  attachTo: { id: 'page:plans', input: 'pages' },
  params: {
    path: 'reviews',
    title: 'Reviews',
    routeRef: rootRouteRef,
    loader: async () => {
      const [{ ReviewsProviders }, { ReviewsTab }, { Content }] =
        await Promise.all([
          import('./components/ReviewsProviders'),
          import('./components/ReviewsTab'),
          import('@backstage/core-components'),
        ]);
      return (
        <ReviewsProviders>
          <Content>
            <ReviewsTab />
          </Content>
        </ReviewsProviders>
      );
    },
  },
});

// The `github` server's tools in fixture mode, outside production builds
// only: the loader, and the handler chunk with it, is dropped from a
// production build (docs/fixtures.md, "Tool calls through muster").
const fixtureMcpServers = createExtension({
  kind: 'muster-fixture-servers',
  attachTo: FIXTURE_MCP_SERVERS.attachTo,
  output: [fixtureMcpServersDataRef],
  factory: () => [
    fixtureMcpServersDataRef(async () => {
      if (process.env.NODE_ENV !== 'production') {
        const { reviewQueueFixtureMcpServers } =
          await import('./apis/fixtures/mcpServers');
        return reviewQueueFixtureMcpServers;
      }
      return [];
    }),
  ],
});

export const reviewQueuePlugin = createFrontendPlugin({
  pluginId: 'review-queue',
  extensions: [hiveReviewsSubPage, fixtureMcpServers],
  routes: {
    root: rootRouteRef,
  },
});
