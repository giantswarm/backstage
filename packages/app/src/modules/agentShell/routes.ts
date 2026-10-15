import { createRouteRef } from '@backstage/frontend-plugin-api';
import homePlugin from '@backstage/plugin-home/alpha';

export const customizeRouteRef = createRouteRef();

/**
 * The shell's home (`/`), the new-session screen. The home plugin's own root
 * route, which the shell's home page takes over (`AgentShellHomePage`) as the
 * classic home page does (`HomePageOverride`), so links to it resolve to `/`
 * in both shells.
 */
export const homeRouteRef = homePlugin.routes.root;
