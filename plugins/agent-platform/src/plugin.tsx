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
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { AGENT_SHELL_ON } from '@giantswarm/backstage-plugin-agent-platform-common';

import {
  KagentApiClient,
  kagentApiRef,
  ModelManagerApiClient,
  modelManagerApiRef,
} from './apis';
import {
  addGpuNodePoolRouteRef,
  addModelBackendRouteRef,
  agentDetailRouteRef,
  agentEditRouteRef,
  agentsRouteRef,
  customizeExternalRouteRef,
  deploymentDetailsExternalRouteRef,
  gpuCapacityRouteRef,
  importModelRouteRef,
  modelCacheRouteRef,
  modelDetailRouteRef,
  modelEditRouteRef,
  installationsExternalRouteRef,
  modelsRouteRef,
  musterServerExternalRouteRef,
  musterServersExternalRouteRef,
  musterServerToolExternalRouteRef,
  musterWorkflowDetailExternalRouteRef,
  newAgentReviewRouteRef,
  newAgentRouteRef,
  newAgentSkillsRouteRef,
  newAgentToolsRouteRef,
  newModelRouteRef,
  newSessionExternalRouteRef,
  newSkillRouteRef,
  profileRouteRef,
  pullModelRouteRef,
  rootRouteRef,
  serveModelRouteRef,
  servingRouteRef,
  sessionDetailRouteRef,
  sessionsRouteRef,
  skillsRouteRef,
  usageConnectorsRouteRef,
  usageConversationsRouteRef,
  usageCostRouteRef,
  usageRouteRef,
  workspaceEditRouteRef,
  workspacesRouteRef,
  newWorkspaceRouteRef,
} from './routes';

/**
 * The id of the app's Customize page (`/customize`), which the Agents, Skills
 * and Models tabs attach to — the way upstream's
 * `catalog-unprocessed-entities` attaches to `page:devtools`, and muster's
 * Connectors and Workflows tabs attach to the same page. The page routes each
 * tab's bare path to its own list screen and everything deeper to the tab's
 * router here, so these routers hold the detail, create and edit pages,
 * never the lists. Attached in code rather than in `app.extensions`, which
 * deployments replace wholesale.
 */
const CUSTOMIZE_PAGE = 'page:app/agent-shell-customize';

