import type { IconComponent, RouteRef } from '@backstage/frontend-plugin-api';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import BarChartIcon from '@material-ui/icons/BarChart';
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline';
import LaunchIcon from '@material-ui/icons/Launch';
import SettingsIcon from '@material-ui/icons/Settings';
import TuneIcon from '@material-ui/icons/Tune';
import { customizeRouteRef, homeRouteRef } from './routes';

type AgentShellNavItemBase = {
  id: string;
  title: string;
  icon: IconComponent;
  position: 'top' | 'bottom';
  /** Routes whose pages the item stands for in the rail, as their parent. */
  currentOn?: RouteRef[];
  /** The label under the icon in the phone's bottom bar, when shorter. */
  barTitle?: string;
  /**
   * Only in the mobile bar, which has no recent-sessions list and so no
   * "All sessions" link.
   */
  mobileOnly?: boolean;
  /**
   * Where the item goes at phone width (T22 D1): the bottom bar holds five
   * labelled items — New session, Sessions, Search, Customize, Profile — so
   * the rest move into the Profile menu. Default `'bar'`.
   */
  phone?: 'bar' | 'profileMenu';
  /** Opens in a new tab — for links that leave the shell. */
  newTab?: boolean;
  /**
   * A cross-link into the other portal: shown only while the deployment serves
   * that portal too (`app.portals`), left out when the shell is the whole
   * navigation.
   */
  crossLinkTo?: 'platformPortal';
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
    routeRef: homeRouteRef,
    position: 'top',
  },
  {
    id: 'sessions',
    title: 'Sessions',
    icon: ChatBubbleOutlineIcon,
    routeRef: agentPlatformPlugin.routes.sessions,
    position: 'top',
    mobileOnly: true,
  },
  {
    id: 'customize',
    title: 'Customize',
    icon: TuneIcon,
    routeRef: customizeRouteRef,
    currentOn: [
      agentPlatformPlugin.routes.agents,
      agentPlatformPlugin.routes.skills,
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
    // The least-used destination on a phone (T22 D1).
    phone: 'profileMenu',
  },
  {
    // The way back into the classic portal, whose own routes render classic
    // chrome; a new tab so the shell stays where it is. Absent on an
    // agent-only deployment.
    id: 'platform-portal',
    title: 'Platform Portal',
    icon: LaunchIcon,
    path: '/clusters',
    position: 'bottom',
    newTab: true,
    crossLinkTo: 'platformPortal',
    phone: 'profileMenu',
  },
  {
    id: 'profile',
    title: 'Profile and settings',
    barTitle: 'Profile',
    icon: SettingsIcon,
    menu: 'profile',
    position: 'bottom',
  },
];

/**
 * Which item the Search trigger (the command palette, not a nav item) follows:
 * right after New session in the rail, after Sessions in the phone's bar —
 * New session · Sessions · Search · Customize · Profile.
 */
export const SEARCH_FOLLOWS = { rail: 'new-session', bar: 'sessions' } as const;
