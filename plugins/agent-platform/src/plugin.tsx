import {
  createFrontendPlugin,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';
import AndroidIcon from '@material-ui/icons/Android';

import {
  agentsRouteRef,
  newAgentReviewRouteRef,
  newAgentRouteRef,
  rootRouteRef,
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

// The "Agents" tab. Its content is a stub landing plus the create flow
// (`/agent-platform/agents/new` and `.../new/review`), driven by an internal
// react-router in AgentsRouter.
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

export const agentPlatformPlugin = createFrontendPlugin({
  pluginId: 'agent-platform',
  extensions: [agentPlatformPage, agentsSubPage],
  routes: {
    root: rootRouteRef,
    agents: agentsRouteRef,
    newAgent: newAgentRouteRef,
    newAgentReview: newAgentReviewRouteRef,
  },
});
