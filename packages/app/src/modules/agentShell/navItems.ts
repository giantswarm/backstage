import type { IconComponent, RouteRef } from '@backstage/frontend-plugin-api';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import BarChartIcon from '@material-ui/icons/BarChart';
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline';
import SettingsIcon from '@material-ui/icons/Settings';
import TuneIcon from '@material-ui/icons/Tune';
import { customizeRouteRef } from './routes';

type AgentShellNavItemBase = {
  id: string;
  title: string;
  icon: IconComponent;
  position: 'top' | 'bottom';
  /** Routes whose pages the item stands for in the rail, as their parent. */
  currentOn?: RouteRef[];
};

/**
 * One entry of the agent shell's rail. `routeRef` entries are left out when
 * their route is not bound; `menu` entries open a menu instead of navigating.
 */
export type AgentShellNavItem = AgentShellNavItemBase &
  ({ path: string } | { routeRef: RouteRef } | { menu: 'profile' });

export const agentShellNavItems: AgentShellNavItem[] = [
  {
    id: 'new-session',
    title: 'New session',
    icon: AddCircleOutlineIcon,
    path: '/',
    position: 'top',
  },
  {
    id: 'sessions',
    title: 'Sessions',
    icon: ChatBubbleOutlineIcon,
    routeRef: agentPlatformPlugin.routes.sessions,
    position: 'top',
  },
  {
    id: 'customize',
    title: 'Customize',
    icon: TuneIcon,
    routeRef: customizeRouteRef,
    currentOn: [
      agentPlatformPlugin.routes.agents,
      agentPlatformPlugin.routes.models,
      musterPlugin.routes.mcpServers,
      musterPlugin.routes.workflows,
    ],
    position: 'top',
  },
  {
    id: 'usage',
    title: 'Usage',
    icon: BarChartIcon,
    routeRef: agentPlatformPlugin.routes.usage,
    position: 'top',
  },
  {
    id: 'profile',
    title: 'Profile and settings',
    icon: SettingsIcon,
    menu: 'profile',
    position: 'bottom',
  },
];
