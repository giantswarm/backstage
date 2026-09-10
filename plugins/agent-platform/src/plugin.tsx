import {
  ApiBlueprint,
  coreExtensionData,
  createExtensionInput,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
  PluginHeaderActionBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import AndroidIcon from '@material-ui/icons/Android';

import {
  KagentApiClient,
  kagentApiRef,
  ModelManagerApiClient,
  modelManagerApiRef,
} from './apis';
import {
  agentDetailRouteRef,
  agentsRouteRef,
  dashboardsRouteRef,
  deploymentDetailsExternalRouteRef,
  gpuCapacityRouteRef,
  mcpDashboardRouteRef,
  modelConfigsRouteRef,
  modelDetailRouteRef,
  modelsRouteRef,
  musterToolExplorerExternalRouteRef,
  newAgentReviewRouteRef,
  newAgentRouteRef,
  newAgentSkillsRouteRef,
  newAgentToolsRouteRef,
  newModelRouteRef,
  rootRouteRef,
  servingRouteRef,
  sessionDetailRouteRef,
  sessionsRouteRef,
} from './routes';

// The Agent Platform section is a tabbed page: with no loader of its own,
// PageBlueprint renders the attached sub-pages as tabs in the bui PluginHeader
// (the same pattern as the flux/muster sections). The "MCP Servers" tab is
// contributed by the muster plugin (a SubPageBlueprint attached to this page);
// the "Agents" tab is defined below.
//
// Disabled by default and enabled per-installation via app-config
// (`app.extensions: [page:agent-platform, nav-item:agent-platform]`) while the
// agent platform is still internal-only.
const agentPlatformPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Agent Platform',
    icon: <AndroidIcon />,
    path: '/agent-platform',
    routeRef: rootRouteRef,
  },
});

// The "Agents" tab. Its content is the agent list, one agent's details
// (`/agent-platform/agents/<installation>/<namespace>/<name>`) and the create
// flow (`/agent-platform/agents/new`, `.../new/skills`, `.../new/tools` and
// `.../new/review`),
// all driven by an internal react-router in AgentsRouter.
const agentsSubPage = SubPageBlueprint.make({
  name: 'agents',
  params: {
    path: 'agents',
    title: 'Agents',
    routeRef: agentsRouteRef,
    loader: async () => {
      const { AgentsRouter } = await import('./components/AgentsRouter');
      return <AgentsRouter />;
    },
  },
});

// The "Sessions" tab. Read-only list of the signed-in user's kagent chat
// sessions across the fleet, via the agent-platform-backend kagent proxy.
// Declared after the Agents tab to match the row, though the row's order is
// pinned in `app-config.yaml` rather than by this array — see the Dashboards
// tab below.
const sessionsSubPage = SubPageBlueprint.make({
  name: 'sessions',
  params: {
    path: 'sessions',
    title: 'Sessions',
    routeRef: sessionsRouteRef,
    loader: async () => {
      const { SessionsRouter } = await import('./components/SessionsRouter');
      return <SessionsRouter />;
    },
  },
});

// The "Dashboards" tab: the section's one place for metrics and signals about
// the platform, as a second-level tab row — one dashboard per domain, so a
// reader always knows whose numbers over what scope they are looking at:
//
//   * "Agents" — agent-session usage over the backend's window, derived from
//     kagent's stored conversations. This plugin's own.
//   * "MCP" — the muster aggregator behind the platform: inventory, health,
//     capability surface and the tool calls dispatched through it. Contributed
//     whole by the muster plugin through the `mcpDashboard` input below, so the
//     tab is simply absent on a portal without muster.
//
// **Last in the row, after muster's "MCP Servers" tab** — and that placement
// does not come from here. The page gathers its `pages` input in
// feature-registration order, and muster's tab is attached from another plugin,
// so it lands after every tab declared in this array; registering muster first
// would only move MCP Servers to the *front* (and change the tab a bare
// `/agent-platform` lands on). The row is therefore pinned explicitly in
// `app-config.yaml`'s `app.extensions`, whose order wins over registration
// order. `packages/app/src/agentPlatformTabOrder.test.tsx` asserts that list,
// because dropping those config entries silently reorders the row.
//
// `makeWithOverrides` + `createExtensionInput` — the same shape as the flux
// list/tree filter inputs — so muster can attach its dashboard by node id
// (`sub-page:agent-platform/dashboards`, input `mcpDashboard`), exactly as it
// already attaches its "MCP Servers" tab to `page:agent-platform`. The
// direction that matters: **muster does not depend on agent-platform** (this
// package does depend on muster, for `MCPServer` and the tool pickers), so the
// attacher stays installable on its own and this tab's bundle is only pulled in
// where muster is registered.
//
// **The tab's path, title and route ref live here, not in muster**, even though
// its content does not: the *route ref* has to resolve for the two muster
// redirects that point at it whether or not muster is registered, and the tab
// strip has to know the label before the content loads. With an empty input
// there is no MCP tab and no mounted `mcp` route — a deep link falls through to
// the Agents dashboard rather than leaving a hole.
const dashboardsSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'dashboards',
  inputs: {
    mcpDashboard: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      path: 'dashboards',
      title: 'Dashboards',
      routeRef: dashboardsRouteRef,
      loader: async () => {
        const { DashboardsRouter } =
          await import('./components/DashboardsRouter');
        // At most one contributor, so the first element is the dashboard. A
        // list is what `createExtensionInput` gives; taking `[0]` rather than
        // rendering all of them keeps the tab one view, which is what the tab
        // strip and the route promise.
        const mcpDashboard = inputs.mcpDashboard
          .at(0)
          ?.get(coreExtensionData.reactElement);
        return <DashboardsRouter mcpDashboard={mcpDashboard} />;
      },
    });
  },
});

