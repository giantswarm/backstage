import {
  Link,
  sidebarConfig,
  useSidebarOpenState,
} from '@backstage/core-components';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core';
import type { Portals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { isAgentArea } from '../agentShell/agentArea';
import { LogoFull } from './LogoFull';
import { LogoIcon } from './LogoIcon';

const useSidebarLogoStyles = makeStyles({
  root: {
    width: sidebarConfig.drawerWidthClosed,
    height: 3 * sidebarConfig.logoHeight,
    display: 'flex',
    flexFlow: 'row nowrap',
    alignItems: 'center',
    marginBottom: -14,
  },
  link: {
    width: sidebarConfig.drawerWidthClosed,
    marginLeft: 24,
  },
});

/**
 * Where the classic logo leads. `/` is the classic home unless both portals
 * are served: then `/` is the agent shell's, and the portals cross-link only
 * in a new tab, so the logo leads to `app.rootRedirect` when it names a
 * classic page, and otherwise opens the shell's home in a new tab. On an
 * agent-only deployment there is no classic portal to keep, so `/` opens in
 * the same tab.
 */
export function classicLogoTarget(
  portals: Portals,
  rootRedirect: string | undefined,
): { to: string; newTab: boolean } {
  if (!portals.agentPlatform || !portals.platformPortal) {
    return { to: '/', newTab: false };
  }
  const redirectPath = rootRedirect?.split(/[?#]/)[0];
  if (
    rootRedirect &&
    redirectPath?.startsWith('/') &&
    redirectPath !== '/' &&
    !isAgentArea(redirectPath)
  ) {
    return { to: rootRedirect, newTab: false };
  }
  return { to: '/', newTab: true };
}

export const SidebarLogo = ({ portals }: { portals: Portals }) => {
  const classes = useSidebarLogoStyles();
  const { isOpen } = useSidebarOpenState();
  const rootRedirect =
    useApi(configApiRef).getOptionalString('app.rootRedirect');
  const { to, newTab } = classicLogoTarget(portals, rootRedirect);

  return (
    <div className={classes.root}>
      <Link
        to={to}
        target={newTab ? '_blank' : undefined}
        underline="none"
        className={classes.link}
        aria-label={newTab ? 'Home (opens in a new tab)' : 'Home'}
      >
        {isOpen ? <LogoFull /> : <LogoIcon />}
      </Link>
    </div>
  );
};
