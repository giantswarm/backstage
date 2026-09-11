import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Box, Flex, SearchField, Text } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useCreateSession } from '../../hooks/useCreateSession';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { SESSIONS_NOUN } from '../../lib/installationGroups';
import { sessionDetailRouteRef } from '../../routes';
import { AgentRow, useAgents } from '../AgentsDataProvider';
import { FirstAgentCard } from '../FirstAgentCard';
import {
  InstallationGroups,
  InstallationScopeNote,
  useGroupedByInstallation,
} from '../InstallationGroups';
import { isStartableAgent, NewSessionComposer } from '../NewSessionComposer';
import { NotReachableInstallationsNote } from '../NotReachableInstallationsNote';
import {
  SessionsDataProvider,
  sessionSearchFn,
  useSessions,
} from '../SessionsDataProvider';
import { SessionsMigrationNotice } from '../SessionsMigrationNotice';
import { SessionsTable } from '../SessionsTable';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/**
 * Start a new session, above the list.
 *
 * Inline rather than behind a button, and with no header action, because this
 * list is the spec's "Mine" scope — the one place the prototype embeds the
 * composer instead: creating is the job of one's own-work view, so it is always
 * present. (kagent scopes sessions to the signed-in user, which is what makes
 * this list Mine; see the blurb below.)
 *
 * Withheld with a reason when the fleet offers no agent at all. An inert prompt
 * box that refuses every Start would be worse than saying why.
 *
 * With `firstRun` -- no session on the fleet yet -- the composer is the whole
 * screen rather than a strip above a list, so it comes out of its collapsed
 * strip and into the same invitation card the Agents tab uses. There is no list
 * below it to compete with.
 */
function StartNewSession({ firstRun }: { firstRun: boolean }) {
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const {
    rows: agents,
    installations: agentInstallations,
    isLoading: isLoadingAgents,
    isLoadingMore: isLoadingMoreAgents,
    unreachableInstallations,
  } = useAgents();
  const { lastUsedAgent, rememberAgent } = useLastUsedAgent(agents);
  const creation = useCreateSession();

  const { createSession } = creation;
  const onStart = useCallback(
    async (agent: AgentRow, prompt: string) => {
      let sessionId: string;
      try {
        sessionId = await createSession({ agent, prompt });
      } catch {
        // Left to the composer, which renders the hook's `error` beside the
        // prompt the user still has.
        return;
      }

      rememberAgent(agent);

      const href = sessionDetailRoute?.({
        installation: agent.installation,
        sessionId,
      });
      if (!href) {
        // Only reachable with the route unbound, which means the Agent Platform
        // extension is disabled — and then this is not rendering either. The
        // session exists regardless, so there is nothing to undo.
        return;
      }

      // The prompt is **not** sent here. It travels with the navigation and is
      // dispatched by the session detail page, so the user lands on the
      // conversation immediately instead of waiting out a turn on this screen.
      // See "Starting a session" in docs/agent-platform.md.
      navigate(href, {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: prompt,
            agentNamespace: agent.namespace,
            // The technical name: it is what addresses the agent's A2A
            // endpoint. The display name is an annotation.
            agentName: agent.technicalName,
          },
        },
      });
    },
    [createSession, navigate, rememberAgent, sessionDetailRoute],
  );

  if (isLoadingAgents) {
    return null;
  }

  // The same predicate the picker filters on, so the composer is never offered with
  // an empty dropdown and never withheld while a usable agent exists.
  const startable = agents.filter(isStartableAgent);

  if (startable.length === 0) {
    // Nothing is deployed, the fleet answered, and there is somewhere to deploy
    // to: this is the first-run state, and it is the Agents tab's invitation
    // rather than a sentence about sessions -- creating an agent is the step
    // before any session exists.
    if (
      agents.length === 0 &&
      unreachableInstallations.length === 0 &&
      agentInstallations.length > 0
    ) {
      return <FirstAgentCard />;
    }

    // Three distinct situations, and conflating them would tell the user to look
    // in the wrong place: nothing could be read (look at the warning), nothing
    // is deployed and there is nowhere to deploy to either (an installation
    // scope that runs no kagent -- `InstallationScopeNote` says so), or
    // something is deployed but none of it is ready (look at the Agents tab,
    // where the reason is).
    let reason: string;
    if (unreachableInstallations.length > 0 && agents.length === 0) {
      reason =
        'No agents could be read, so there is none to start a session with. See the warning below.';
    } else if (agents.length === 0) {
      reason =
        'No agents are deployed on the reachable installations, so there is none to start a session with.';
    } else {
      reason =
        agents.length === 1
          ? 'The only agent on the fleet is not ready, so there is none to start a session with. The Agents tab says why.'
          : `None of the ${agents.length} agents on the fleet are ready, so there is none to start a session with. The Agents tab says why.`;
    }

    return (
      <Text variant="body-small" color="secondary">
        {reason}
      </Text>
    );
  }

  const composer = (
    <NewSessionComposer
      agents={agents}
      isLoadingAgents={isLoadingMoreAgents}
      defaultAgent={lastUsedAgent}
      // Collapsed only when it sits above a list of sessions. On first run it
      // is the invitation, so it opens showing the agent picker and the Start
      // button -- there is nothing for it to make room for.
      collapsible={!firstRun}
      isStarting={creation.isCreating}
      error={creation.error?.message}
      onStart={onStart}
    />
  );

  if (firstRun) {
    return (
      <EmptyStateCard
        title="Start your first session"
        description="Pick an agent, say what you need, and the conversation opens as soon as it starts."
      >
        {composer}
      </EmptyStateCard>
    );
  }

  return (
    <Flex direction="column" gap="2">
      <Text as="h2" variant="title-x-small">
        Start a new session
      </Text>
      {composer}
    </Flex>
  );
}

