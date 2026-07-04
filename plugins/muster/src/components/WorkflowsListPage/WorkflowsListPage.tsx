import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { FiltersLayout } from '@giantswarm/backstage-plugin-ui-react';
import { InstallationPicker } from '../InstallationPicker';
import { useMusterInstance } from '../MusterInstanceProvider';
import { WorkflowsDataProvider } from './WorkflowsDataProvider';
import { WorkflowsFilters } from './filters';
import { WorkflowsTable } from './WorkflowsTable';

export function WorkflowsListPage() {
  const { activeInstallation, isLoading } = useMusterInstance();

  if (isLoading) {
    return (
      <Content>
        <InstallationPicker />
        <Progress />
      </Content>
    );
  }

  if (!activeInstallation) {
    return (
      <Content>
        <InstallationPicker />
        <EmptyState
          missing="data"
          title="Select an installation"
          description="Choose a muster installation above to list its workflows."
        />
      </Content>
    );
  }

  return (
    <Content>
      <Box mb={2}>
        <Typography variant="body2" color="textSecondary">
          Workflows are a way to execute MCP tool calls in sequence, which saves
          time and LLM tokens.{' '}
          <Link to="https://docs.giantswarm.io/tutorials/ai-agents/authoring-workflows/">
            Read the muster documentation
          </Link>{' '}
          for more information.
        </Typography>
      </Box>

      <WorkflowsDataProvider>
        <FiltersLayout>
          <FiltersLayout.Filters>
            <WorkflowsFilters />
          </FiltersLayout.Filters>
          <FiltersLayout.Content>
            <WorkflowsTable />
          </FiltersLayout.Content>
        </FiltersLayout>
      </WorkflowsDataProvider>
    </Content>
  );
}
