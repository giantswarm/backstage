import { ReactNode } from 'react';
import {
  ApiBlueprint,
  configApiRef,
  coreExtensionData,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
  PluginHeaderActionBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import EmojiNatureIcon from '@material-ui/icons/EmojiNature';

import {
  plansApiRef,
  PlansApiClient,
  plansAuthApiRef,
  PlansFixtureApi,
} from './apis';
import { orderHiveTabs } from './lib/hiveTabs';
import {
  hiveKnowledgeRouteRef,
  legacyPlansRouteRef,
  magazineRouteRef,
  pullRouteRef,
  roadmapItemExternalRouteRef,
  rootRouteRef,
} from './routes';

// Every Hive extension is disabled by default, like the pages it replaces:
// Hive serves internal planning and must not appear in customer portals.
// Deployments opt in via app-config `app.extensions` (`page:plans/hive`,
// `api:plans`, and the redirects `page:plans`, `page:plans/magazine`).

// Hive (`/hive`): the front page, one page read top to bottom for a moment
// in time, with the board and the knowledge reader as secondary tabs. The
// Board tab is the roadmap plugin's, attached by node id
// (`sub-page:roadmap/hive`); `HIVE_TAB_ORDER` puts it in its place. The
// front page is the section's own index, so Hive draws its frame itself
// (`HiveShell`).
const hivePage = PageBlueprint.makeWithOverrides({
  name: 'hive',
  disabled: true,
  factory(originalFactory, { inputs }) {
    const tabs = orderHiveTabs(inputs.pages, page => page.node.spec.id).map(
      page => ({
        path: page.get(coreExtensionData.routePath),
        title: page.get(coreExtensionData.title) ?? '',
        element: page.get(coreExtensionData.reactElement),
      }),
    );
    return originalFactory({
      title: 'Hive',
      icon: <EmojiNatureIcon />,
      path: '/hive',
      routeRef: rootRouteRef,
      noHeader: true,
      loader: async () => {
        const [{ HiveShell }, frontPage] = await Promise.all([
          import('./components/HiveShell'),
          hiveTab(async () => {
            const { HiveFrontPage } =
              await import('./components/HiveFrontPage');
            return <HiveFrontPage />;
          })(),
        ]);
        return (
          <HiveShell
            title="Hive"
            icon={<EmojiNatureIcon />}
            frontPage={frontPage}
            tabs={tabs}
          />
        );
      },
    });
  },
});

/** A Hive view's content: the plugin's query cache and the page padding. */
function hiveTab(load: () => Promise<ReactNode>) {
  return async () => {
    const [{ PlansProviders }, { Content }, content] = await Promise.all([
      import('./components/PlansProviders'),
      import('@backstage/core-components'),
      load(),
    ]);
    return (
      <PlansProviders>
        <Content>{content}</Content>
      </PlansProviders>
    );
  };
}

const hiveKnowledgeSubPage = SubPageBlueprint.make({
  name: 'hive-knowledge',
  attachTo: { id: 'page:plans/hive', input: 'pages' },
  params: {
    path: 'knowledge',
    title: 'Knowledge',
    routeRef: hiveKnowledgeRouteRef,
    loader: hiveTab(async () => {
      const { HiveKnowledgeTab } =
        await import('./components/HiveKnowledgeTab');
      return <HiveKnowledgeTab />;
    }),
  },
});

// The team scope and the search, in the header of every Hive tab.
const hiveHeaderAction = PluginHeaderActionBlueprint.make({
  name: 'hive-scope',
  params: {
    loader: async () => {
      const { HiveHeaderControls } =
        await import('./components/HiveHeaderControls');
      return <HiveHeaderControls />;
    },
  },
});

// The old pages stay as nav-less redirects, so every shared link resolves:
// `/plans` → the front page's Plans section, `/plans/pr/:n` → the review
// over it, `/product?tab=…` → the front page at that moment or Knowledge.
const plansPage = PageBlueprint.make({
  disabled: true,
  params: {
    path: '/plans',
    routeRef: legacyPlansRouteRef,
    noHeader: true,
    loader: async () => {
      const { HiveRedirect, plansTarget } =
        await import('./components/HiveRedirect');
      return <HiveRedirect target={plansTarget} />;
    },
  },
});

const magazinePage = PageBlueprint.make({
  name: 'magazine',
  disabled: true,
  params: {
    path: '/product',
    routeRef: magazineRouteRef,
    noHeader: true,
    loader: async () => {
      const { HiveRedirect, magazineTarget } =
        await import('./components/HiveRedirect');
      return <HiveRedirect target={magazineTarget} />;
    },
  },
});

// No `name`: the extension id is plain `api:plans`. `plans.fixtures: true`
// serves the plans and the magazine from memory, for local development.
const plansApi = ApiBlueprint.make({
  disabled: true,
  params: defineParams =>
    defineParams({
      api: plansApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        authApi: plansAuthApiRef,
      },
      factory: ({ configApi, discoveryApi, fetchApi, authApi }) =>
        configApi.getOptionalBoolean('plans.fixtures')
          ? new PlansFixtureApi()
          : new PlansApiClient({ discoveryApi, fetchApi, authApi }),
    }),
});

export const plansPlugin = createFrontendPlugin({
  pluginId: 'plans',
  extensions: [
    hivePage,
    hiveKnowledgeSubPage,
    hiveHeaderAction,
    plansPage,
    magazinePage,
    plansApi,
  ],
  routes: {
    root: rootRouteRef,
    pull: pullRouteRef,
    magazine: magazineRouteRef,
  },
  externalRoutes: {
    roadmapItem: roadmapItemExternalRouteRef,
  },
});
