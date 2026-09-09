import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Box, Button, Flex, Text } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { newAgentRouteRef } from '../../routes';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { AgentsTable } from '../AgentsTable';
import { FirstAgentCard } from '../FirstAgentCard';
import { InstallationScopeNote } from '../InstallationGroups';
import { ServingProvider } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

/**
 * Height reserved for the "loading more" bar, matching MUI's `LinearProgress`
 * default track height. Reserved permanently so toggling the bar never shifts
 * the table.
 */
const LOADING_BAR_SLOT_HEIGHT = '4px';

// Content of the "Agents" tab. The section header + tabs are provided by the
// Agent Platform page (GSPageLayout), so this renders content only — no
// PluginHeader of its own, and the "New agent" action is surfaced in that shared
// header via useProvidePageHeaderActions.
function AgentsIndexPageContent() {
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const {
    rows,
    installations,
    isLoading,
    isLoadingMore,
    hasInstallations,
    unreachableInstallations,
  } = useAgents();

  // Memoized so the header actions slot only updates when the handler changes.
  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        iconStart={<AddIcon />}
        onPress={() => newAgentLink && navigate(newAgentLink())}
      >
        New agent
      </Button>
    ),
    [newAgentLink, navigate],
  );
  useProvidePageHeaderActions(actions);

  if (!isLoading && !hasInstallations) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="No installations configured"
          description="Agents are read from your management clusters, but no installations are configured for this instance."
        />
      </Content>
    );
  }

  // The fleet has settled with nothing: `isLoading` is only true while no rows
  // exist yet, and `isLoadingMore` requires rows. So an empty list here is the
  // final answer -- either the fleet genuinely holds no agent, or nothing could
  // be read.
  const isEmpty = !isLoading && rows.length === 0;
  // Reads failed and produced nothing: the warning card below is the whole
  // answer, and an empty table beside it would contradict it.
  const nothingCouldBeRead = isEmpty && unreachableInstallations.length > 0;
  // Two things have to hold before inviting the user to create an agent.
  //
  // The fleet must have *answered*: "nothing could be read" is not "nothing is
  // there", and the warning below says which it is.
  //
  // And there must be somewhere to deploy to. `installations` is the scoped
  // set that runs kagent and is reachable, so an empty one means the create
  // flow has no target -- and under a pinned scope `InstallationScopeNote`
  // above already says kagent is not installed there. Inviting anyway would
  // contradict that note and dead-end in the form.
  const invitesFirstAgent =
    isEmpty && !nothingCouldBeRead && installations.length > 0;
  // Everything else keeps the table, including a scope that runs kagent
  // nowhere: its own empty state is the honest answer there.
  const showsTable = !isLoading && !invitesFirstAgent && !nothingCouldBeRead;

  return (
    <Content>
      <Flex direction="column" gap="3">
        {/* Dropped for the first-run card, which is the whole message then --
            a blurb about agents running across the fleet contradicts it. */}
        {!invitesFirstAgent && (
          <Text color="secondary">
            Agents running across your management clusters.
          </Text>
        )}

        <InstallationScopeNote component="kagent" />

        {/* No rows yet — show activity instead of an empty table skeleton. */}
        {isLoading && <Progress aria-label="Loading agents" />}

        {invitesFirstAgent && <FirstAgentCard />}

        {showsTable && (
          <>
            {/* Rows are in, but more installations are still resolving. A thin
                bar signals background activity without a blocking skeleton or
                extra text.

                The slot is always rendered at a fixed height and only its
                contents toggle, so the bar appearing or disappearing can never
                move the table underneath it. */}
            <Box height={LOADING_BAR_SLOT_HEIGHT}>
              {isLoadingMore && (
                <LinearProgress aria-label="Loading more agents" />
              )}
            </Box>

            {/* One flat table under every scope. Under "All installations" the
                Installation column — the table's initial sort, home first —
                tells the rows apart; an installation without agents has no
                row, and one that could not be read is called out below. */}
            <Box>
              <AgentsTable rows={rows} />
            </Box>
          </>
        )}

        {/* Rendered regardless of the loading branch so that a fleet where the
            only reachable installations all error (no rows, still "loading")
            still surfaces the failure instead of an indefinite progress bar. */}
        <UnreachableInstallationsAlert
          installations={unreachableInstallations}
          resourceName="Agents"
        />
      </Flex>
    </Content>
  );
}

// The ServingProvider is what lets the Model column say whether the model
// behind each agent is serving (the same snapshot the Models tab reads, from
// the shared query cache); the rows work without it, they just say less.
export function AgentsIndexPage() {
  return (
    <ModelConfigsProvider>
      <ServingProvider>
        <AgentsDataProvider>
          <AgentsIndexPageContent />
        </AgentsDataProvider>
      </ServingProvider>
    </ModelConfigsProvider>
  );
}
