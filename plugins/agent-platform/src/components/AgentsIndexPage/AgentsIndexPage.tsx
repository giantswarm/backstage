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
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

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

        {isLoading ? (
          // No rows yet — show activity instead of an empty table skeleton.
          <Progress aria-label="Loading agents" />
        ) : (
          <>
            {/* Rows are in, but more installations are still resolving. A thin
                bar signals background activity without a blocking skeleton or
                extra text. */}
            {isLoadingMore && (
              <LinearProgress aria-label="Loading more agents" />
            )}

            <Box>
              <AgentsTable rows={rows} />
            </Box>

            <UnreachableInstallationsAlert
              installations={unreachableInstallations}
              resourceName="Agents"
            />
          </>
        )}
      </Flex>
    </Content>
  );
}

export function AgentsIndexPage() {
  return (
    <ModelConfigsProvider>
      <AgentsDataProvider>
        <AgentsIndexPageContent />
      </AgentsDataProvider>
    </ModelConfigsProvider>
  );
}
