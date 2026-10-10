import { ReactNode, useId, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { RouteFunc, useRouteRef } from '@backstage/frontend-plugin-api';
import { Box, ButtonIcon, Flex, Link, Skeleton, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { StatusDot } from '@giantswarm/backstage-plugin-ui-react';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { usePinnedSessions } from '../../hooks/usePinnedSessions';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../../lib/kagentSessionPolling';
import { sessionDetailRouteRef, sessionsRouteRef } from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { NeedsInputToasts } from '../NeedsInputToasts';
import { PinIcon } from '../PinIcon';
import { useSessions } from '../SessionsDataProvider';
import type { SessionRow } from '../SessionsDataProvider';
import {
  DEFAULT_RECENT_SESSIONS_LIMIT,
  groupRailSessions,
  isWorking,
  needsAttention,
  pickRecentSessions,
} from './helpers';
import {
  sessionStateDotVar,
  STABLE_CLASS_NAMES,
} from '../../lib/stableClassNames';

/** The dots' tooltips and accessible names, shared with the tests. */
export const NEEDS_INPUT_LABEL = 'Needs your input';
export const WORKING_LABEL = 'Working';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  // The pin button shows on the row's hover and while anything in the row has
  // focus; a pinned row's (filled) pin is always there. Hidden with opacity
  // rather than display so it keeps its tab stop and its room in the row.
  item: {
    display: 'flex',
    alignItems: 'center',
    '&:hover $pin, &:focus-within $pin': {
      opacity: 1,
    },
  },
  link: {
    display: 'block',
    flex: '1 1 auto',
    minWidth: 0,
    padding: 'var(--bui-space-1) var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    textDecoration: 'none',
    color: 'var(--bui-fg-primary)',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      textDecoration: 'none',
    },
  },
  active: {
    background: 'var(--bui-bg-neutral-3)',
  },
  pin: {
    flex: 'none',
    opacity: 0,
  },
  pinned: {
    opacity: 1,
  },
});

export type RecentSessionsProps = {
  /** How many sessions to list, the pinned ones not counted. */
  limit?: number;
  /**
   * The agent-platform shell's rail history: the pinned sessions above the
   * recent ones under the prototype's time headings, a pin toggle on each row,
   * an "All sessions" link, a dot before each session whose agent is working —
   * and the states polled on the fast tier, since the rail is what tells the
   * person something started needing them. Off, it is the classic flat
   * "Recent" list.
   */
  shellRail?: boolean;
};

type SessionDetailRoute = RouteFunc<{
  installation: string;
  sessionId: string;
}>;

