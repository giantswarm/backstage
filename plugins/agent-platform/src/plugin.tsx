import {
  ApiBlueprint,
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createFrontendPlugin,
  ExtensionBoundary,
  discoveryApiRef,
  featureFlagsApiRef,
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
import { orderTabs } from './lib/tabOrder';
import { AgentPlatformPageRoutes } from './components/AgentPlatformPageRoutes';
import { AGENT_SHELL_FLAG } from './hooks/useAgentShell';
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
  installationsExternalRouteRef,
  modelDetailRouteRef,
  modelsRouteRef,
  musterServersExternalRouteRef,
  musterServerToolExternalRouteRef,
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
// (the same pattern as the flux section). The "MCP Servers" and "Workflows"
// tabs are contributed by the muster plugin (SubPageBlueprints attached to this
// page).
//
// Disabled by default and enabled per-installation via app-config
// (`app.extensions: [page:agent-platform, nav-item:agent-platform]`) while the
// agent platform is still internal-only.
//
// The page sorts its tabs by `AGENT_PLATFORM_TAB_ORDER` (lib/tabOrder.ts):
// Sessions · Agents · Models · MCP Servers · Workflows · Usage. Attach order
// alone cannot interleave two plugins' tabs, and an extension a deployment
// names in its own `app.extensions` attaches first. The first tab is also
// where a bare `/agent-platform` lands.
//
// Inside the agent-platform shell the page drops its header and tab strip:
// the shell's rail navigates between the tabs, and each tab titles itself. The
// flag is read when the app tree is built, as the shell's own extensions are,
// so turning it on or off takes effect on the next load.
const agentPlatformPage = PageBlueprint.makeWithOverrides({
  disabled: true,
  factory(originalFactory, { apis, inputs }) {
    const params = {
      title: 'Agent Platform',
      icon: <AndroidIcon />,
      path: '/agent-platform',
      routeRef: rootRouteRef,
    };
    const pages = orderTabs(inputs.pages, page => page.node.spec.id);
    if (!apis.get(featureFlagsApiRef)?.isActive(AGENT_SHELL_FLAG)) {
      return originalFactory(params, { inputs: { pages } });
    }
    return originalFactory({
      ...params,
      noHeader: true,
      loader: async () => (
        <AgentPlatformPageRoutes
          pageTitle={params.title}
          pages={pages.map(page => ({
            path: page.get(coreExtensionData.routePath),
            title: page.get(coreExtensionData.title),
            element: page.get(coreExtensionData.reactElement),
          }))}
        />
      ),
    });
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
// The first tab (see `agentPlatformPage`), and the first tab is what a bare
// `/agent-platform` lands on: the section is opened to pick a conversation
// back up far more often than to look at the fleet's agents. Moving it also moves that landing page, so
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
// The last tab of the row, after muster's MCP Servers and Workflows (see
// `agentPlatformPage`).
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

// Create cluster and Delete on the gs plugin's Clusters pages, through
// cluster-manager over muster as the signed-in person (giantswarm/backstage#2624).
//
// **The contract, a cross-plugin coupling by string:** the target node is
// `page:gs/clusters`, its inputs `listActions` (beside the list's header) and
// `clusterActions` (beside a cluster's header, reading the cluster with gs's
// `useClusterPageTarget`), declared there with `PageBlueprint.makeWithOverrides`
// + `createExtensionInput([coreExtensionData.reactElement])`. Both ends carry
// this comment; changing either without the other makes the actions silently
// vanish. Each renders nothing where no installation's cluster-manager offers
// its tool.
const createClusterAction = createExtension({
  kind: 'clusters-action',
  name: 'create-cluster',
  attachTo: { id: 'page:gs/clusters', input: 'listActions' },
  output: [coreExtensionData.reactElement],
  factory({ node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, async () => {
          const { CreateClusterAction } =
            await import('./components/ClusterActions');
          return <CreateClusterAction />;
        }),
      ),
    ];
  },
});

const deleteClusterAction = createExtension({
  kind: 'clusters-action',
  name: 'delete-cluster',
  attachTo: { id: 'page:gs/clusters', input: 'clusterActions' },
  output: [coreExtensionData.reactElement],
  factory({ node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, async () => {
          const { DeleteClusterAction } =
            await import('./components/ClusterActions');
          return <DeleteClusterAction />;
        }),
      ),
    ];
  },
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
    createClusterAction,
    deleteClusterAction,
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
  // All carry a `defaultTarget`, so they resolve without an app-config binding
  // and are simply unbound when the target plugin is disabled. Every call site
  // must handle `useRouteRef` returning undefined.
  externalRoutes: {
    musterServers: musterServersExternalRouteRef,
    musterServerTool: musterServerToolExternalRouteRef,
    deploymentDetails: deploymentDetailsExternalRouteRef,
    installations: installationsExternalRouteRef,
  },
});