// Content of the "Sessions" tab. The section header + tabs come from the Agent
// Platform page (GSPageLayout), so this renders content only. The one write it
// offers — starting a session — is inline rather than a header action, so no
// actions are provided.
function SessionsIndexPageContent() {
  const {
    rows,
    groups,
    installations,
    isLoading,
    isLoadingMore,
    hasInstallations,
    unreachableInstallations,
    notUserScopedInstallations,
    notReachableInstallations,
  } = useSessions();
  // The agents fan-out is a second, independent load: the sessions can settle
  // long before it, and on first run the composer is all there is to show.
  const { isLoading: isLoadingAgents } = useAgents();
  // Under "All installations" on a multi-installation portal the rows render
  // as one group per installation, home first, and the search field moves up
  // here so one search covers every group; a pinned scope and a
  // single-installation portal keep the flat table with its own search.
  const grouped = useGroupedByInstallation();
  const [search, setSearch] = useState('');
  // Which container the composer mounts in, decided once — see the latch below.
  // Declared up here because the `hasInstallations` guard returns early.
  const firstRunRef = useRef<boolean | undefined>(undefined);
  const searchedGroups = useMemo(
    () =>
      groups.map(group => ({
        ...group,
        rows: sessionSearchFn(group.rows, search),
      })),
    [groups, search],
  );

  if (!isLoading && !hasInstallations) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="No installations configured"
          description="Sessions are read from kagent on your management clusters, but no installations are configured for this instance."
        />
      </Content>
    );
  }

  // The fleet has settled with nothing: `isLoading` is only true while no rows
  // exist yet. So an empty list here is the final answer -- though not
  // necessarily "you have never had a session", which is the stronger claim
  // below.
  const isEmpty = !isLoading && rows.length === 0;

  // The installations actually asked: the scoped kagent ones minus the ones the
  // backend never queried because it cannot reach them.
  const queriedInstallations = installations.filter(
    installation => !notReachableInstallations.includes(installation),
  );

  // "You have never started a session" needs more than an empty list. A read
  // that failed is not an empty fleet -- the same line the Agents tab draws --
  // and neither is a scope whose every kagent endpoint is unreachable from this
  // portal, where nothing was ever asked. Note this is deliberately *not*
  // `notReachableInstallations.length === 0`: on a portal that can reach one
  // installation and not five others, the one that answered is enough to know
  // the user has no sessions, and the quiet note below names the rest.
  const invitesFirstSession =
    isEmpty &&
    unreachableInstallations.length === 0 &&
    queriedInstallations.length > 0;

  // Latch the container at the first settled answer, and never re-read it.
  //
  // `StartNewSession` returns a card root on first run and a `Flex` root
  // otherwise. Flipping between them changes the root element type, so React
  // unmounts the subtree and mounts a fresh `NewSessionComposer` -- discarding
  // whatever the user had typed. On a genuinely empty fleet that flip is not
  // hypothetical: `isLoading` stays true until every installation answers, so
  // the composer would render inline for the whole fan-out and then jump into
  // the card. Deciding once, after the list settles, is what keeps the prompt.
  if (firstRunRef.current === undefined && !isLoading) {
    firstRunRef.current = invitesFirstSession;
  }
  const firstRun = firstRunRef.current === true;

  return (
    <Content>
      <Flex direction="column" gap="3">
        {/* The "only your own" reassurance is dropped when any installation
            reports that its kagent does not identify individual users —
            otherwise the page would promise it at the top and contradict itself
            in the warning below the table, and the reassuring claim is the one
            read first.

            Dropped entirely on first run: describing a list that isn't there
            competes with the invitation, which is the whole screen then. */}
        {!invitesFirstSession && (
          <Text color="secondary">
            {notUserScopedInstallations.length > 0
              ? 'Agent chat sessions across the management clusters.'
              : 'Your agent chat sessions across the management clusters. kagent scopes sessions to the signed-in user, so only your own are listed.'}
          </Text>
        )}

        {/* Conversations from before the move to kagent API v2 are not here
            (plan decision D9). Said before the list, so an empty or short one
            is explained rather than puzzled over; dismissible, because it is
            true forever and interesting once. Withheld while loading, like the
            composer, so the tab does not flash it over a spinner. */}
        {!isLoading && <SessionsMigrationNotice />}

        {/* Withheld until the list settles, so `firstRun` is known before the
            composer mounts -- see the latch above. */}
        {!isLoading && <StartNewSession firstRun={firstRun} />}

        <InstallationScopeNote component="kagent" />

        {/* No rows yet — show activity instead of an empty table skeleton.
            Also while the agents are still resolving on an empty list: the
            composer is withheld until they are in, the blurb and table are
            gated off, and without this the tab would render nothing at all. */}
        {(isLoading || (isEmpty && isLoadingAgents)) && (
          <Progress aria-label="Loading sessions" />
        )}

        {/* An empty fleet gets no list at all, rather than an empty table (or,
            under "All installations", a stack of headings each saying "no
            sessions here") beneath the invitation above. */}
        {!isLoading && !isEmpty && (
          <>
            {/* Rows are in, but more installations are still resolving. */}
            {isLoadingMore && (
              <LinearProgress aria-label="Loading more sessions" />
            )}

            <Box>
              {grouped ? (
                <Flex direction="column" gap="3">
                  <SearchField
                    aria-label="Search sessions"
                    placeholder="Search by session, agent, or installation"
                    value={search}
                    onChange={setSearch}
                  />
                  <InstallationGroups
                    groups={searchedGroups}
                    noun={SESSIONS_NOUN}
                    renderRows={groupRows => (
                      <SessionsTable rows={groupRows} showSearch={false} />
                    )}
                    fallback={<SessionsTable rows={[]} showSearch={false} />}
                  />
                </Flex>
              ) : (
                <SessionsTable rows={rows} />
              )}
            </Box>
          </>
        )}

        {/* Only ever shown for an explicit `false` from the identity probe: an
            installation whose kagent runs in `unsecure` mode ignores the
            forwarded token and answers for a shared built-in user, so the rows
            above are not this user's. An unresolved or subject-less probe is
            "unknown" and stays silent — warning there would flag a healthy
            installation for no reason. */}
        {notUserScopedInstallations.length > 0 && (
          <Alert
            status="warning"
            title="Some sessions are not scoped to you"
            description={`kagent on ${notUserScopedInstallations.join(
              ', ',
            )} is not configured to identify individual users, so sessions from those installations are shared rather than yours alone.`}
          />
        )}

        {/* Rendered regardless of the loading branch so a fleet whose only
            reachable installations all error still surfaces the failure instead
            of an indefinite progress bar. */}
        <UnreachableInstallationsAlert
          installations={unreachableInstallations}
          resourceName="Sessions"
        />

        {/* Installations that run kagent but whose endpoint the portal cannot
            reach (the backend's unauthenticated probe says so). Never queried,
            so not a read failure and not something to retry: a quiet line, not
            a warning card. */}
        <NotReachableInstallationsNote
          installations={notReachableInstallations}
        />
      </Flex>
    </Content>
  );
}

/**
 * The Sessions list, and the composer that starts a new one.
 *
 * `QueryClientProvider`, `ModelConfigsProvider` and `AgentsDataProvider` are
 * mounted by `SessionsRouter` rather than here, so this screen and the session
 * detail share one query cache and one fleet-wide Agent list — opening a session
 * then reuses the agents already loaded for this list, and so does the composer's
 * agent picker.
 *
 * Only `SessionsDataProvider` is local, because only this screen fans out across
 * the fleet: the detail page reads one installation, named in its own route.
 */
export function SessionsIndexPage() {
  return (
    <SessionsDataProvider>
      <SessionsIndexPageContent />
    </SessionsDataProvider>
  );
}
