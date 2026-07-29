import { ReactNode, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Avatar, Badge, Box, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';

import { useSessionDetail } from '../../hooks/useSessionDetail';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { sessionsRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import {
  buildAgentIndex,
  SESSION_TITLE_FALLBACK,
  toSessionRow,
} from '../SessionsDataProvider/helpers';
import {
  formatDuration,
  formatTokens,
  SessionTimeline,
} from '../SessionTimeline';

/** Matches the list's row avatar: one line of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 48;

const useStyles = makeStyles(theme => ({
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(4),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  statValue: {
    fontVariantNumeric: 'tabular-nums',
  },
  sessionId: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    wordBreak: 'break-all',
  },
}));

/**
 * Link back to the list.
 *
 * `useRouteRef` returns undefined when the route is not bound — which in practice
 * means the Agent Platform extension is disabled, and then this page isn't
 * rendering either. Rendering nothing is still better than hardcoding the path,
 * which would silently rot if the route moved.
 */
function BackToSessions({ children }: { children: ReactNode }) {
  const sessionsRoute = useRouteRef(sessionsRouteRef);
  if (!sessionsRoute) {
    return null;
  }
  return <Link to={sessionsRoute()}>{children}</Link>;
}

function Stat({ label, value }: { label: string; value: string }) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-small" color="secondary">
        {label}
      </Text>
      <Text variant="title-small" className={classes.statValue}>
        {value}
      </Text>
    </Flex>
  );
}

/**
 * One kagent session: what it was, how it ended, and what the agent did.
 *
 * Read-only. kagent supports renaming, deleting and continuing a session, and the
 * prototype offers all three — none are wired up here, deliberately, so this
 * screen can ship without a write path.
 *
 * What the prototype shows and this cannot, because kagent stores none of it:
 * cost, tokens-per-second, context-window usage, the owning team, the trigger that
 * started the session, a linked work item, produced results, and evaluation. Please
 * don't re-add them speculatively — there is no data behind them.
 */
export function SessionDetailPage() {
  const classes = useStyles();
  const { installation = '', sessionId = '' } = useParams();
  const buildAvatarUrl = useAgentAvatarUrl();

  const { detail, timeline, state, taskCount, isLoading, isNotFound, error } =
    useSessionDetail(installation, sessionId);

  // The same join the list uses, so a session's agent is named identically in both
  // places — and falls back to the same lossy decode when no Agent CR matched.
  const { rows: agentRows } = useAgents();
  const agentRowsKey = agentRows
    .map(agent => `${agent.id}@${agent.name}`)
    .join('|');
  const agentIndex = useMemo(
    () => buildAgentIndex(agentRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentRowsKey],
  );

  const row = useMemo(
    () => (detail ? toSessionRow(detail.session, agentIndex) : undefined),
    [detail, agentIndex],
  );

  if (isLoading) {
    return (
      <Content>
        <Progress aria-label="Loading session" />
      </Content>
    );
  }

  if (isNotFound) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="Session not found"
          description={`No session with this id exists on ${
            installation || 'that installation'
          }. It may have been deleted, or belong to another user — kagent only lets you read your own sessions.`}
          action={<BackToSessions>Back to sessions</BackToSessions>}
        />
      </Content>
    );
  }

  if (error || !detail || !row) {
    return (
      <Content>
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not load this session"
            description={
              error?.message ??
              'kagent returned a response we could not read. The session may still exist.'
            }
          />
          <BackToSessions>Back to sessions</BackToSessions>
        </Flex>
      </Content>
    );
  }

  const avatarUrl = row.agentTechnicalName
    ? buildAvatarUrl(row.installation, row.agentTechnicalName, {
        size: AVATAR_SIZE,
      })
    : undefined;

  return (
    <Content>
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="2">
          <BackToSessions>← Sessions</BackToSessions>
          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            <Text variant="title-medium">
              {row.title || SESSION_TITLE_FALLBACK}
            </Text>
            {/* The raw A2A state is kept as the label for anything we don't
                recognise, so a future kagent state shows as itself. */}
            {state && <Badge size="small">{state.label}</Badge>}
            {!state && <Badge size="small">no activity</Badge>}
          </Flex>

          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            {row.agentName && (
              <Flex align="center" gap="2">
                <Avatar
                  size="small"
                  purpose="decoration"
                  name={row.agentName}
                  src={avatarUrl ?? ''}
                />
                <Text variant="body-medium">{row.agentName}</Text>
              </Flex>
            )}
            <Text variant="body-medium" color="secondary">
              on {row.installation}
            </Text>
          </Flex>

          {/* Absolute, not relative. Both ends of a session are frequently within
              the same day, so the relative form rendered "1 day ago · 1 day ago" —
              identical for two timestamps 34 minutes apart, which told the reader
              nothing. The Duration stat below now carries the span, so an exact
              start time is the more useful thing to show here. The list keeps the
              relative form, where scanning for recency is the point. */}
          <Text variant="body-small" color="secondary">
            Started{' '}
            {row.createdAt ? <DateComponent value={row.createdAt} /> : '—'}
            {' · last activity '}
            {row.updatedAt ? <DateComponent value={row.updatedAt} /> : '—'}
          </Text>

          <Text className={classes.sessionId}>{row.id}</Text>
        </Flex>

        <Box className={classes.stats}>
          <Stat label="Turns" value={String(taskCount)} />
          {/* Wall-clock span, not compute time — kagent records no per-turn
              durations, so this includes however long the user was away between
              turns. */}
          <Stat
            label="Duration"
            value={formatDuration(row.createdAt, row.updatedAt) ?? '—'}
          />
          {/* Labelled "billed", because the raw number is startling: every model
              call re-sends the whole context, so a 4-turn session with a large tool
              catalogue reached 1.4M prompt tokens across 14 calls. That is genuine
              cumulative usage — kagent's own UI sums it the same way — but without
              the label it reads as a bug.
              There is deliberately no combined total: input and output are priced
              differently, so the sum is not a number anyone acts on. */}
          <Stat
            label="Input tokens (billed, cumulative)"
            value={formatTokens(timeline.tokens.prompt)}
          />
          <Stat
            label="Output tokens"
            value={formatTokens(timeline.tokens.completion)}
          />
        </Box>

        <SessionTimeline timeline={timeline} agentName={row.agentName} />
      </Flex>
    </Content>
  );
}
