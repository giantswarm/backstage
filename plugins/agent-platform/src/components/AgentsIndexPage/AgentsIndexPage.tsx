import { useNavigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { Box, Button, Flex, PluginHeader, Text } from '@backstage/ui';
import AndroidIcon from '@material-ui/icons/Android';
import AddIcon from '@material-ui/icons/Add';

// Minimal landing for the Agents section. The agent list/catalog is a separate
// backlog item; for now this page just introduces the section and routes into
// the create flow.
export function AgentsIndexPage() {
  const navigate = useNavigate();

  return (
    <>
      <PluginHeader
        icon={<AndroidIcon fontSize="inherit" />}
        title="Agents"
        customActions={
          <Button
            variant="primary"
            iconStart={<AddIcon />}
            onPress={() => navigate('new')}
          >
            New agent
          </Button>
        }
      />
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
              The agent list view is coming next. For now, start by creating a
              new agent.
            </Text>
            <Box>
              <Button
                variant="primary"
                iconStart={<AddIcon />}
                onPress={() => navigate('new')}
              >
                New agent
              </Button>
            </Box>
          </Flex>
        </Box>
      </Content>
    </>
  );
}
