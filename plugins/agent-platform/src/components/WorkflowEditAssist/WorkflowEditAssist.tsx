import { Button, Text } from '@backstage/ui';
import { readMetaAgents } from '@giantswarm/backstage-plugin-agent-platform-common';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
// The page's side of the `editAction` contract (see plugin.tsx): reading the
// workflow is the one thing this element needs from muster, as the
// connector page's Used by tab reads its connector (`ConnectorUsedBy`).
// eslint-disable-next-line @backstage/no-mixed-plugin-imports
import { useWorkflowPageTarget } from '@giantswarm/backstage-plugin-muster';

import { useMetaAgentHandoff } from '../../hooks/useMetaAgentHandoff';
import {
  workflowEditPrompt,
  type WorkflowEditTarget,
} from '../../lib/workflowAgentPrompts';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { QueryClientProvider } from '../QueryClientProvider';

function EditButton({ target }: { target: WorkflowEditTarget }) {
  const { agent, start, isCreating, error } = useMetaAgentHandoff(
    'workflowManagement',
    'workflowEdit',
  );
  if (!agent) {
    return null;
  }
  // Straight into the header's actions row, as the skill page's "Edit": a
  // secondary button, no wrapper of its own. A failure says so beside it.
  return (
    <>
      <Button
        variant="secondary"
        isDisabled={isCreating}
        onPress={() => {
          start(workflowEditPrompt(target)).catch(() => {});
        }}
      >
        {isCreating ? 'Starting…' : `Edit with ${agent.name}`}
      </Button>
      {error && (
        <Text as="p" variant="body-small" color="danger" role="alert">
          {`Could not start a session with ${agent.name}: ${error.message}`}
        </Text>
      )}
    </>
  );
}

/**
 * The shell workflow page's "Edit with <agent>": workflows are read-only in the
 * UI (D11), so a change goes through the workflow agent
 * (`agentPlatform.metaAgents.workflowManagement`). One press starts a session
 * with it and opens it, its first message naming the workflow, its
 * installation and its definition (inline when compact) — the hand-off of the
 * skill forms' `SkillCreationAssist`, as the page's action.
 *
 * Attached to muster's `sub-page:muster/workflows` (input `editAction`) and
 * reads the workflow with `useWorkflowPageTarget`. Hidden entirely while the
 * role is unconfigured, still resolving, names no existing agent, or names
 * one that cannot take a session (decision G13). The config read is the cheap
 * outer gate; the fleet-wide agent list is only read once a name is
 * configured.
 */
export function WorkflowEditAssist() {
  const target = useWorkflowPageTarget();
  const { config } = useSignedInConfig();
  if (!target || !readMetaAgents(config).workflowManagement) {
    return null;
  }
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <AgentsDataProvider>
          <EditButton target={target} />
        </AgentsDataProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
}