function SessionItem({
  row,
  href,
  isActive,
  waiting,
  working,
  pin,
}: {
  row: SessionRow;
  href: string;
  isActive: boolean;
  waiting: boolean;
  working: boolean;
  /** The row's pin toggle; absent outside the shell rail. */
  pin?: { isPinned: boolean; onToggle: () => void };
}) {
  const classes = useStyles();
  return (
    <li className={pin ? classes.item : undefined}>
      <Link
        href={href}
        className={`${classes.link} ${isActive ? classes.active : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <Flex align="center" gap="2">
          {/* One dot slot, Claude-style: orange when the session waits on the
              person (the louder claim wins), blue while its agent works. The
              states are exclusive by definition — `needsAttention` is the
              awaiting-input states, `isWorking` everything active that isn't.
              A dot with no visible label carries its meaning as a tooltip and
              an accessible name. */}
          {waiting ? (
            <StatusDot
              tone="warning"
              aria-label={NEEDS_INPUT_LABEL}
              colorVar={sessionStateDotVar('warning')}
            />
          ) : (
            working && (
              <StatusDot
                tone="info"
                aria-label={WORKING_LABEL}
                colorVar={sessionStateDotVar('info')}
              />
            )
          )}
          <Box grow minWidth="0">
            <Text
              as="div"
              variant="body-small"
              weight={waiting ? 'bold' : 'regular'}
              truncate
              className={STABLE_CLASS_NAMES.recentSessionTitle}
            >
              {row.title}
            </Text>
            {row.agentName && (
              <Text as="div" variant="body-x-small" color="secondary" truncate>
                {row.agentName}
              </Text>
            )}
          </Box>
        </Flex>
      </Link>
      {pin && (
        <span
          className={`${classes.pin} ${pin.isPinned ? classes.pinned : ''}`}
        >
          <ButtonIcon
            variant="tertiary"
            size="small"
            icon={<PinIcon filled={pin.isPinned} size={14} />}
            aria-pressed={pin.isPinned}
            aria-label={
              pin.isPinned ? `Unpin “${row.title}”` : `Pin “${row.title}”`
            }
            onPress={pin.onToggle}
          />
        </span>
      )}
    </li>
  );
}

function GroupHeader({
  id,
  label,
  trailing,
}: {
  id: string;
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <Flex px="2" align="center" justify="between" gap="2">
      <Text id={id} variant="body-x-small" color="secondary" weight="bold">
        {label}
      </Text>
      {trailing}
    </Flex>
  );
}

function RecentSessionsList({
  limit,
  sessionDetailRoute,
  shellRail,
}: {
  limit: number;
  sessionDetailRoute: SessionDetailRoute;
  shellRail: boolean;
}) {
  const classes = useStyles();
  const sessionsRoute = useRouteRef(sessionsRouteRef);
  const allSessionsHref = shellRail ? sessionsRoute?.() : undefined;
  const baseId = useId();
  const { pathname } = useLocation();
  const { rows, isLoading } = useSessions();
  const { pinnedIds, isPinned, togglePin } = usePinnedSessions();

  // The headings follow the calendar day, so a rail left open past midnight
  // regroups on its next render.
  const now = new Date();
  const today = now.toDateString();
  const pinnedKey = pinnedIds.join(',');
  const grouped = useMemo(
    () =>
      shellRail
        ? groupRailSessions(rows, pinnedIds, limit, now)
        : { pinned: [], groups: [] },
    // `now` changes every render; the groups only change with its day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, pinnedKey, limit, shellRail, today],
  );
  const recent = useMemo(() => pickRecentSessions(rows, limit), [rows, limit]);

  const listed = shellRail
    ? [...grouped.pinned, ...grouped.groups.flatMap(group => group.rows)]
    : recent;
  const installations = useMemo(
    () => Array.from(new Set(listed.map(row => row.installation))).sort(),
    // Keyed on contents — `listed` is derived fresh every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listed.map(row => row.installation).join(',')],
  );
  // The rail is what tells the person a session started needing them, so it
  // polls on the fast tier; the classic home list keeps the baseline.
  const { states } = useFleetSessionStates(
    installations,
    shellRail ? { refetchIntervalMs: ACTIVE_REFETCH_INTERVAL_MS } : undefined,
  );

  const renderRow = (row: SessionRow) => {
    const href = sessionDetailRoute({
      installation: row.installation,
      sessionId: row.sessionId,
    });
    return (
      <SessionItem
        key={row.id}
        row={row}
        href={href}
        isActive={pathname === href}
        waiting={needsAttention(states.get(row.id))}
        working={shellRail && isWorking(states.get(row.id))}
        pin={
          shellRail
            ? {
                isPinned: isPinned(row.id),
                onToggle: () => togglePin(row.id),
              }
            : undefined
        }
      />
    );
  };

  const allSessionsLink = allSessionsHref && (
    <Link
      href={allSessionsHref}
      variant="body-x-small"
      aria-current={pathname === allSessionsHref ? 'page' : undefined}
    >
      All sessions
    </Link>
  );

  if (isLoading) {
    return (
      <Flex direction="column" gap="2" px="2">
        <Skeleton width="100%" height={16} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="90%" height={16} />
      </Flex>
    );
  }

  if (shellRail) {
    const hasTimeGroups = grouped.groups.length > 0;
    return (
      <Flex direction="column" gap="1">
        {grouped.pinned.length > 0 && (
          <>
            <GroupHeader
              id={`${baseId}-pinned`}
              label="Pinned"
              // The prototype keeps "All sessions" on the first time heading;
              // it only moves up here when there is no time group to carry it.
              trailing={hasTimeGroups ? undefined : allSessionsLink}
            />
            <ul className={classes.list} aria-labelledby={`${baseId}-pinned`}>
              {grouped.pinned.map(renderRow)}
            </ul>
          </>
        )}
        {grouped.groups.map((group, index) => (
          <Flex key={group.id} direction="column" gap="1">
            <GroupHeader
              id={`${baseId}-${group.id}`}
              label={group.label}
              trailing={index === 0 ? allSessionsLink : undefined}
            />
            <ul
              className={classes.list}
              aria-labelledby={`${baseId}-${group.id}`}
            >
              {group.rows.map(renderRow)}
            </ul>
          </Flex>
        ))}
        {grouped.pinned.length === 0 && !hasTimeGroups && (
          <>
            <Flex px="2" align="center" justify="between" gap="2">
              <Text variant="body-x-small" color="secondary" weight="bold">
                Sessions
              </Text>
              {allSessionsLink}
            </Flex>
            <Box px="2">
              <Text variant="body-small" color="secondary">
                No sessions yet
              </Text>
            </Box>
          </>
        )}
      </Flex>
    );
  }

  let body;
  if (recent.length === 0) {
    body = (
      <Box px="2">
        <Text variant="body-small" color="secondary">
          No sessions yet
        </Text>
      </Box>
    );
  } else {
    body = (
      <ul className={classes.list} aria-labelledby={`${baseId}-recent`}>
        {recent.map(renderRow)}
      </ul>
    );
  }

  return (
    <Flex direction="column" gap="1">
      <GroupHeader id={`${baseId}-recent`} label="Recent" />
      {body}
    </Flex>
  );
}

/**
 * The signed-in user's most recently started sessions across the fleet, each
 * linking to its detail page, with the ones waiting on them marked. In the
 * shell rail the pinned sessions lead, under their own heading.
 *
 * Mounts its own data providers. Renders nothing when the session detail route
 * is not bound, which is the case when the Agent Platform page is disabled.
 */
export function RecentSessions({
  limit = DEFAULT_RECENT_SESSIONS_LIMIT,
  shellRail = false,
}: RecentSessionsProps) {
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  if (!sessionDetailRoute) {
    return null;
  }
  return (
    <AgentPlatformProviders>
      <RecentSessionsList
        limit={limit}
        sessionDetailRoute={sessionDetailRoute}
        shellRail={shellRail}
      />
      {/* The shell rail is mounted once, wherever the person is in the
          shell — which makes it the place to watch for a session starting to
          wait on them. Classic chrome keeps its quieter list. */}
      {shellRail && (
        <NeedsInputToasts sessionDetailRoute={sessionDetailRoute} />
      )}
    </AgentPlatformProviders>
  );
}
