import { ReactNode, useCallback, useEffect } from 'react';
import { Alert, Flex } from '@backstage/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';
import { toolEffect } from '../../../lib/toolAnnotations';
import { invalidateWorkflowRuns } from '../../../lib/workflowRunKeys';
import { ToolRunPanel, useToolRun } from '../../ToolDetail';
import { WorkflowAuthNotice } from '../WorkflowAuthNotice';
import type { WorkflowToolState } from '../useWorkflowTool';

export type WorkflowRunTabProps = {
  installation?: string;
  /** The tool muster runs the workflow as: `workflow_<name>`. */
  toolName: string;
  /** Whether the muster session can list and call tools. */
  hasSession: boolean;
  /**
   * Whether the installation gives each person a muster session of their
   * own. Without one the portal refuses every run that is not one of
   * muster's own tools, since it would act as muster's shared identity.
   */
  perUserSession: boolean;
  /** Where muster asks for a session, what to show in place of the form. */
  sessionGate?: ReactNode;
  /** The workflow's tool as muster lists it for this session. */
  workflowTool: WorkflowToolState;
  /** Whether every step acts with the person's identity. */
  asCaller: boolean;
  /** The connectors its steps call, by MCPServer name. */
  connectors: string[];
  /**
   * The workflows a run records runs of: this one and those it runs as
   * steps, whose run records are re-read once it ends.
   */
  recordedWorkflows: string[];
  /** Told whether a run is in flight, so the page can ask before leaving. */
  onRunningChange: (running: boolean) => void;
};

/**
 * The workflow page's Run it tab: the tool page's run form and result for
 * the workflow's `workflow_<name>` tool, keyed as the tool page keys its
 * own, so both remember the same last-used inputs. Connectors waiting for
 * the person's sign-in are named above the form. Without a muster session,
 * on an installation without per-user sessions, or where muster lists no
 * such tool for the person, the tab says why instead of drawing a form that
 * cannot run.
 */
export function WorkflowRunTab({
  installation,
  toolName,
  hasSession,
  perUserSession,
  sessionGate,
  workflowTool,
  asCaller,
  connectors,
  recordedWorkflows,
  onRunningChange,
}: WorkflowRunTabProps) {
  const queryClient = useQueryClient();
  // A run, finished or failed, is a new record of each workflow it ran.
  const onRan = useCallback(
    () => invalidateWorkflowRuns(queryClient, installation, recordedWorkflows),
    [queryClient, installation, recordedWorkflows],
  );
  const run = useToolRun(toolName, installation, { onRan });
  useEffect(() => {
    onRunningChange(run.isPending);
  }, [onRunningChange, run.isPending]);
  // Leaving the tab ends the page's question; muster finishes the run.
  useEffect(() => () => onRunningChange(false), [onRunningChange]);

  if (!hasSession) {
    return <>{sessionGate}</>;
  }
  if (!perUserSession) {
    return (
      <EmptyStateCard
        title={`This portal cannot run workflows${
          installation ? ` on ${installation}` : ''
        }`}
        description="It talks to this environment's muster without personal credentials, so a run would act as muster's shared identity instead of yours. An administrator has to configure an auth provider for this environment."
      />
    );
  }
  const { tool, isAwaiting, error } = workflowTool;
  if (!tool && isAwaiting) {
    return <LoadingIndicator label="Reading the workflow from muster…" />;
  }
  if (!tool && error) {
    return (
      <Alert
        status="danger"
        title="Could not read the workflow from muster"
        description={error.message}
      />
    );
  }

  const authNotice = (
    <WorkflowAuthNotice connectors={connectors} installation={installation} />
  );
  if (!tool) {
    return (
      <Flex direction="column" gap="4">
        {authNotice}
        <EmptyStateCard
          title={
            // A workflow's tool name is one unbroken token: at phone width
            // it may break anywhere rather than widen the page.
            <>
              No tool{' '}
              <span style={{ overflowWrap: 'anywhere' }}>“{toolName}”</span> for
              you{installation ? ` on ${installation}` : ''}
            </>
          }
          description="muster runs a workflow as this tool and does not list it for you. It may not have loaded the definition yet; Overview shows any validation warning."
        />
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {authNotice}
      <ToolRunPanel
        name={toolName}
        installation={installation}
        subject="workflow"
        effect={toolEffect(tool)}
        asCaller={asCaller}
        run={run}
      />
    </Flex>
  );
}
