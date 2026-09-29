import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import MergeTypeIcon from '@material-ui/icons/MergeType';

import { rootRouteRef } from './routes';

// Disabled by default: the Bot PRs page is Giant Swarm's own queue, read from
// giantswarm/github's team files through marge, and must not appear in
// customer portals. A deployment opts in via app-config `app.extensions`
// (`page:bot-prs`), the same gating as the repositories and plans plugins.
const botPrsPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Bot PRs',
    icon: <MergeTypeIcon />,
    path: '/bot-prs',
    routeRef: rootRouteRef,
    loader: async () => {
      const { BotPrsRouter } = await import('./components/BotPrsRouter');
      return <BotPrsRouter />;
    },
  },
});

export const botPrsPlugin = createFrontendPlugin({
  pluginId: 'bot-prs',
  extensions: [botPrsPage],
  routes: {
    root: rootRouteRef,
  },
});
