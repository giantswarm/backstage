import { useId, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { RouteFunc, useRouteRef } from '@backstage/frontend-plugin-api';
import { Badge, Box, Flex, Link, Skeleton, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { StatusDot } from '@giantswarm/backstage-plugin-ui-react';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import { sessionDetailRouteRef, sessionsRouteRef } from '../../routes';
import { AgentPlatformProviders } from '../AgentPlatformProviders';
import { useSessions } from '../SessionsDataProvider';
import {
  DEFAULT_RECENT_SESSIONS_LIMIT,
  isWorking,
  needsAttention,
  pickRecentSessions,
} from './helpers';
import { STABLE_CLASS_NAMES } from '../../lib/stableClassNames';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  link: {
    display: 'block',
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
});

export type RecentSessionsProps = {
  /** How many sessions to list. */
  limit?: number;
  /**
   * Puts an "All sessions" link to the sessions list next to the list's
   * label, and a dot before each session whose agent is working.
   */
  shellRail?: boolean;
};

type SessionDetailRoute = RouteFunc<{
  installation: string;
  sessionId: string;
}>;

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
  const labelId = useId();
  const { pathname } = useLocation();
  const { rows, isLoading } = useSessions();
  const recent = useMemo(() => pickRecentSessions(rows, limit), [rows, limit]);
  const installations = useMemo(
    () => Array.from(new Set(recent.map(row => row.installation))).sort(),
    [recent],
  );
  const { states } = useFleetSessionStates(installations);

  let body;
  if (isLoading) {
    body = (
      <Flex direction="column" gap="2" px="2">
        <Skeleton width="100%" height={16} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="90%" height={16} />
      </Flex>
    );
  } else if (recent.length === 0) {
    body = (
      <Box px="2">
        <Text variant="body-small" color="secondary">
          No sessions yet
        </Text>
      </Box>
    );
  } else {
    body = (
      <ul className={classes.list} aria-labelledby={labelId}>
        {recent.map(row => {
          const href = sessionDetailRoute({
            installation: row.installation,
            sessionId: row.sessionId,
          });
          const isActive = pathname === href;
          const waiting = needsAttention(states.get(row.id));
          const working = shellRail && isWorking(states.get(row.id));
          return (
            <li key={row.id}>
              <Link
                href={href}
                className={`${classes.link} ${isActive ? classes.active : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Flex align="center" gap="2">
                  {working && <StatusDot tone="info" aria-label="Working" />}
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
                      <Text
                        as="div"
                        variant="body-x-small"
                        color="secondary"
                        truncate
                      >
                        {row.agentName}
                      </Text>
                    )}
                  </Box>
                  {waiting && (
                    <Badge size="small" title="Waiting for your input">
                      Needs you
                    </Badge>
                  )}
                </Flex>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Flex direction="column" gap="1">
      <Flex px="2" align="center" justify="between" gap="2">
        <Text
          id={labelId}
          variant="body-x-small"
          color="secondary"
          weight="bold"
        >
          Recent
        </Text>
        {allSessionsHref && (
          <Link
            href={allSessionsHref}
            variant="body-x-small"
            aria-current={pathname === allSessionsHref ? 'page' : undefined}
          >
            All sessions
          </Link>
        )}
      </Flex>
      {body}
    </Flex>
  );
}

/**
 * The signed-in user's most recently started sessions across the fleet, each
 * linking to its detail page, with the ones waiting on them marked.
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