// The "Models" tab: the kagent ModelConfigs agents run on — list, create,
// edit, delete — and the serving layer beneath them, as a second-level tab row
// (Model configs, Serving, GPU capacity) driven by ModelsRouter. A
// platform-admin capability, placed after the tabs everyone uses.
const modelsSubPage = SubPageBlueprint.make({
  name: 'models',
  params: {
    path: 'models',
    title: 'Models',
    routeRef: modelsRouteRef,
    loader: async () => {
      const { ModelsRouter } = await import('./components/ModelsRouter');
      return <ModelsRouter />;
    },
  },
});

// The section's installation scope selector, in the page header next to the
// tabs' own actions: "All installations" (home first) or
// one pinned installation, for the three tabs above and the muster plugin's
// "MCP Servers" tab alike. A header action rather than part of a tab, so it
// stays put while the tabs change underneath it; the scope itself lives in the
// gs plugin (`useInstallationScope`), URL `?installation=` plus localStorage.
// Renders nothing on a portal that knows one installation.
const installationScopeHeaderAction = PluginHeaderActionBlueprint.make({
  name: 'installation-scope',
  params: {
    loader: async () => {
      const { InstallationScopeHeaderControl } =
        await import('./components/InstallationScopeHeaderControl');
      return <InstallationScopeHeaderControl />;
    },
  },
});

// Client for the kagent REST API, via the agent-platform-backend proxy. The
// kubernetes APIs are dependencies because each installation's Dex ID token is
// minted through them (kubernetesApi.getCluster →
// kubernetesAuthProvidersApi.getCredentials), the same way the agent deploy flow
// mints its scaffolder secret.
const kagentApi = ApiBlueprint.make({
  name: 'kagent',
  params: defineParams =>
    defineParams({
      api: kagentApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        kubernetesApi: kubernetesApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: deps => new KagentApiClient(deps),
    }),
});

// Client for the model-manager REST API (the Models tab's Serving view on
// installations that deploy it), via the same backend proxy. Same
// dependencies as the kagent client, for the same reason: the per-installation
// Dex ID token is minted through the kubernetes APIs.
const modelManagerApi = ApiBlueprint.make({
  name: 'model-manager',
  params: defineParams =>
    defineParams({
      api: modelManagerApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        kubernetesApi: kubernetesApiRef,
        kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
      },
      factory: deps => new ModelManagerApiClient(deps),
    }),
});

export const agentPlatformPlugin = createFrontendPlugin({
  pluginId: 'agent-platform',
  extensions: [
    agentPlatformPage,
    agentsSubPage,
    sessionsSubPage,
    modelsSubPage,
    dashboardsSubPage,
    installationScopeHeaderAction,
    kagentApi,
    modelManagerApi,
  ],
  routes: {
    root: rootRouteRef,
    agents: agentsRouteRef,
    agentDetail: agentDetailRouteRef,
    newAgent: newAgentRouteRef,
    newAgentSkills: newAgentSkillsRouteRef,
    newAgentTools: newAgentToolsRouteRef,
    newAgentReview: newAgentReviewRouteRef,
    sessions: sessionsRouteRef,
    sessionDetail: sessionDetailRouteRef,
    dashboards: dashboardsRouteRef,
    mcpDashboard: mcpDashboardRouteRef,
    models: modelsRouteRef,
    modelConfigs: modelConfigsRouteRef,
    modelDetail: modelDetailRouteRef,
    newModel: newModelRouteRef,
    serving: servingRouteRef,
    gpuCapacity: gpuCapacityRouteRef,
  },
  // Both carry a `defaultTarget`, so they resolve without an app-config binding
  // and are simply unbound when the target plugin is disabled. Every call site
  // must handle `useRouteRef` returning undefined.
  externalRoutes: {
    musterToolExplorer: musterToolExplorerExternalRouteRef,
    deploymentDetails: deploymentDetailsExternalRouteRef,
  },
});
