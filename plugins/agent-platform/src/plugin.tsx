import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import AndroidIcon from '@material-ui/icons/Android';

import { KagentApiClient, kagentApiRef } from './apis';
import {
  agentDetailRouteRef,
  agentsRouteRef,
  deploymentDetailsExternalRouteRef,
  musterToolExplorerExternalRouteRef,
  newAgentReviewRouteRef,
  newAgentRouteRef,
  newAgentSkillsRouteRef,
  rootRouteRef,
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
// flow (`/agent-platform/agents/new`, `.../new/skills` and `.../new/review`),
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

export const agentPlatformPlugin = createFrontendPlugin({
  pluginId: 'agent-platform',
  extensions: [agentPlatformPage, agentsSubPage, sessionsSubPage, kagentApi],
  routes: {
    root: rootRouteRef,
    agents: agentsRouteRef,
    agentDetail: agentDetailRouteRef,
    newAgent: newAgentRouteRef,
    newAgentSkills: newAgentSkillsRouteRef,
    newAgentReview: newAgentReviewRouteRef,
    sessions: sessionsRouteRef,
    sessionDetail: sessionDetailRouteRef,
  },
  // Both carry a `defaultTarget`, so they resolve without an app-config binding
  // and are simply unbound when the target plugin is disabled. Every call site
  // must handle `useRouteRef` returning undefined.
  externalRoutes: {
    musterToolExplorer: musterToolExplorerExternalRouteRef,
    deploymentDetails: deploymentDetailsExternalRouteRef,
  },
});
