import { ReactNode, useCallback, useMemo, useState } from 'react';
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
import {
  DateComponent,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { useDeleteSession } from '../../hooks/useDeleteSession';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { useRenameSession } from '../../hooks/useRenameSession';
import { useSessionDetail } from '../../hooks/useSessionDetail';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { sessionsRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { SessionActionsMenu } from './SessionActionsMenu';
import { SessionRenameDialog } from './SessionRenameDialog';
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
  // A real <button>, stripped of its chrome, rather than a click handler on the
  // heading: the title is an editing affordance, and only a button is reachable
  // by keyboard and announced as actionable. Everything visual is inherited so
  // it still reads as the heading it replaced.
  titleButton: {
    appearance: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
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
 * The session can be **renamed** — from the header's actions menu or by clicking the
 * title — and **deleted** from that menu (see "Renaming a session" and "Deleting a
 * session" in docs/agent-platform.md). Continuing a session, which the prototype also
 * offers, is not wired up here.
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

  // Before the reads, because it gates them: a delete is in flight from this very
  // page, and an interval landing between "kagent accepted the delete" and the
  // caller's `navigate()` would 404 and flash "Session not found" at someone who
  // just deleted it deliberately.
  const deletion = useDeleteSession(installation, sessionId);
  const { isUserScoped } = useKagentCapabilities(installation);

  const {
    detail,
    timeline,
    state,
    taskCount,
    hasConversation,
    isLoading,
    isNotFound,
    error,
  } = useSessionDetail(installation, sessionId, {
    enabled: !deletion.isDeleting && !deletion.isDeleted,
  });

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

  // `useDeleteSession`, `useRenameSession` and `useKagentCapabilities` are all called
  // here rather than inside the menu: the menu is rendered in the shared plugin
  // header, which is outside this plugin's `QueryClientProvider`, so a mutation or a
  // query has no client there. The capabilities probe is a cached `/me` read with an
  // hour's staleTime, so asking for it on this page is free.
  const rename = useRenameSession(installation, sessionId);

  // Owned by the page, unlike the delete dialog's state, because two things open
  // this one: the menu item and the title.
  const [isRenameOpen, setRenameOpen] = useState(false);
  const { reset: resetRename } = rename;
  const openRename = useCallback(() => {
    // Clear a previous attempt's error, so the dialog does not open still showing
    // it.
    resetRename();
    setRenameOpen(true);
  }, [resetRename]);

  /** Shared by the heading, the actions menu and both dialogs, so all of them agree. */
  const sessionTitle = row?.title || SESSION_TITLE_FALLBACK;

  // `deletion` is memoized on its own contents, `sessionTitle` is a string and
  // `openRename` is stable, so this element's identity only changes when one of them
  // actually does — which is what keeps the header slot from re-registering (and
  // re-rendering) on every poll.
  const actions = useMemo(
    () =>
      row ? (
        <SessionActionsMenu
          title={sessionTitle}
          deletion={deletion}
          onRename={openRename}
          isUserScoped={isUserScoped}
        />
      ) : null,
    [row, sessionTitle, deletion, openRename, isUserScoped],
  );
  useProvidePageHeaderActions(actions);

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

  // Deliberately not `error ||`: these reads poll, and react-query keeps `data`
  // while setting `error` on a failed *refetch* — which the query client does not
  // retry for ServiceUnavailable/Unauthorized/Forbidden. Treating any error as
  // fatal would let one proxy hiccup replace a rendered conversation with an
  // alert until the next successful poll. With both reads in hand the page renders
  // whatever the last one did, and says so in the notice below.
  //
  // `hasConversation` is not redundant with `!detail`. The two reads fail
  // independently, and a tasks read that fails on *first* load leaves the timeline,
  // turn count and token stats at their zero values while the session read
  // succeeds — which would render "no activity", `Turns 0` and "no messages yet"
  // over a session that has a full conversation. Absent is not empty.
  if (!detail || !row || !hasConversation) {
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
        {/* A refresh that failed after the page had loaded. Shown rather than
            thrown: the conversation on screen is still real, it has just stopped
            keeping up, and the user needs to know which of the two it is. */}
        {error && (
          <Alert
            status="warning"
            title="This session may be out of date"
            description={`The last refresh failed: ${error.message}`}
          />
        )}

        <Flex direction="column" gap="2">
          <BackToSessions>← Sessions</BackToSessions>
          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className={classes.titleButton}
              onClick={openRename}
              // The accessible name has to say what pressing this does, since the
              // visible text is the session's name and says nothing about renaming.
              aria-label={`Rename session "${sessionTitle}"`}
            >
              {/* `as="span"`: Text renders a <p> by default, which is not valid
                  inside a button. */}
              <Text as="span" variant="title-medium">
                {sessionTitle}
              </Text>
            </button>
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

      {/* One dialog for both entry points, rendered here rather than inside the
          menu — react-aria unmounts the menu on selection, and the title could not
          reach it there anyway. */}
      <SessionRenameDialog
        title={sessionTitle}
        isOpen={isRenameOpen}
        onOpenChange={setRenameOpen}
        isRenaming={rename.isRenaming}
        error={rename.error?.message}
        onConfirm={async name => {
          try {
            await rename.renameSession(name);
          } catch {
            // Left to the dialog, which stays open and renders the hook's `error`.
            return;
          }
          setRenameOpen(false);
        }}
        isUserScoped={isUserScoped}
      />
    </Content>
  );
}
