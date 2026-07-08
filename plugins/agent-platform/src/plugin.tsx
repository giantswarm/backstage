import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import AndroidIcon from '@material-ui/icons/Android';

import {
  newAgentReviewRouteRef,
  newAgentRouteRef,
  rootRouteRef,
} from './routes';

// The Agents section is a single page that renders its own bui PluginHeader per
// screen (form vs. review), so the app shell must not add its own header:
// `noHeader: true`, same as the gs clusters page. The page owns an internal
// react-router that drives `/agents`, `/agents/new`, and `/agents/new/review`.
//
// Disabled by default and enabled per-installation via app-config
// (`app.extensions: [page:agent-platform, nav-item:agent-platform]`) while the
// agent platform is still internal-only.
const agentsPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Agents',
    icon: <AndroidIcon />,
    noHeader: true,
    path: '/agents',
    routeRef: rootRouteRef,
    loader: async () => {
      const { Router } = await import('./components/Router');
      return <Router />;
    },
  },
});

export const agentPlatformPlugin = createFrontendPlugin({
  pluginId: 'agent-platform',
  extensions: [agentsPage],
  routes: {
    root: rootRouteRef,
    newAgent: newAgentRouteRef,
    newAgentReview: newAgentReviewRouteRef,
  },
});
