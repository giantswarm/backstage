import { useId, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { RouteFunc, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Badge,
  Box,
  ButtonIcon,
  Flex,
  Link,
  Skeleton,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { StatusDot, TOUCH_MEDIA } from '@giantswarm/backstage-plugin-ui-react';
import { SESSION_STATE_LABELS } from '@giantswarm/backstage-plugin-agent-platform-common';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { usePinnedSessions } from '../../hooks/usePinnedSessions';
import { ACTIVE_REFETCH_INTERVAL_MS } from '../../lib/kagentSessionPolling';
import { sessionDetailRouteRef, sessionsRouteRef } from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { PinIcon } from '../PinIcon';
import { useSessions } from '../SessionsDataProvider';
import type { SessionRow } from '../SessionsDataProvider';
import { sessionsListSearch } from '../SessionsTable/filters';
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
  // A rail row with a pin toggle: the row, not the link, takes the hover and
  // current-session background, so the highlight spans the rail's width with
  // the pin inside it. The link's hit area stretches over the whole row
  // (`rowLink`), the pin sits above it.
  //
  // The pin button shows on the row's hover and while anything in the row has
  // focus; a pinned row's (filled) pin is always there, and on a touch screen
  // — no hover to reveal it (T22 P10) — every row's is. Hidden with opacity
  // rather than display so it keeps its tab stop and its room in the row.
  item: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 'var(--bui-radius-2)',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
    },
    // The current session keeps its highlight under the pointer.
    '&$active, &$active:hover': {
      background: 'var(--bui-bg-neutral-3)',
    },
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
  // After `link`, whose hover background it takes back.
  rowLink: {
    '&:hover': {
      background: 'transparent',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
    },
    // The focus ring goes round the row, as the highlight does. Inset, so the
    // rail's scroll box does not clip it.
    '&[data-focus-visible]': {
      outline: 'none',
    },
    '&[data-focus-visible]::after': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: -2,
    },
  },
  // Above the row's stretched hit area, so the dot's tooltip (its only
  // visible meaning) is reached by hovering it; a click on it still opens
  // the session, since the dot is inside the link.
  dot: {
    position: 'relative',
    zIndex: 1,
    display: 'inline-flex',
  },
  pin: {
    position: 'relative',
    flex: 'none',
    marginRight: 'var(--bui-space-1)',
    opacity: 0,
    [TOUCH_MEDIA]: {
      opacity: 1,
    },
  },
  pinned: {
    opacity: 1,
  },
  // The waiting count is a badge that links; the badge is the affordance.
  countLink: {
    display: 'inline-flex',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'none',
    },
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
  // With a pin, the row carries the highlight (`item`); without, the link.
  const activeClass = isActive ? classes.active : '';
  return (
    <li className={pin ? `${classes.item} ${activeClass}` : undefined}>
      <Link
        href={href}
        className={
          pin
            ? `${classes.link} ${classes.rowLink}`
            : `${classes.link} ${activeClass}`
        }
        aria-current={isActive ? 'page' : undefined}
      >
        <Flex align="center" gap="2">
          {/* One dot slot, Claude-style: orange when the session waits on the
              person (the louder claim wins), blue while its agent works. The
              states are exclusive by definition — `needsAttention` is the
              awaiting-input states, `isWorking` everything active that isn't.
              A dot with no visible label carries its meaning as a tooltip and
              an accessible name. */}
          {(waiting || working) && (
            <span className={classes.dot}>
              {waiting ? (
                <StatusDot
                  tone="warning"
                  aria-label={NEEDS_INPUT_LABEL}
                  colorVar={sessionStateDotVar('warning')}
                />
              ) : (
                <StatusDot
                  tone="info"
                  aria-label={WORKING_LABEL}
                  colorVar={sessionStateDotVar('info')}
                />
              )}
            </span>
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

function GroupHeader({ id, label }: { id: string; label: string }) {
  return (
    <Box px="2">
      <Text id={id} variant="body-x-small" color="secondary" weight="bold">
        {label}
      </Text>
    </Box>
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

  // Every installation that has a session, not only the listed ones: the rail
  // orders by last activity, which the states carry, so they decide what is
  // listed rather than the other way round.
  const installations = useMemo(
    () => Array.from(new Set(rows.map(row => row.installation))).sort(),
    [rows],
  );
  // The rail is what tells the person a session started needing them, so it
  // polls on the fast tier; the classic home list keeps the baseline.
  const { states } = useFleetSessionStates(
    installations,
    shellRail ? { refetchIntervalMs: ACTIVE_REFETCH_INTERVAL_MS } : undefined,
  );

  // The headings follow the calendar day, so a rail left open past midnight
  // regroups on its next render.
  const now = new Date();
  const today = now.toDateString();
  const pinnedKey = pinnedIds.join(',');
  const grouped = useMemo(
    () =>
      shellRail
        ? groupRailSessions(rows, pinnedIds, limit, now, states)
        : {
            pinned: [],
            pinnedOverflow: 0,
            waiting: [],
            groups: [],
            recentOverflow: 0,
            waitingCount: 0,
          },
    // `now` changes every render; the groups only change with its day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, pinnedKey, limit, shellRail, today, states],
  );
  const recent = useMemo(() => pickRecentSessions(rows, limit), [rows, limit]);

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

  // The list's end, in one place whatever the list holds: the way to the full
  // list, how many sessions wait for the person (T100 H5) and, when the list
  // is cut, how many it holds beyond the rail (T91). The counts sit beside the
  // link rather than in it, so the link's name stays "All sessions" whatever
  // the counts. The waiting count opens the list narrowed to them, as "N more
  // pinned" does for pins.
  const allSessionsLink = allSessionsHref && (
    <Flex px="2" align="center" gap="2">
      <Link
        href={allSessionsHref}
        variant="body-x-small"
        aria-current={pathname === allSessionsHref ? 'page' : undefined}
      >
        All sessions
      </Link>
      {grouped.waitingCount > 0 && (
        <Link
          href={`${allSessionsHref}${sessionsListSearch({ state: 'waiting' })}`}
          aria-label={`${grouped.waitingCount} ${SESSION_STATE_LABELS.waiting.toLowerCase()}`}
          className={classes.countLink}
        >
          <Badge size="small">{`${grouped.waitingCount} waiting`}</Badge>
        </Link>
      )}
      {grouped.recentOverflow > 0 && (
        <Text variant="body-x-small" color="secondary">
          {`${grouped.recentOverflow} more`}
        </Text>
      )}
    </Flex>
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
            <GroupHeader id={`${baseId}-pinned`} label="Pinned" />
            <ul className={classes.list} aria-labelledby={`${baseId}-pinned`}>
              {grouped.pinned.map(renderRow)}
            </ul>
            {/* Past the rail's pin cap, the rest are on All sessions' Pinned
                chip rather than pushing the recent sessions out of view. */}
            {grouped.pinnedOverflow > 0 && allSessionsHref && (
              <Box px="2">
                <Link
                  href={`${allSessionsHref}${sessionsListSearch({
                    state: 'pinned',
                  })}`}
                  variant="body-x-small"
                >
                  {grouped.pinnedOverflow} more pinned
                </Link>
              </Box>
            )}
          </>
        )}
        {/* Sessions waiting for the person stay in view whatever their age
            (T100 H5), above the recency groups. */}
        {grouped.waiting.length > 0 && (
          <>
            <GroupHeader
              id={`${baseId}-waiting`}
              label={SESSION_STATE_LABELS.waiting}
            />
            <ul className={classes.list} aria-labelledby={`${baseId}-waiting`}>
              {grouped.waiting.map(renderRow)}
            </ul>
          </>
        )}
        {grouped.groups.map(group => (
          <Flex key={group.id} direction="column" gap="1">
            <GroupHeader id={`${baseId}-${group.id}`} label={group.label} />
            <ul
              className={classes.list}
              aria-labelledby={`${baseId}-${group.id}`}
            >
              {group.rows.map(renderRow)}
            </ul>
          </Flex>
        ))}
        {grouped.pinned.length === 0 &&
          grouped.waiting.length === 0 &&
          !hasTimeGroups && (
            <>
              <GroupHeader id={`${baseId}-empty`} label="Sessions" />
              <Box px="2">
                <Text variant="body-small" color="secondary">
                  No sessions yet
                </Text>
              </Box>
            </>
          )}
        {allSessionsLink}
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
 * shell rail it is the rail's session list instead — pinned first, then every
 * session waiting for the person, then the most recently *active*, closed by
 * the All sessions link; the full rule is `groupRailSessions`'.
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
    </AgentPlatformProviders>
  );
}
