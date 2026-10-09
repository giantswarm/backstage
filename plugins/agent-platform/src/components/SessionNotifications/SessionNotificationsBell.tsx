import { useMemo, useRef, useState } from 'react';
import { Link } from '@backstage/core-components';
import { RouteFunc, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Badge,
  Button,
  ButtonIcon,
  Flex,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import NotificationsNoneIcon from '@material-ui/icons/NotificationsNone';
import {
  DateComponent,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { useSessionNotifications } from '../../hooks/useSessionNotifications';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../../lib/kagentSessionPolling';
import { sessionStateDotVar } from '../../lib/stableClassNames';
import { sessionDetailRouteRef } from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { needsAttention } from '../RecentSessions/helpers';
import { useSessions } from '../SessionsDataProvider';
import type { SessionRow } from '../SessionsDataProvider';

const useStyles = makeStyles({
  trigger: {
    position: 'relative',
  },
  iconWrap: {
    position: 'relative',
    display: 'inline-flex',
    flex: 'none',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    borderRadius: 999,
    // The solid intent pair: a filled counter, not a subdued chip.
    background: 'var(--bui-negative-bg, #d92d3a)',
    color: 'var(--bui-negative-fg, #ffffff)',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: '16px',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  // Narrow enough for a 375px viewport with the pane's own padding.
  panel: {
    width: 'min(400px, calc(100vw - 32px))',
    maxHeight: 'min(480px, calc(100vh - 96px))',
    display: 'flex',
    flexDirection: 'column',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 2,
    borderTop: '1px solid var(--bui-border-1)',
    padding: 'var(--bui-space-1) 0',
  },
  rowLink: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--bui-space-2)',
    padding: 'var(--bui-space-1) var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    textDecoration: 'none',
    color: 'var(--bui-fg-primary)',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      textDecoration: 'none',
    },
  },
  rowDot: {
    flex: 'none',
    marginTop: 6,
  },
  rowText: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rowMenu: {
    flex: 'none',
    marginTop: 4,
  },
});

export type SessionNotificationsBellProps = {
  /** Icon-only trigger, for the collapsed rail and the mobile bar. */
  compact?: boolean;
  /** The trigger's look — the rail passes its own item styling. */
  className?: string;
};

type SessionDetailRoute = RouteFunc<{
  installation: string;
  sessionId: string;
}>;

type AttentionItem = {
  row: SessionRow;
  /** Epoch ms the session started waiting, when the summary says. */
  changedAt?: number;
};

/** Whether the notification's newest state change was acknowledged. */
function isSeen(changedAt: number | undefined, readAt: number | undefined) {
  if (readAt === undefined) {
    return false;
  }
  return (changedAt ?? 0) <= readAt;
}

function NotificationRow({
  item,
  href,
  seen,
  muted,
  onOpen,
  onToggleMute,
  onToggleRead,
}: {
  item: AttentionItem;
  href: string;
  seen: boolean;
  muted: boolean;
  onOpen: () => void;
  onToggleMute: () => void;
  onToggleRead: () => void;
}) {
  const classes = useStyles();
  const { row, changedAt } = item;
  return (
    <li className={classes.row}>
      <Link to={href} className={classes.rowLink} onClick={onOpen}>
        <span className={classes.rowDot}>
          {!seen && !muted ? (
            <StatusDot
              tone="info"
              aria-label="Unread"
              colorVar={sessionStateDotVar('info')}
            />
          ) : (
            // Keeps the titles aligned whether or not the dot shows.
            <span style={{ display: 'inline-block', width: 8 }} aria-hidden />
          )}
        </span>
        <span className={classes.rowText}>
          <Flex align="center" gap="2">
            <Text
              variant="body-small"
              weight={seen ? 'regular' : 'bold'}
              truncate
              style={{ minWidth: 0 }}
            >
              {row.title}
            </Text>
            {muted && (
              <Badge size="small" style={{ flexShrink: 0 }}>
                Muted
              </Badge>
            )}
          </Flex>
          <Text variant="body-x-small" color="secondary" truncate>
            {row.agentName ? `${row.agentName} · ` : ''}
            Waiting for your input
            {changedAt !== undefined && (
              <>
                {' · '}
                <DateComponent value={new Date(changedAt)} relative />
              </>
            )}
          </Text>
        </span>
      </Link>
      <span className={classes.rowMenu}>
        <MenuTrigger>
          <ButtonIcon
            variant="tertiary"
            size="small"
            icon={<MoreHorizIcon />}
            aria-label={`More actions for “${row.title}”`}
          />
          <Menu>
            <MenuItem onAction={onToggleMute}>
              {muted ? 'Unmute this session' : 'Mute this session'}
            </MenuItem>
            <MenuItem onAction={onToggleRead}>
              {seen ? 'Mark as unread' : 'Mark as read'}
            </MenuItem>
          </Menu>
        </MenuTrigger>
      </span>
    </li>
  );
}

