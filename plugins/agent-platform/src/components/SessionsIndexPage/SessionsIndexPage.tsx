import { ReactNode, useMemo, useRef } from 'react';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Alert, ButtonLink, Flex, Text } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';
import { ShellPage } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentShell } from '../../hooks/useAgentShell';
import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import {
  HIDE_INSTALLATION,
  isSoleInstallation,
} from '../../lib/soleInstallation';
import { useAgents } from '../AgentsDataProvider';
import { InstallationScopeNote } from '../InstallationScopeNote';
import { NotReachableInstallationsNote } from '../NotReachableInstallationsNote';
import { SessionsDataProvider, useSessions } from '../SessionsDataProvider';
import { SessionsMigrationNotice } from '../SessionsMigrationNotice';
import { SessionsTable } from '../SessionsTable';
import { StartNewSession } from '../StartNewSession';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/**
 * The page frame: inside the agent-platform shell the page titles itself and
 * offers "New session", which goes to the shell's start screen; otherwise the
 * Agent Platform page's header and tabs frame the content.
 */
function SessionsFrame({
  agentShell,
  children,
}: {
  agentShell: boolean;
  children: ReactNode;
}) {
  if (!agentShell) {
    return <Content>{children}</Content>;
  }
  return (
    <ShellPage
      title="Sessions"
      description="Every conversation you’ve had with an agent."
      actions={
        <ButtonLink href="/" variant="primary" iconStart={<AddIcon />}>
          New session
        </ButtonLink>
      }
    >
      {children}
    </ShellPage>
  );
}

// Content of the "Sessions" tab, framed by `SessionsFrame`. Outside the shell
// the one write it offers, starting a session, is inline rather than a header
// action, so no actions are provided.
function SessionsIndexPageContent() {
  const {
    rows,
    scope,
    installations,
    isLoading,
    isLoadingMore,
    hasInstallations,
    unreachableInstallations,
    readFailures,
    notUserScopedInstallations,
    notReachableInstallations,
  } = useSessions();
  // The agents fan-out is a second, independent load: the sessions can settle
  // long before it, and on first run the composer is all there is to show.
  const { isLoading: isLoadingAgents } = useAgents();
  const agentShell = useAgentShell();
  // Only the installations that actually returned a session. An installation
  // with no row has no state to ask after, and each pass costs it one task read
  // per session it does hold — so the fan-out is bounded by what is on screen
  // rather than by the size of the scope.
  const stateInstallations = useMemo(
    () => Array.from(new Set(rows.map(row => row.installation))).sort(),
    [rows],
  );
  const sessionStates = useFleetSessionStates(stateInstallations);
  // Which container the composer mounts in, decided once — see the latch below.
  // Declared up here because the `hasInstallations` guard returns early.
  const firstRunRef = useRef<boolean | undefined>(undefined);

  if (!isLoading && !hasInstallations) {
    return (
      <SessionsFrame agentShell={agentShell}>
        <EmptyState
          missing="data"
          title="No installations configured"
          description="Sessions are read from kagent on your management clusters, but no installations are configured for this instance."
        />
      </SessionsFrame>
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

  const soleInstallation = isSoleInstallation({
    scope,
    isLoading: isLoadingMore,
    installations: queriedInstallations,
    unreachableInstallations,
  });

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
    <SessionsFrame agentShell={agentShell}>
      <Flex direction="column" gap="3">
        {/* Conversations from before the move to kagent API v2 are not here
            (plan decision D9). Said before the list, so an empty or short one
            is explained rather than puzzled over; dismissible, because it is
            true forever and interesting once. Withheld while loading, like the
            composer, so the tab does not flash it over a spinner. */}
        {!isLoading && <SessionsMigrationNotice />}

        {/* Withheld until the list settles, so `firstRun` is known before the
            composer mounts -- see the latch above. */}
        {!isLoading && !agentShell && (
          <StartNewSession
            entryPoint="sessionsList"
            layout={firstRun ? 'firstRun' : 'inline'}
          />
        )}

        <InstallationScopeNote component="kagent" />

        {/* Same gate as the Agents tab: the installation this tab reads could
            not be asked whether it runs kagent. Renders nothing otherwise. */}
        <InstallationInventoryGate context="Which installations run kagent is read through their Kubernetes API." />

        {/* No rows yet — show activity instead of an empty table skeleton.
            Also while the agents are still resolving on an empty list: the
            composer is withheld until they are in, the blurb and table are
            gated off, and without this the tab would render nothing at all. */}
        {(isLoading || (isEmpty && isLoadingAgents)) && (
          <Progress aria-label="Loading sessions" />
        )}

        {/* An empty fleet gets no list at all, rather than an empty table
            beneath the invitation above. */}
        {!isLoading && !isEmpty && (
          <>
            {/* Rows are in, but more installations are still resolving. */}
            {isLoadingMore && (
              <LinearProgress aria-label="Loading more sessions" />
            )}

            {/* One flat table under every scope. Under "All installations" the
                Installation column tells the rows apart; the table's initial
                sort is newest first, whatever installation a session ran on.
                An installation without sessions simply has no row, and one
                that could not be read is called out below. The heading, and
                the extra room above it, keep the search box from reading as
                part of "Start a new session". */}
            <Flex direction="column" gap="2" mt="4">
              {!agentShell && (
                <Text as="h2" variant="title-x-small">
                  {notUserScopedInstallations.length > 0
                    ? 'Sessions'
                    : 'Your sessions'}
                </Text>
              )}
              <SessionsTable
                rows={rows}
                sessionStates={sessionStates}
                hideColumns={soleInstallation ? HIDE_INSTALLATION : undefined}
                showFilters
                layout={agentShell ? 'shell' : undefined}
              />
            </Flex>
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
          failures={readFailures}
        />

        {/* Installations that run kagent but whose endpoint the portal cannot
            reach (the backend's unauthenticated probe says so). Never queried,
            so not a read failure and not something to retry: a quiet line, not
            a warning card. */}
        <NotReachableInstallationsNote
          installations={notReachableInstallations}
        />
      </Flex>
    </SessionsFrame>
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
