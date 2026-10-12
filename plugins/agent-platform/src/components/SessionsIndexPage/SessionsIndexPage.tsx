import { ReactNode, useEffect, useMemo, useRef } from 'react';
import usePrevious from 'react-use/esm/usePrevious';
import { Alert, ButtonLink, Flex } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';
import {
  EmptyStateCard,
  LoadingIndicator,
  ShellPage,
} from '@giantswarm/backstage-plugin-ui-react';

import { useFleetSessionStates } from '../../hooks/useFleetSessionStates';
import {
  HIDE_INSTALLATION,
  isSoleInstallation,
} from '../../lib/soleInstallation';
import { InstallationScopeNote } from '../InstallationScopeNote';
import { NotReachableInstallationsNote } from '../NotReachableInstallationsNote';
import { SessionsDataProvider, useSessions } from '../SessionsDataProvider';
import { SessionsTable } from '../SessionsTable';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/**
 * The page frame: the page titles itself and offers "New session", which goes
 * to the shell's start screen.
 */
function SessionsFrame({ children }: { children: ReactNode }) {
  return (
    <ShellPage
      title="Sessions"
      description="Find every conversation you have had with an agent."
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

/**
 * The shell's list when the person has no session: what the list is for and
 * where one starts. Takes focus when it replaces a list that lost focus with
 * its last row, as a delete does.
 */
function ShellSessionsEmpty({ replacesList }: { replacesList: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (replacesList && (!active || active === document.body)) {
      headingRef.current?.focus();
    }
  }, [replacesList]);
  return (
    <EmptyStateCard
      titleRef={headingRef}
      title="No sessions yet"
      description="The sessions you start with an agent are listed here."
      actions={
        <ButtonLink href="/" variant="secondary" iconStart={<AddIcon />}>
          New session
        </ButtonLink>
      }
    />
  );
}

// Content of the "Sessions" tab, framed by `SessionsFrame`.
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
  // Only the installations that actually returned a session. An installation
  // with no row has no state to ask after, and each pass costs it one task read
  // per session it does hold — so the fan-out is bounded by what is on screen
  // rather than by the size of the scope.
  const stateInstallations = useMemo(
    () => Array.from(new Set(rows.map(row => row.installation))).sort(),
    [rows],
  );
  const sessionStates = useFleetSessionStates(stateInstallations);
  // Whether a list was on screen before, so an empty state that replaces it
  // takes over focus.
  const hadRows = usePrevious(rows.length > 0) ?? false;

  if (!isLoading && !hasInstallations) {
    return (
      <SessionsFrame>
        <EmptyStateCard
          title="No environments configured"
          description="Sessions are read from your environments, and this portal knows none."
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

  return (
    <SessionsFrame>
      <Flex direction="column" gap="3">
        <InstallationScopeNote component="kagent" />

        {/* Same gate as the Agents tab: the installation this tab reads could
            not be asked whether it runs kagent. Renders nothing otherwise. */}
        <InstallationInventoryGate context="Which environments run kagent is read through their Kubernetes API." />

        {/* No rows yet — show activity instead of an empty table skeleton. */}
        {isLoading && <LoadingIndicator label="Reading your sessions…" />}

        {invitesFirstSession && <ShellSessionsEmpty replacesList={hadRows} />}

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
                that could not be read is called out below. */}
            <Flex direction="column" gap="2" mt="4">
              <SessionsTable
                rows={rows}
                sessionStates={sessionStates}
                hideColumns={soleInstallation ? HIDE_INSTALLATION : undefined}
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
            )} does not identify individual users, so their sessions are shared, not yours alone.`}
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
 * The Sessions list.
 *
 * `QueryClientProvider`, `ModelConfigsProvider` and `AgentsDataProvider` are
 * mounted by `SessionsRouter` rather than here, so this screen and the session
 * detail share one query cache and one fleet-wide Agent list — opening a session
 * then reuses the agents already loaded for this list.
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