function BellContent({
  sessionDetailRoute,
  compact,
  className,
}: SessionNotificationsBellProps & {
  sessionDetailRoute: SessionDetailRoute;
}) {
  const classes = useStyles();
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { rows } = useSessions();
  const installations = useMemo(
    () => Array.from(new Set(rows.map(row => row.installation))).sort(),
    [rows],
  );
  // The bell exists to say a session started needing the person, so it polls
  // the derived states on the fast tier; the interval pauses while the tab is
  // hidden (react-query's `refetchIntervalInBackground` default). There is no
  // push path — see the iteration-1 gap register (G5).
  const { states } = useFleetSessionStates(installations, {
    refetchIntervalMs: ACTIVE_REFETCH_INTERVAL_MS,
  });
  const { isMuted, toggleMute, readAtOf, markRead, markUnread, markAllRead } =
    useSessionNotifications();

  // The sessions waiting on the person, the newest wait first. Muted ones stay
  // listed (labeled, excluded from the badge): a mute silences the counter,
  // it does not hide that the session is waiting.
  const items = useMemo((): AttentionItem[] => {
    return rows
      .filter(row => needsAttention(states.get(row.id)))
      .map(row => {
        const changedAt = states.get(row.id)?.changedAt;
        return changedAt === undefined ? { row } : { row, changedAt };
      })
      .sort((a, b) => {
        if (a.changedAt === b.changedAt) {
          return a.row.title.localeCompare(b.row.title);
        }
        if (a.changedAt === undefined) return 1;
        if (b.changedAt === undefined) return -1;
        return b.changedAt - a.changedAt;
      });
  }, [rows, states]);

  const unreadCount = items.filter(
    item =>
      !isMuted(item.row.id) && !isSeen(item.changedAt, readAtOf(item.row.id)),
  ).length;

  const markAll = () =>
    markAllRead(
      items.map(item => ({
        id: item.row.id,
        ...(item.changedAt === undefined ? {} : { at: item.changedAt }),
      })),
    );

  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`${classes.trigger} ${className ?? ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        title={compact ? 'Notifications' : undefined}
        onClick={() => setOpen(open => !open)}
      >
        <Flex align="center" gap="2">
          <span className={classes.iconWrap}>
            <NotificationsNoneIcon fontSize="small" />
            {unreadCount > 0 && (
              <span className={classes.badge} aria-hidden="true">
                {badgeText}
              </span>
            )}
          </span>
          {!compact && <Text variant="body-medium">Notifications</Text>}
        </Flex>
      </button>
      <Popover
        triggerRef={triggerRef}
        isOpen={isOpen}
        onOpenChange={setOpen}
        placement="top start"
        // A press on the trigger is the trigger's own toggle, not an outside
        // interaction — without this the overlay closes on pointer-down and
        // the trigger's click re-opens it, so the bell could never be closed
        // from its own button.
        shouldCloseOnInteractOutside={element =>
          !triggerRef.current?.contains(element)
        }
      >
        <div role="dialog" aria-label="Notifications" className={classes.panel}>
          <Flex align="center" justify="between" gap="2" pb="2">
            <Text variant="body-medium" weight="bold">
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Button variant="tertiary" size="small" onPress={markAll}>
                Mark all read
              </Button>
            )}
          </Flex>
          {items.length === 0 ? (
            <Flex direction="column" gap="1" py="3">
              <Text variant="body-small" weight="bold">
                Nothing needs you right now
              </Text>
              <Text variant="body-x-small" color="secondary">
                Sessions waiting for your input show up here.
              </Text>
            </Flex>
          ) : (
            <ul className={classes.list} aria-label="Sessions needing you">
              {items.map(item => {
                const id = item.row.id;
                const seen = isSeen(item.changedAt, readAtOf(id));
                const href = sessionDetailRoute({
                  installation: item.row.installation,
                  sessionId: item.row.sessionId,
                });
                return (
                  <NotificationRow
                    key={id}
                    item={item}
                    href={href}
                    seen={seen}
                    muted={isMuted(id)}
                    onOpen={() => {
                      // Opening the session is acknowledging it.
                      markRead(id, item.changedAt);
                      setOpen(false);
                    }}
                    onToggleMute={() => toggleMute(id)}
                    onToggleRead={() =>
                      seen ? markUnread(id) : markRead(id, item.changedAt)
                    }
                  />
                );
              })}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
}

/**
 * The rail's notification bell: an unread badge, and a panel listing the
 * sessions waiting for the person's input — each linking to its session, with
 * per-session mute and mark-read and a "Mark all read".
 *
 * Everything is derived from the polled `session-states` summary; the portal
 * has no push path (gap G5), so a hidden tab learns of a waiting session when
 * it next becomes visible. Mute and read markers persist per user through
 * `useSessionNotifications`.
 *
 * Mounts its own data providers, like `RecentSessions`. Renders nothing when
 * the session detail route is not bound, which is the case when the Agent
 * Platform page is disabled.
 */
export function SessionNotificationsBell(props: SessionNotificationsBellProps) {
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  if (!sessionDetailRoute) {
    return null;
  }
  return (
    <AgentPlatformProviders>
      <BellContent sessionDetailRoute={sessionDetailRoute} {...props} />
    </AgentPlatformProviders>
  );
}
