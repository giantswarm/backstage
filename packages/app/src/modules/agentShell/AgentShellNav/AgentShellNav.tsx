import { Fragment } from 'react';
import { sidebarConfig, useSidebarPinState } from '@backstage/core-components';
import { Box, ButtonIcon, Flex, Link, Text } from '@backstage/ui';
import {
  CommandPalette,
  RecentSessions,
  SessionNotificationsBell,
} from '@giantswarm/backstage-plugin-agent-platform';
import { ClusterAccessConnector } from '@giantswarm/backstage-plugin-gs';
import { makeStyles } from '@material-ui/core/styles';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import SearchIcon from '@material-ui/icons/Search';
import { LogoIcon } from '../../nav/LogoIcon';
import { agentShellNavItems } from '../navItems';
import { RailItem } from './RailItem';
import { SkipLink } from './SkipLink';

const useStyles = makeStyles({
  rail: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 1000,
    background: 'var(--agent-shell-rail-bg, var(--bui-bg-neutral-1))',
    borderRight: '1px solid var(--bui-border-1)',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
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
  mobileList: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
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
  // The bell's trigger, dressed as a rail item (it is a button, not a link).
  bell: {
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
 * The notification bell, guarded: several test files mock the agent-platform
 * plugin module with only the exports they know about, and a partial mock
 * must degrade to "no bell" rather than crash the whole rail.
 */
function BellItem({
  compact,
  className,
}: {
  compact: boolean;
  className: string;
}) {
  if (!SessionNotificationsBell) {
    return null;
  }
  return (
    <li>
      <SessionNotificationsBell compact={compact} className={className} />
    </li>
  );
}

/**
 * The rail's Search item: opens the ⌘K command palette the agent-platform
 * plugin provides. A button dressed as a rail item, like the bell — opening
 * the palette is an overlay, not a navigation. Guarded like {@link BellItem}:
 * a partial mock of the plugin module degrades to "no Search item".
 */
function PaletteSearchItem({
  compact,
  className,
  hintClassName,
}: {
  compact: boolean;
  className: string;
  hintClassName: string;
}) {
  if (!CommandPalette) {
    return null;
  }
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
export function AgentShellNav() {
  return (
    <>
      <ClusterAccessConnector />
      <AgentShellRail />
    </>
  );
}

function AgentShellRail() {
  const classes = useStyles();
  const { isPinned, toggleSidebarPinState, isMobile } = useSidebarPinState();
  const top = agentShellNavItems.filter(item => item.position === 'top');
  const bottom = agentShellNavItems.filter(item => item.position === 'bottom');

  if (isMobile) {
    return (
      <nav aria-label="Main" className={classes.mobileRail}>
        <SkipLink />
        <ul className={`${classes.list} ${classes.mobileList}`}>
          {[...top, ...bottom].map(item => (
            <RailItem key={item.id} item={item} compact />
          ))}
          <PaletteSearchItem
            compact
            className={classes.bell}
            hintClassName={classes.shortcutHint}
          />
          <BellItem compact className={classes.bell} />
        </ul>
      </nav>
    );
  }

  // SidebarPage pads the content by the classic sidebar's width for the same
  // pin state, so the rail takes exactly that width.
  const compact = !isPinned;
  const desktopTop = top.filter(item => !item.mobileOnly);
  const width = isPinned
    ? sidebarConfig.drawerWidthOpen
    : sidebarConfig.drawerWidthClosed;

  return (
    <nav aria-label="Main" className={classes.rail} style={{ width }}>
      <SkipLink />
      <Flex direction="column" gap="4" py="3" px="2" className={classes.column}>
        <Flex
          direction={compact ? 'column' : 'row'}
          align="center"
          justify="between"
          gap="2"
          pl={compact ? undefined : '2'}
          pr={compact ? undefined : '1'}
        >
          <Link href="/" aria-label="Agent Platform" className={classes.logo}>
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
        <ul className={classes.list}>
          {desktopTop.map(item => (
            <Fragment key={item.id}>
              <RailItem item={item} compact={compact} />
              {item.id === 'new-session' && (
                <PaletteSearchItem
                  compact={compact}
                  className={classes.bell}
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
          <ul className={classes.list}>
            {bottom.map(item => (
              <RailItem key={item.id} item={item} compact={compact} />
            ))}
            <BellItem compact={compact} className={classes.bell} />
          </ul>
        </Box>
      </Flex>
    </nav>
  );
}
