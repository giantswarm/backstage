import {
  ApiBlueprint,
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createFrontendPlugin,
  ExtensionBoundary,
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
import { orderTabs } from './lib/tabOrder';
import { AgentPlatformPageRoutes } from './components/AgentPlatformPageRoutes';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { AGENT_SHELL_ON } from '@giantswarm/backstage-plugin-agent-platform-common';

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
  modelCacheRouteRef,
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
  newSkillRouteRef,
  profileRouteRef,
  rootRouteRef,
  servingRouteRef,
  sessionDetailRouteRef,
  sessionsRouteRef,
  skillsRouteRef,
  usageRouteRef,
} from './routes';

// The Agent Platform section: the sub-pages attached here (agent-platform's
// own and the muster plugin's "Connectors" and "Workflows") routed inside the
// agent shell, which draws the navigation between them (its rail), so the page
// has no header and no tab strip of its own; each sub-page titles itself.
//
// Shell only (`if: AGENT_SHELL_ON`): the Agent Platform exists in the agent
// shell and nowhere else. Where the shell is not available
// (`app.portals.agentPlatform` off and no personal opt-in) the page is not
// mounted at all — no route, no classic sidebar item, no classic-chrome
// rendering — so the classic portal carries nothing of the Agent Platform.
// Where it is, `/agent-platform/**` always renders in the shell (the app's
// layout picks the shell for the agent area) and the classic sidebar only
// links here. The predicate is evaluated once, at app start, like the shell's
// own extensions.
//
// Disabled by default and enabled per installation via app-config
// (`app.extensions: [page:agent-platform]`) as well.
//
// The page sorts its sub-pages by `AGENT_PLATFORM_TAB_ORDER`
// (lib/tabOrder.ts): Sessions · Agents · Models · Connectors · Workflows ·
// Usage. Attach order alone cannot interleave two plugins' sub-pages, and an
// extension a deployment names in its own `app.extensions` attaches first. The
// first one is where a bare `/agent-platform` lands.
const agentPlatformPage = PageBlueprint.makeWithOverrides({
  disabled: true,
  if: AGENT_SHELL_ON,
  factory(originalFactory, { inputs }) {
    const title = 'Agent Platform';
    const pages = orderTabs(inputs.pages, page => page.node.spec.id);
    return originalFactory({
      title,
      icon: <AndroidIcon />,
      path: '/agent-platform',
      routeRef: rootRouteRef,
      noHeader: true,
      loader: async () => (
        <AgentPlatformPageRoutes
          pageTitle={title}
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

// The "Usage" tab: an Overview of the platform's health and headline trends
// (every caller), the Cost view (every caller's money), the Connectors view
// (every caller's tool calls to the connectors, from muster's Prometheus
// metrics, contributed by the muster plugin through the `sections` input
// below), and your own agent usage (personal, derived from kagent's stored
// conversations).
//
// The last tab of the row, after muster's MCP Servers and Workflows (see
// `agentPlatformPage`).
//
// `makeWithOverrides` + `createExtensionInput` — the same shape as the flux
// list/tree filter inputs — so muster can attach its section by node id
// (`sub-page:agent-platform/usage`, input `sections`) without either plugin
// depending on the other, exactly as it already attaches its "MCP Servers" tab
// to `page:agent-platform`. An empty `sections` (muster not registered) means
// no Connectors view is offered.
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
        // has to know whether anything was contributed at all, so it offers
        // the Connectors view only when something was.
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

// One skill's detail page (`/agent-platform/skills/<owner>/<repo>[/<dir>]`),
// linked from the shell's Customize → Skills tab the way a connector row links
// to `/agent-platform/connectors/<name>`. The bare path redirects there.
//
// Enabled by default on purpose, like muster's mcp-servers redirect page:
// deployments replace `app.extensions` wholesale, so an opt-in entry would
// silently drop the page. Shell only, like the section itself (see
// `agentPlatformPage`): without the shell it is not routed.
const skillsPage = PageBlueprint.make({
  name: 'skills',
  if: AGENT_SHELL_ON,
  params: {
    path: '/agent-platform/skills',
    routeRef: skillsRouteRef,
    noHeader: true,
    loader: async () => {
      const { SkillsRouter } = await import('./components/SkillsRouter');
      return <SkillsRouter />;
    },
  },
});

// The shell's minimal "Profile and settings" page (`/agent-platform/profile`):
// who is signed in, the installations the portal talks to, and Sign out — the
// rail's profile menu links here, so it no longer jumps into the classic
// Settings chrome. The classic `/settings` remains reachable through the
// page's explicit "All portal settings" link.
//
// Enabled by default for the same reason as `skillsPage` above: deployments
// replace `app.extensions` wholesale, and an opt-in entry would silently drop
// the page the shell's profile menu links to. Shell only, like `skillsPage`.
const profilePage = PageBlueprint.make({
  name: 'profile',
  if: AGENT_SHELL_ON,
  params: {
    path: '/agent-platform/profile',
    routeRef: profileRouteRef,
    noHeader: true,
    loader: async () => {
      const { ProfilePage } = await import('./components/ProfilePage');
      return <ProfilePage />;
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

// The Used by tab of the shell's connector page: the agents whose toolset
// reaches the connector.
//
// **The contract, a cross-plugin coupling by string:** the target node is
// `sub-page:muster/mcp-servers`, its input `usedBy` (a singleton), declared
// there with `SubPageBlueprint.makeWithOverrides` +
// `createExtensionInput([coreExtensionData.reactElement])`. The element reads
// its connector with muster's `useConnectorPageTarget`. Both ends carry this
// comment; changing either without the other makes the tab silently vanish.
const connectorUsedBy = createExtension({
  kind: 'connector-used-by',
  name: 'agents',
  attachTo: { id: 'sub-page:muster/mcp-servers', input: 'usedBy' },
  output: [coreExtensionData.reactElement],
  factory({ node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, async () => {
          const { ConnectorUsedBy } =
            await import('./components/ConnectorUsedBy');
          return <ConnectorUsedBy />;
        }),
      ),
    ];
  },
});

// The shell workflow page's "Edit with <agent>": the hand-off to the workflow
// agent (`metaAgents.workflowManagement`).
//
// **The contract, a cross-plugin coupling by string:** the target node is
// `sub-page:muster/workflows`, its input `editAction` (a singleton), declared
// there with `SubPageBlueprint.makeWithOverrides` +
// `createExtensionInput([coreExtensionData.reactElement])`. The element reads
// its workflow with muster's `useWorkflowPageTarget`. Both ends carry this
// comment; changing either without the other makes the action silently
// vanish.
const workflowEditAssist = createExtension({
  kind: 'workflow-action',
  name: 'edit-via-agent',
  attachTo: { id: 'sub-page:muster/workflows', input: 'editAction' },
  output: [coreExtensionData.reactElement],
  factory({ node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, async () => {
          const { WorkflowEditAssist } =
            await import('./components/WorkflowEditAssist');
          return <WorkflowEditAssist />;
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
    skillsPage,
    profilePage,
    usageSubPage,
    installationScopeHeaderAction,
    createClusterAction,
    deleteClusterAction,
    connectorUsedBy,
    workflowEditAssist,
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
    skills: skillsRouteRef,
    newSkill: newSkillRouteRef,
    profile: profileRouteRef,
    usage: usageRouteRef,
    models: modelsRouteRef,
    modelDetail: modelDetailRouteRef,
    newModel: newModelRouteRef,
    serving: servingRouteRef,
    gpuCapacity: gpuCapacityRouteRef,
    modelCache: modelCacheRouteRef,
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