// The Customize screen's "Agents" tab. Its content is one agent's page
// (`/customize/agents/<installation>/<namespace>/<name>`), its edit
// (`…/<name>/edit`) and the create flow (`/customize/agents/new`,
// `…/new/skills`, `…/new/tools` and `…/new/review`), all driven by an
// internal react-router in AgentsRouter.
//
// Wrapped, like the Sessions page, in the backend's cookie auth: both render
// agent avatars, `<img>` loads through the agent-platform backend that the
// browser's user cookie authenticates (see AgentPlatformCookieAuth).
const agentsSubPage = SubPageBlueprint.make({
  name: 'agents',
  attachTo: { id: CUSTOMIZE_PAGE, input: 'pages' },
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

// The Customize screen's "Skills" tab: one skill's page
// (`/customize/skills/<owner>/<repo>[/<dir>]`), its edit and the add form.
const skillsSubPage = SubPageBlueprint.make({
  name: 'skills',
  attachTo: { id: CUSTOMIZE_PAGE, input: 'pages' },
  params: {
    path: 'skills',
    title: 'Skills',
    routeRef: skillsRouteRef,
    loader: async () => {
      const { SkillsRouter } = await import('./components/SkillsRouter');
      return <SkillsRouter />;
    },
  },
});

// The Customize screen's "Models" tab: one model's page
// (`/customize/models/<installation>/<namespace>/<name>`), its edit, the
// create flow and Model hosting (`/customize/models/hosting/…`), the serving
// layer beneath the models, driven by ModelsRouter.
const modelsSubPage = SubPageBlueprint.make({
  name: 'models',
  attachTo: { id: CUSTOMIZE_PAGE, input: 'pages' },
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

// The Customize screen's Workspaces tab: the create flow
// (`/customize/workspaces/new`) and one workspace's edit
// (`/customize/workspaces/<installation>/<organization>/<name>/edit`), driven
// by WorkspacesRouter.
const workspacesSubPage = SubPageBlueprint.make({
  name: 'workspaces',
  attachTo: { id: CUSTOMIZE_PAGE, input: 'pages' },
  params: {
    path: 'workspaces',
    title: 'Workspaces',
    routeRef: workspacesRouteRef,
    loader: async () => {
      const { WorkspacesRouter } =
        await import('./components/WorkspacesRouter');
      return <WorkspacesRouter />;
    },
  },
});

// The rail's Sessions (`/sessions`): the signed-in user's kagent chat sessions
// across the fleet, via the agent-platform-backend kagent proxy, and one
// session's page.
//
// Shell only (`if: AGENT_SHELL_ON`), like every page of the Agent Platform:
// it exists in the agent shell and nowhere else. Where the shell is not
// available (`app.portals.agentPlatform` off and no personal opt-in) the page
// is not mounted at all — no route, no classic-chrome rendering — so the
// classic portal carries nothing of the Agent Platform. The predicate is
// evaluated once, at app start, like the shell's own extensions.
//
// Enabled by default, like every page here: `if` already gates it, and an
// opt-in entry would be silently dropped by a deployment that replaces
// `app.extensions` wholesale.
const sessionsPage = PageBlueprint.make({
  name: 'sessions',
  if: AGENT_SHELL_ON,
  params: {
    // eslint-disable-next-line giantswarm/no-restricted-syntax -- the Sessions page's route definition
    path: '/sessions',
    routeRef: sessionsRouteRef,
    noHeader: true,
    loader: async () => {
      const [
        { SessionsRouter },
        { AgentPlatformCookieAuth },
        { ShellPageRoot },
      ] = await Promise.all([
        import('./components/SessionsRouter'),
        import('./components/AgentPlatformCookieAuth'),
        import('./components/ShellPageRoot'),
      ]);
      return (
        <ShellPageRoot title="Sessions">
          <AgentPlatformCookieAuth>
            <SessionsRouter />
          </AgentPlatformCookieAuth>
        </ShellPageRoot>
      );
    },
  },
});

// The rail's Usage (`/usage`): an Overview of the platform's health and
// headline trends (every caller, the bare path), the Cost view (every
// caller's money), the Connectors view (every caller's tool calls to the
// connectors, from muster's Prometheus metrics, contributed by the muster
// plugin through the `sections` input below), and your own agent usage
// (personal, derived from kagent's stored conversations).
//
// `makeWithOverrides` + `createExtensionInput` — the same shape as the flux
// list/tree filter inputs — so muster can attach its section by node id
// (`page:agent-platform/usage`, input `sections`) without either plugin
// depending on the other, exactly as it attaches its Connectors tab to the
// Customize page. An empty `sections` (muster not registered) means no
// Connectors view is offered. Shell only and enabled by default, like
// `sessionsPage`.
const usagePage = PageBlueprint.makeWithOverrides({
  name: 'usage',
  if: AGENT_SHELL_ON,
  inputs: {
    sections: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      // eslint-disable-next-line giantswarm/no-restricted-syntax -- the Usage page's route definition
      path: '/usage',
      routeRef: usageRouteRef,
      noHeader: true,
      loader: async () => {
        const [{ UsageRouter }, { ShellPageRoot }] = await Promise.all([
          import('./components/UsageRouter'),
          import('./components/ShellPageRoot'),
        ]);
        // Passed as the array rather than wrapped in a fragment: the router
        // has to know whether anything was contributed at all, so it offers
        // the Connectors view only when something was.
        const sections = inputs.sections.map(section =>
          section.get(coreExtensionData.reactElement),
        );
        return (
          <ShellPageRoot title="Usage">
            <UsageRouter sections={sections} />
          </ShellPageRoot>
        );
      },
    });
  },
});

// The shell's minimal "Profile and settings" page (`/profile`): who is signed
// in, the installations the portal talks to, and Sign out — the rail's
// profile menu links here, so it no longer jumps into the classic Settings
// chrome. The classic `/settings` remains reachable through the page's
// explicit "All portal settings" link. Shell only and enabled by default,
// like `sessionsPage`.
const profilePage = PageBlueprint.make({
  name: 'profile',
  if: AGENT_SHELL_ON,
  params: {
    // eslint-disable-next-line giantswarm/no-restricted-syntax -- the profile page's route definition
    path: '/profile',
    routeRef: profileRouteRef,
    noHeader: true,
    loader: async () => {
      const { ProfilePage } = await import('./components/ProfilePage');
      return <ProfilePage />;
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
    sessionsPage,
    usagePage,
    profilePage,
    agentsSubPage,
    skillsSubPage,
    modelsSubPage,
    workspacesSubPage,
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
    agentEdit: agentEditRouteRef,
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
    usageCost: usageCostRouteRef,
    usageConversations: usageConversationsRouteRef,
    usageConnectors: usageConnectorsRouteRef,
    models: modelsRouteRef,
    newModel: newModelRouteRef,
    modelDetail: modelDetailRouteRef,
    modelEdit: modelEditRouteRef,
    serving: servingRouteRef,
    serveModel: serveModelRouteRef,
    importModel: importModelRouteRef,
    pullModel: pullModelRouteRef,
    addModelBackend: addModelBackendRouteRef,
    gpuCapacity: gpuCapacityRouteRef,
    addGpuNodePool: addGpuNodePoolRouteRef,
    modelCache: modelCacheRouteRef,
    workspaces: workspacesRouteRef,
    newWorkspace: newWorkspaceRouteRef,
    workspaceEdit: workspaceEditRouteRef,
  },
  // All but `customize` and `newSession` carry a `defaultTarget`, so they
  // resolve without an app-config binding and are simply unbound when the
  // target plugin is disabled. `customize` and `newSession` target the app's
  // own Customize page and home, which no plugin can name: they resolve only
  // through the app's `bindRoutes` (packages/app/src/App.tsx) and are unbound
  // without it. Every call site must handle `useRouteRef` returning undefined.
  externalRoutes: {
    customize: customizeExternalRouteRef,
    newSession: newSessionExternalRouteRef,
    musterServers: musterServersExternalRouteRef,
    musterServer: musterServerExternalRouteRef,
    musterServerTool: musterServerToolExternalRouteRef,
    musterWorkflowDetail: musterWorkflowDetailExternalRouteRef,
    deploymentDetails: deploymentDetailsExternalRouteRef,
    installations: installationsExternalRouteRef,
  },
});
