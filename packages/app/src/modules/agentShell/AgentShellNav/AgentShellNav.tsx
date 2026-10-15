import { Fragment } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { sidebarConfig, useSidebarPinState } from '@backstage/core-components';
import { Box, ButtonIcon, Flex, Link, Text } from '@backstage/ui';
import {
  CommandPalette,
  NeedsInputToasts,
  RecentSessions,
} from '@giantswarm/backstage-plugin-agent-platform';
import { ClusterAccessConnector } from '@giantswarm/backstage-plugin-gs';
import { makeStyles } from '@material-ui/core/styles';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import SearchIcon from '@material-ui/icons/Search';
import { LogoIcon } from '../../nav/LogoIcon';
import { usePortals } from '../agentArea';
import { agentShellNavItems, SEARCH_FOLLOWS } from '../navItems';
import { homeRouteRef } from '../routes';
import { RailFrame } from './RailFrame';
import { RailItem } from './RailItem';
import { type RailLayout, useBarItemStyles } from './railLayout';
import { SkipLink } from './SkipLink';

const useStyles = makeStyles({
  column: {
    height: '100%',
    boxSizing: 'border-box',
  },
  mobileRail: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    // The shell's one source of truth for how much the bar covers
    // (agent-shell.css): sidebarConfig.mobileSidebarHeight plus the iOS
    // home-indicator inset, which the padding reserves so the items stay
    // above it. The session composer docks above the same variable.
    height: `var(--agent-shell-mobile-bar-height, ${sidebarConfig.mobileSidebarHeight}px)`,
    paddingBottom: 'env(safe-area-inset-bottom)',
    boxSizing: 'border-box',
    background: 'var(--agent-shell-rail-bg, var(--bui-bg-neutral-1))',
    borderTop: '1px solid var(--bui-border-1)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  // The collapsed rail centres each item on the rail's one axis, the axis
  // the logo and the expand button sit on: links and Search fill the rail's
  // inner width, the profile trigger is narrower and would sit left.
  compactList: {
    '& > li': {
      display: 'flex',
      justifyContent: 'center',
    },
  },
  mobileList: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
  },
  logo: {
    color: 'var(--bui-fg-primary)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    '&:hover': {
      color: 'var(--bui-fg-primary)',
      textDecoration: 'none',
    },
  },
  // The collapsed rail has one icon item's width for the logo. A branding
  // logo icon (`logo-icon.svg/png`, at `app.branding.logo.height`) can be
  // wider than that: it scales down to fit, keeping its proportions, rather
  // than being cut off by the rail's edge.
  compactLogo: {
    display: 'flex',
    justifyContent: 'center',
    maxWidth: '100%',
    '& > *': {
      minWidth: 0,
      maxWidth: '100%',
    },
    '& img, & svg': {
      maxWidth: '100%',
      objectFit: 'contain',
    },
  },
  recent: {
    minHeight: 0,
    overflowY: 'auto',
  },
  bottom: {
    marginTop: 'auto',
    borderTop: '1px solid var(--bui-border-1)',
  },
  // The ⌘K hint beside the Search item, like the prototype's.
  shortcutHint: {
    marginLeft: 'auto',
    fontSize: 11.5,
    lineHeight: '16px',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 5,
    padding: '1px 5px',
    color: 'var(--bui-fg-secondary)',
    background: 'var(--bui-bg-neutral-1)',
  },
  // A button dressed as a rail item (the Search trigger opens an overlay, it
  // does not navigate).
  railButton: {
    display: 'block',
    width: '100%',
    padding: 'var(--bui-space-2)',
    border: 0,
    background: 'transparent',
    borderRadius: 'var(--bui-radius-2)',
    color: 'var(--bui-fg-primary)',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      background: 'var(--agent-shell-rail-item-hover, var(--bui-bg-neutral-2))',
    },
  },
});

/**
 * The rail's Search item: opens the ⌘K command palette the agent-platform
 * plugin provides. A button dressed as a rail item — opening the palette is
 * an overlay, not a navigation. Guarded: several test files mock the
 * agent-platform plugin module with only the exports they know about, and a
 * partial mock must degrade to "no Search item" rather than crash the rail.
 */
function PaletteSearchItem({
  layout,
  className,
  hintClassName,
}: {
  layout: RailLayout;
  className: string;
  hintClassName: string;
}) {
  const barClasses = useBarItemStyles();
  if (!CommandPalette) {
    return null;
  }
  if (layout === 'bar') {
    // A phone has no ⌘K to hint at: the icon and its label, nothing else.
    return (
      <CommandPalette
        renderTrigger={open => (
          <li className={barClasses.slot}>
            <button type="button" className={barClasses.item} onClick={open}>
              <SearchIcon fontSize="small" />
              <span className={barClasses.label}>Search</span>
            </button>
          </li>
        )}
      />
    );
  }
  const compact = layout === 'collapsed';
  const shortcut = /mac|iphone|ipad|ipod/i.test(navigator.platform)
    ? '⌘K'
    : 'Ctrl+K';
  return (
    <CommandPalette
      renderTrigger={open => (
        <li>
          <button
            type="button"
            className={className}
            onClick={open}
            aria-label={compact ? 'Search' : undefined}
            title={compact ? `Search (${shortcut})` : undefined}
            aria-keyshortcuts="Meta+K Control+K"
          >
            <Flex align="center" gap="2">
              <SearchIcon fontSize="small" />
              {!compact && <Text variant="body-medium">Search</Text>}
              {!compact && (
                <span aria-hidden="true" className={hintClassName}>
                  {shortcut}
                </span>
              )}
            </Flex>
          </button>
        </li>
      )}
    />
  );
}

