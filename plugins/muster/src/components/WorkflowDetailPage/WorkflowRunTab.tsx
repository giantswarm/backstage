import { Alert, Box, Flex } from '@backstage/ui';
import { MusterWorkflow } from '../../lib/k8s';
import { useMusterSession } from '../MusterInstanceProvider';
import { SessionGate } from '../shared';
import { ToolDetailPanel } from '../ToolDetail';
import { WorkflowAuthNotice } from './WorkflowAuthNotice';

/**
 * Runs the workflow: the tool page's argument form and result view for the
 * workflow's `workflow_<name>` tool, one of muster's own. Keyed like the tool
 * page's panel, so both remember the same last-used arguments.
 */
export function WorkflowRunTab({
  workflow,
  installation,
}: {
  workflow: MusterWorkflow;
  installation?: string;
}) {
  const session = useMusterSession();
  const tool = `workflow_${workflow.getName()}`;

  let body;
  if (!session.authenticated) {
    body = (
      <SessionGate
        session={session}
        installation={installation}
        context="A workflow is run through the muster session."
      />
    );
  } else if (!workflow.isRunnable()) {
    body = (
      <Alert
        status="info"
        title="This workflow cannot be run"
        description={`muster does not offer the tool ${tool} on ${
          installation ?? 'this installation'
        }.`}
      />
    );
  } else {
    body = (
      <Flex direction="column" gap="4">
        <WorkflowAuthNotice workflow={workflow} installation={installation} />
        <ToolDetailPanel
          key={`${installation}/${tool}`}
          name={tool}
          installation={installation}
        />
      </Flex>
    );
  }

  return <Box py="4">{body}</Box>;
}
