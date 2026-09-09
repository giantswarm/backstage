import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Box, Button, Flex, Text } from '@backstage/ui';
import { LinearProgress } from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import { InstallationInventoryGate } from '@giantswarm/backstage-plugin-gs';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { newAgentRouteRef } from '../../routes';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { AgentsTable } from '../AgentsTable';
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

  return (
    <Content>
      <Flex direction="column" gap="3">
        <Text color="secondary">
          Agents running across your management clusters.
        </Text>

        <InstallationScopeNote component="kagent" />

        {/* The installation this tab reads could not be asked whether it runs
            kagent (its API server rejected the token, refused the read, or
            did not answer): say so once, with the remedy, instead of listing
            nothing. Renders nothing otherwise. */}
        <InstallationInventoryGate context="Which installations run kagent is read through their Kubernetes API." />

        {isLoading ? (
          // No rows yet — show activity instead of an empty table skeleton.
          <Progress aria-label="Loading agents" />
        ) : (
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
