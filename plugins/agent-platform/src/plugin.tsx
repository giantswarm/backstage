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
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

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
//
// Wrapped, like the Sessions tab, in the backend's cookie auth: both render
// agent avatars, `<img>` loads through the agent-platform backend that the
// browser's user cookie authenticates (see AgentPlatformCookieAuth).
const agentsSubPage = SubPageBlueprint.make({
  name: 'agents',
  params: {
    path: 'agents',
    title: 'Agents',
    routeRef: agentsRouteRef,
    loader: async () => {
      const [{ AgentsRouter }, { AgentPlatformCookieAuth }] = await Promise.all(
        [
          import('./components/AgentsRouter'),
          import('./components/AgentPlatformCookieAuth'),
        ],
      );
      return (
        <AgentPlatformCookieAuth>
          <AgentsRouter />
        </AgentPlatformCookieAuth>
      );
    },
  },
});

// The "Sessions" tab. Read-only list of the signed-in user's kagent chat
// sessions across the fleet, via the agent-platform-backend kagent proxy.
//
// First of this plugin's tabs, because tab order follows the `extensions` array
// and the first tab is what a bare `/agent-platform` lands on: the section is
// opened to pick a conversation back up far more often than to look at the
// fleet's agents. Moving it also moves that landing page, so
// `getTelemetryPageViewPayload` names the bare path "Sessions index".
const sessionsSubPage = SubPageBlueprint.make({
  name: 'sessions',
  params: {
    path: 'sessions',
    title: 'Sessions',
    routeRef: sessionsRouteRef,
    loader: async () => {
      const [{ SessionsRouter }, { AgentPlatformCookieAuth }] =
        await Promise.all([
          import('./components/SessionsRouter'),
          import('./components/AgentPlatformCookieAuth'),
        ]);
      return (
        <AgentPlatformCookieAuth>
          <SessionsRouter />
        </AgentPlatformCookieAuth>
      );
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

// model-manager (the Models tab's Serving view on installations whose muster
// lists it): every call is one of its tools through the muster plugin's
// client, as the signed-in person. The kubernetes APIs mint the installation
// token the one backend-carried call (a try of a served model) sends along.
const modelManagerApi = ApiBlueprint.make({
  name: 'model-manager',
  params: defineParams =>
    defineParams({
      api: modelManagerApiRef,
      deps: {
        musterApi: musterApiRef,
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
    sessionsSubPage,
    agentsSubPage,
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
