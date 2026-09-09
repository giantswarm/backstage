import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Box, Flex, SearchField, Text } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';

import { useCreateSession } from '../../hooks/useCreateSession';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { SESSIONS_NOUN } from '../../lib/installationGroups';
import { sessionDetailRouteRef } from '../../routes';
import { AgentRow, useAgents } from '../AgentsDataProvider';
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
 */
function StartNewSession() {
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const {
    rows: agents,
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
    // Three distinct situations, and conflating them would tell the user to look in
    // the wrong place: nothing could be read (look at the warning), nothing is
    // deployed (deploy one), or something is deployed but none of it is ready (look
    // at the Agents tab, where the reason is).
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

  return (
    <Flex direction="column" gap="2">
      <Text as="h2" variant="title-x-small">
        Start a new session
      </Text>
      <NewSessionComposer
        agents={agents}
        isLoadingAgents={isLoadingMoreAgents}
        defaultAgent={lastUsedAgent}
        collapsible
        isStarting={creation.isCreating}
        error={creation.error?.message}
        onStart={onStart}
      />
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
    isLoading,
    isLoadingMore,
    hasInstallations,
    unreachableInstallations,
    notUserScopedInstallations,
    notReachableInstallations,
  } = useSessions();
  // Under "All installations" on a multi-installation portal the rows render
  // as one group per installation, home first, and the search field moves up
  // here so one search covers every group; a pinned scope and a
  // single-installation portal keep the flat table with its own search.
  const grouped = useGroupedByInstallation();
  const [search, setSearch] = useState('');
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

  return (
    <Content>
      <Flex direction="column" gap="3">
        {/* The "only your own" reassurance is dropped when any installation
            reports that its kagent does not identify individual users —
            otherwise the page would promise it at the top and contradict itself
            in the warning below the table, and the reassuring claim is the one
            read first. */}
        <Text color="secondary">
          {notUserScopedInstallations.length > 0
            ? 'Agent chat sessions across the management clusters.'
            : 'Your agent chat sessions across the management clusters. kagent scopes sessions to the signed-in user, so only your own are listed.'}
        </Text>

        <StartNewSession />

        <InstallationScopeNote component="kagent" />

        {/* Same gate as the Agents tab: the installation this tab reads could
            not be asked whether it runs kagent. Renders nothing otherwise. */}
        <InstallationInventoryGate context="Which installations run kagent is read through their Kubernetes API." />

        {isLoading ? (
          // No rows yet — show activity instead of an empty table skeleton.
          <Progress aria-label="Loading sessions" />
        ) : (
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
