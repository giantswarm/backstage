import type { IconComponent, RouteRef } from '@backstage/frontend-plugin-api';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import BarChartIcon from '@material-ui/icons/BarChart';
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline';
import SettingsIcon from '@material-ui/icons/Settings';
import TuneIcon from '@material-ui/icons/Tune';

type AgentShellNavItemBase = {
  id: string;
  title: string;
  icon: IconComponent;
  position: 'top' | 'bottom';
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
    path: '/customize',
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
