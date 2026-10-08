import { Fragment } from 'react';
import { sidebarConfig, useSidebarPinState } from '@backstage/core-components';
import { Box, ButtonIcon, Flex, Link, SearchField, Text } from '@backstage/ui';
import { RecentSessions } from '@giantswarm/backstage-plugin-agent-platform';
import { ClusterAccessConnector } from '@giantswarm/backstage-plugin-gs';
import { makeStyles } from '@material-ui/core/styles';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
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
    height: sidebarConfig.mobileSidebarHeight,
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
});

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
        </ul>
      </nav>
    );
  }

  // SidebarPage pads the content by the classic sidebar's width for the same
  // pin state, so the rail takes exactly that width.
  const compact = !isPinned;
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
          {top.map(item => (
            <Fragment key={item.id}>
              <RailItem item={item} compact={compact} />
              {item.id === 'new-session' && !compact && (
                <Box as="li" my="1">
                  <SearchField
                    aria-label="Search"
                    placeholder="Search"
                    size="small"
                    isDisabled
                  />
                </Box>
              )}
            </Fragment>
          ))}
        </ul>
        {!compact && (
          <div className={classes.recent}>
            <RecentSessions />
          </div>
        )}
        <Box pt="2" className={classes.bottom}>
          <ul className={classes.list}>
            {bottom.map(item => (
              <RailItem key={item.id} item={item} compact={compact} />
            ))}
          </ul>
        </Box>
      </Flex>
    </nav>
  );
}
