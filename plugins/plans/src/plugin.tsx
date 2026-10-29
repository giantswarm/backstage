import { ReactNode } from 'react';
import {
  ApiBlueprint,
  configApiRef,
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
  hiveHistoryRouteRef,
  hiveKnowledgeRouteRef,
  hiveNowRouteRef,
  hiveRouteRef,
  legacyPlansRouteRef,
  magazineRouteRef,
  pullRouteRef,
  roadmapItemExternalRouteRef,
  rootRouteRef,
} from './routes';

// Every Hive extension is disabled by default, like the pages it replaces:
// Hive serves internal planning and must not appear in customer portals.
// Deployments opt in via app-config `app.extensions`: `page:plans` (Hive,
// the id the Plans page had, so a portal that showed Plans shows Hive),
// `api:plans`, and the redirects `page:plans/plans-redirect` and
// `page:plans/magazine`.

// Hive (`/hive`): the team's work in one section, the Agent Platform pattern.
// With no loader of its own, PageBlueprint renders the attached sub-pages as
// routed tabs in the bui PluginHeader: Now · History · Roadmap · Plans ·
// Knowledge. The Roadmap tab is the roadmap plugin's, attached by node id
// (`sub-page:roadmap/hive`); `HIVE_TAB_ORDER` puts it in its place.
const hivePage = PageBlueprint.makeWithOverrides({
  disabled: true,
  factory(originalFactory, { inputs }) {
    return originalFactory(
      {
        title: 'Hive',
        icon: <EmojiNatureIcon />,
        path: '/hive',
        routeRef: hiveRouteRef,
      },
      {
        inputs: {
          pages: orderHiveTabs(inputs.pages, page => page.node.spec.id),
        },
      },
    );
  },
});

/** A Hive tab's content: the plugin's query cache and the page padding. */
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

const hiveNowSubPage = SubPageBlueprint.make({
  name: 'hive-now',
  attachTo: { id: 'page:plans', input: 'pages' },
  params: {
    path: 'now',
    title: 'Now',
    routeRef: hiveNowRouteRef,
    loader: hiveTab(async () => {
      const { HiveNowTab } = await import('./components/HiveNowTab');
      return <HiveNowTab />;
    }),
  },
});

const hiveHistorySubPage = SubPageBlueprint.make({
  name: 'hive-history',
  attachTo: { id: 'page:plans', input: 'pages' },
  params: {
    path: 'history',
    title: 'History',
    routeRef: hiveHistoryRouteRef,
    loader: hiveTab(async () => {
      const { HiveHistoryTab } = await import('./components/HiveHistoryTab');
      return <HiveHistoryTab />;
    }),
  },
});

// The plans, proposed and merged, and a plan's review page: the Plans page
// moved in. It owns `rootRouteRef`, so a plan review link (`pullRouteRef`,
// the roadmap's PlanPanel) opens inside Hive.
const hivePlansSubPage = SubPageBlueprint.make({
  name: 'hive-plans',
  attachTo: { id: 'page:plans', input: 'pages' },
  params: {
    path: 'plans',
    title: 'Plans',
    routeRef: rootRouteRef,
    loader: async () => {
      const { PlansProviders } = await import('./components/PlansProviders');
      const { PlansRouter } = await import('./components/PlansRouter');
      return (
        <PlansProviders>
          <PlansRouter />
        </PlansProviders>
      );
    },
  },
});

const hiveKnowledgeSubPage = SubPageBlueprint.make({
  name: 'hive-knowledge',
  attachTo: { id: 'page:plans', input: 'pages' },
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
// `/plans…` → `/hive/plans…`, `/product?tab=x` → `/hive/x`.
const plansRedirectPage = PageBlueprint.make({
  name: 'plans-redirect',
  disabled: true,
  params: {
    path: '/plans',
    routeRef: legacyPlansRouteRef,
    noHeader: true,
    loader: async () => {
      const { HiveRedirect } = await import('./components/HiveRedirect');
      return <HiveRedirect routeRef={rootRouteRef} />;
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
      return <HiveRedirect routeRef={hiveRouteRef} target={magazineTarget} />;
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
    hiveNowSubPage,
    hiveHistorySubPage,
    hivePlansSubPage,
    hiveKnowledgeSubPage,
    hiveHeaderAction,
    plansRedirectPage,
    magazinePage,
    plansApi,
  ],
  routes: {
    root: rootRouteRef,
    pull: pullRouteRef,
    hive: hiveRouteRef,
    magazine: magazineRouteRef,
  },
  externalRoutes: {
    roadmapItem: roadmapItemExternalRouteRef,
  },
});
