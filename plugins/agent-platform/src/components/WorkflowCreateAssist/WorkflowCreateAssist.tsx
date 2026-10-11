import { Alert, Button, Flex } from '@backstage/ui';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import { useMetaAgentHandoff } from '../../hooks/useMetaAgentHandoff';
import { workflowCreatePrompt } from '../../lib/workflowAgentPrompts';
import { AgentPlatformCookieAuth } from '../AgentPlatformCookieAuth';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { MetaAgentBanner } from '../MetaAgentBanner';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';

export type WorkflowCreateAssistProps = {
  /** The installation whose workflows the overview shows. */
  installation?: string;
};

function CreateBanner({ installation }: WorkflowCreateAssistProps) {
  const { agent, start, isCreating, error } = useMetaAgentHandoff(
    'workflowManagement',
    'workflowCreateAssist',
  );
  if (!agent) {
    return null;
  }
  return (
    <Flex direction="column" gap="2">
      <MetaAgentBanner
        agent={agent}
        label={`Create workflows with ${agent.name}`}
        title={`Need a workflow? ${agent.name} builds it with you.`}
        action={
          <Button
            variant="secondary"
            size="small"
            iconEnd={<ArrowForwardIcon fontSize="small" />}
            isDisabled={isCreating}
            onPress={() => {
              start(workflowCreatePrompt(installation)).catch(() => {});
            }}
          >
            {isCreating ? 'Starting…' : `Create with ${agent.name}`}
          </Button>
        }
      />
      {error && (
        <Alert
          status="danger"
          title={`Could not start a session with ${agent.name}`}
          description={error.message}
        />
      )}
    </Flex>
  );
}

/**
 * The workflows overview's way to create one: workflows are read-only in the
 * UI (D11), so a new one is written with the workflow agent
 * (`agentPlatform.metaAgents.workflowManagement`). One line in the tinted
 * meta-agent strip (`MetaAgentBanner`, as Customize → Agents' Swarmgeist
 * hint and the skill forms' hand-off); its button starts a session with the
 * agent and opens it.
 *
 * The app passes it to muster's `CustomizeWorkflowsPanel` (`createAssist`).
 * Hidden entirely while the role is unconfigured, still resolving, names no
 * existing agent, or names one that cannot take a session (decision G13).
 */
export function WorkflowCreateAssist(props: WorkflowCreateAssistProps) {
  const { config } = useSignedInConfig();
  if (!readMetaAgents(config).workflowManagement) {
    return null;
  }
  return (
    <QueryClientProvider>
      <AgentPlatformCookieAuth>
        <ModelConfigsProvider>
          <AgentsDataProvider>
            <CreateBanner {...props} />
          </AgentsDataProvider>
        </ModelConfigsProvider>
      </AgentPlatformCookieAuth>
    </QueryClientProvider>
  );
}
