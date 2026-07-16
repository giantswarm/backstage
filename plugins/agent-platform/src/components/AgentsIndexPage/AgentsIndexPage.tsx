import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content } from '@backstage/core-components';
import { Box, Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';

import { newAgentRouteRef } from '../../routes';

// Stub landing for the "Agents" tab. The agent list/catalog is still to be
// defined; for now this just introduces the section and routes into the create
// flow. The section header + tabs are provided by the Agent Platform page
// (GSPageLayout), so this renders content only — no PluginHeader of its own.
export function AgentsIndexPage() {
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);

  return (
    <Content>
      <Box maxWidth="640px">
        <Flex direction="column" gap="3">
          <Text>
            Create and manage agents that run on your management clusters. An
            agent adapts the Giant Swarm{' '}
            <Text as="span" weight="bold">
              general-purpose-agent
            </Text>{' '}
            chart with a model, a system prompt, and (soon) a set of skills.
          </Text>
          <Text variant="body-medium" color="secondary">
            The agent list view is coming next. For now, start by creating a new
            agent.
          </Text>
          <Box>
            <Button
              variant="primary"
              iconStart={<AddIcon />}
              onPress={() => newAgentLink && navigate(newAgentLink())}
            >
              New agent
            </Button>
          </Box>
        </Flex>
      </Box>
    </Content>
  );
}
