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
  deploymentDetailsExternalRouteRef,
  gpuCapacityRouteRef,
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
  usageRouteRef,
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
// Declared after the Agents tab because tab order follows the `extensions` array.
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

// The "Usage" tab: your own agent usage over the backend's window (personal,
// derived from kagent's stored conversations), plus the MCP tool calls on the
// installation (every caller, from muster's Prometheus metrics) contributed by
// the muster plugin through the `sections` input below.
//
// Declared last, so it is the last of this plugin's own tabs. It cannot be the
// last tab in the row: muster's "MCP Servers" tab is attached from another
// plugin and lands after every tab declared here, because the page gathers its
// `pages` input in feature-registration order (see App.tsx). Putting Usage
// after it would mean registering muster first, which moves MCP Servers to the
// front of the row and changes the tab a bare `/agent-platform` lands on.
//
// `makeWithOverrides` + `createExtensionInput` — the same shape as the flux
// list/tree filter inputs — so muster can attach its section by node id
// (`sub-page:agent-platform/usage`, input `sections`) without either plugin
// depending on the other, exactly as it already attaches its "MCP Servers" tab
// to `page:agent-platform`. An empty `sections` (muster not registered) hides
// the "MCP tools" view's tab rather than leaving a hole.
const usageSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'usage',
  inputs: {
    sections: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      path: 'usage',
      title: 'Usage',
      routeRef: usageRouteRef,
      loader: async () => {
        const { UsageRouter } = await import('./components/UsageRouter');
        // Passed as the array rather than wrapped in a fragment: the router
        // has to know whether anything was contributed at all, so it can
        // leave the "MCP tools" tab out of the strip when nothing was.
        const sections = inputs.sections.map(section =>
          section.get(coreExtensionData.reactElement),
        );
        return <UsageRouter sections={sections} />;
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
    usageSubPage,
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
    usage: usageRouteRef,
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
