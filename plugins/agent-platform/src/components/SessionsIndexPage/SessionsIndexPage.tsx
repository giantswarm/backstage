import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Alert, Box, Flex, Text } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';

import { SessionsDataProvider, useSessions } from '../SessionsDataProvider';
import { SessionsTable } from '../SessionsTable';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

// Content of the "Sessions" tab. The section header + tabs come from the Agent
// Platform page (GSPageLayout), so this renders content only. Read-only, so
// there are no header actions to provide.
function SessionsIndexPageContent() {
  const {
    rows,
    isLoading,
    isLoadingMore,
    hasInstallations,
    unreachableInstallations,
    notUserScopedInstallations,
  } = useSessions();

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
              <SessionsTable rows={rows} />
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
      </Flex>
    </Content>
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