// The connector probes each installation and records it healthy; the
// installation inventory, and so every Agent Platform page, waits on that.
//
// The needs-input watcher mounts here, once per shell, rather than inside the
// rail's session list: the expanded rail is the only place that list renders,
// and a collapsed rail or the phone's bottom bar must still raise the toast.
// Guarded like the palette, for tests that mock the plugin module partially.
export function AgentShellNav() {
  return (
    <>
      <ClusterAccessConnector />
      {NeedsInputToasts && <NeedsInputToasts />}
      <AgentShellRail />
    </>
  );
}

function AgentShellRail() {
  const classes = useStyles();
  const { isPinned, toggleSidebarPinState, isMobile } = useSidebarPinState();
  const portals = usePortals();
  const homeRoute = useRouteRef(homeRouteRef);
  // A cross-link into the other portal only while the deployment serves it.
  const items = agentShellNavItems.filter(
    item => !item.crossLinkTo || portals[item.crossLinkTo],
  );
  const top = items.filter(item => item.position === 'top');
  const bottom = items.filter(item => item.position === 'bottom');

  // The skip link sits outside the rail, fixed to the top left of the
  // viewport: inside the bottom-anchored mobile bar its hidden state floated
  // over the content and took the clicks meant for it.
  //
  // The bar holds five labelled items (T22 D1): New session · Sessions ·
  // Search · Customize · Profile. The rest move into the Profile menu.
  // `agent-shell-mobile-bar` is the stable hook agent-shell.css hides the bar
  // by while the soft keyboard is up.
  if (isMobile) {
    const inBar = [...top, ...bottom].filter(
      item => item.phone !== 'profileMenu',
    );
    const inProfileMenu = items.filter(item => item.phone === 'profileMenu');
    return (
      <>
        <SkipLink />
        <nav
          aria-label="Main"
          className={`${classes.mobileRail} agent-shell-mobile-bar`}
        >
          <ul className={`${classes.list} ${classes.mobileList}`}>
            {inBar.map(item => (
              <Fragment key={item.id}>
                <RailItem
                  item={item}
                  layout="bar"
                  menuItems={'menu' in item ? inProfileMenu : undefined}
                />
                {item.id === SEARCH_FOLLOWS.bar && (
                  <PaletteSearchItem
                    layout="bar"
                    className={classes.railButton}
                    hintClassName={classes.shortcutHint}
                  />
                )}
              </Fragment>
            ))}
          </ul>
        </nav>
      </>
    );
  }

  const compact = !isPinned;
  const layout: RailLayout = compact ? 'collapsed' : 'expanded';
  const desktopTop = top.filter(item => !item.mobileOnly);
  const listClassName = compact
    ? `${classes.list} ${classes.compactList}`
    : classes.list;

  return (
    <>
      <SkipLink />
      <RailFrame resizable={!compact}>
        <Flex
          direction="column"
          gap="4"
          py="3"
          px="2"
          className={classes.column}
        >
          <Flex
            direction={compact ? 'column' : 'row'}
            align="center"
            justify="between"
            gap="2"
            pl={compact ? undefined : '2'}
            pr={compact ? undefined : '1'}
          >
            <Link
              href={homeRoute?.()}
              aria-label="Agent Platform"
              className={
                compact
                  ? `${classes.logo} ${classes.compactLogo}`
                  : classes.logo
              }
            >
              <Flex align="center" gap="2">
                <LogoIcon />
                {!compact && (
                  <Text variant="body-large" weight="bold">
                    Agent Platform
                  </Text>
                )}
              </Flex>
            </Link>
            <ButtonIcon
              variant="tertiary"
              size="small"
              icon={compact ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              onPress={toggleSidebarPinState}
            />
          </Flex>
          <ul className={listClassName}>
            {desktopTop.map(item => (
              <Fragment key={item.id}>
                <RailItem item={item} layout={layout} />
                {item.id === SEARCH_FOLLOWS.rail && (
                  <PaletteSearchItem
                    layout={layout}
                    className={classes.railButton}
                    hintClassName={classes.shortcutHint}
                  />
                )}
              </Fragment>
            ))}
          </ul>
          {!compact && (
            <div className={classes.recent}>
              <RecentSessions shellRail />
            </div>
          )}
          <Box pt="2" className={classes.bottom}>
            <ul className={listClassName}>
              {bottom.map(item => (
                <RailItem key={item.id} item={item} layout={layout} />
              ))}
            </ul>
          </Box>
        </Flex>
      </RailFrame>
    </>
  );
}
