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
import { isHiveTab, orderHiveTabs } from './lib/hiveTabs';
import {
  epicRouteRef,
  hiveEpicsRouteRef,
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
// Deployments opt in via app-config `app.extensions` (`page:plans/hive`,
// `api:plans`, and the redirects `page:plans`, `page:plans/magazine`).

// Hive (`/hive`): the team's work in one section, the Agent Platform pattern:
// the bui PluginHeader with routed tabs Now · Board · History · Knowledge.
// The Board tab is the roadmap plugin's, attached by node id
// (`sub-page:roadmap/hive`); `HIVE_TAB_ORDER` puts it in its place. The
// epic pages (`/hive/epics/:id`) and the plans (`/hive/plans`) are routes
// without a tab, so Hive draws its frame itself (`HiveShell`).
const hivePage = PageBlueprint.makeWithOverrides({
  name: 'hive',
  disabled: true,
  factory(originalFactory, { inputs }) {
    const routes = orderHiveTabs(inputs.pages, page => page.node.spec.id).map(
      page => ({
        path: page.get(coreExtensionData.routePath),
        title: page.get(coreExtensionData.title),
        element: page.get(coreExtensionData.reactElement),
        tab: isHiveTab(page.node.spec.id),
      }),
    );
    return originalFactory({
      title: 'Hive',
      icon: <EmojiNatureIcon />,
      path: '/hive',
      routeRef: hiveRouteRef,
      noHeader: true,
      loader: async () => {
        const { HiveShell } = await import('./components/HiveShell');
        return (
          <HiveShell title="Hive" icon={<EmojiNatureIcon />} routes={routes} />
        );
      },
    });
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
  attachTo: { id: 'page:plans/hive', input: 'pages' },
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
  attachTo: { id: 'page:plans/hive', input: 'pages' },
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

// One epic's page (`/hive/epics/:id`): its overview, plan review, history
// and sub-issues. A route, not a tab: Now, the board and History open it.
const hiveEpicsSubPage = SubPageBlueprint.make({
  name: 'hive-epics',
  attachTo: { id: 'page:plans/hive', input: 'pages' },
  params: {
    path: 'epics',
    title: 'Epics',
    routeRef: hiveEpicsRouteRef,
    loader: async () => {
      const { PlansProviders } = await import('./components/PlansProviders');
      const { HiveEpicsRouter } = await import('./components/HiveEpicPage');
      return (
        <PlansProviders>
          <HiveEpicsRouter />
        </PlansProviders>
      );
    },
  },
});

// The plans, proposed and merged, and the review page of a plan without an
// epic (a plan with one is reviewed on its epic's Plan tab). A route, not a
// tab. It owns `rootRouteRef`, so a plan review link (`pullRouteRef`)
// opens inside Hive.
const hivePlansSubPage = SubPageBlueprint.make({
  name: 'hive-plans',
  attachTo: { id: 'page:plans/hive', input: 'pages' },
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
// `/plans/pr/:n` → its epic's Plan tab (or `/hive/plans/pr/:n` without an
// epic), `/plans` → `/hive/plans`, `/product?tab=x` → `/hive/x`.
const plansPage = PageBlueprint.make({
  disabled: true,
  params: {
    path: '/plans',
    routeRef: legacyPlansRouteRef,
    noHeader: true,
    loader: async () => {
      const { PlansProviders } = await import('./components/PlansProviders');
      const { PlansRedirect } = await import('./components/HiveRedirect');
      return (
        <PlansProviders>
          <PlansRedirect />
        </PlansProviders>
      );
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
    hiveEpicsSubPage,
    hivePlansSubPage,
    hiveKnowledgeSubPage,
    hiveHeaderAction,
    plansPage,
    magazinePage,
    plansApi,
  ],
  routes: {
    root: rootRouteRef,
    pull: pullRouteRef,
    hive: hiveRouteRef,
    epic: epicRouteRef,
    magazine: magazineRouteRef,
  },
  externalRoutes: {
    roadmapItem: roadmapItemExternalRouteRef,
  },
});
