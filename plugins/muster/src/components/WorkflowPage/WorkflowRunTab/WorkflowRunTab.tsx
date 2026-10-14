import { ReactNode, useCallback } from 'react';
import { Alert, Flex } from '@backstage/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ToolSummary } from '../../../apis/types';
import type { ToolEffect } from '../../../lib/toolAnnotations';
import { ToolRunPanel } from '../../ToolDetail';
import { WorkflowAuthNotice } from './WorkflowAuthNotice';

/**
 * The run records a run adds to: the page's last run and totals, its
 * statistics, and the Customize list's runs columns.
 */
const RUN_RECORD_QUERIES = new Set([
  'workflow-latest-run',
  'workflow-run-count',
  'workflow-stats',
  'workflow-runs',
  'workflow-last-runs',
]);

export type WorkflowRunTabProps = {
  installation?: string;
  /** The tool muster runs the workflow as: `workflow_<name>`. */
  toolName: string;
  /** Whether the muster session can list and call tools. */
  hasSession: boolean;
  /** Where muster asks for a session, what to show in place of the form. */
  sessionGate?: ReactNode;
  /** The workflow's tool as muster lists it for this session. */
  tool: {
    data?: ToolSummary | null;
    isLoading: boolean;
    error: Error | null;
  };
  /** Its derived effect; undefined while the tool is unread. */
  effect?: ToolEffect;
  /** Whether every step acts with the person's identity. */
  asCaller: boolean;
  /** The connectors its steps call, by MCPServer name. */
  connectors: string[];
};

/**
 * The workflow page's Run it tab: the tool page's run form and result for
 * the workflow's `workflow_<name>` tool, keyed as the tool page keys its
 * own, so both remember the same last-used inputs. Connectors waiting for
 * the person's sign-in are named above the form. Without a muster session,
 * or where muster lists no such tool for the person, the tab says why
 * instead of drawing a form that cannot run.
 */
export function WorkflowRunTab({
  installation,
  toolName,
  hasSession,
  sessionGate,
  tool,
  effect,
  asCaller,
  connectors,
}: WorkflowRunTabProps) {
  const queryClient = useQueryClient();
  // A run, finished or failed, is a new record: re-read what counts them.
  const onRan = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === 'muster' &&
        RUN_RECORD_QUERIES.has(String(queryKey[1])) &&
        queryKey[2] === installation,
    });
  }, [queryClient, installation]);

  if (!hasSession) {
    return <>{sessionGate}</>;
  }
  if (!tool.data && tool.isLoading) {
    return <LoadingIndicator label="Reading the workflow from muster…" />;
  }
  if (tool.error) {
    return (
      <Alert
        status="danger"
        title="Could not read the workflow from muster"
        description={tool.error.message}
      />
    );
  }

  const authNotice = (
    <WorkflowAuthNotice connectors={connectors} installation={installation} />
  );
  if (!tool.data) {
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
        effect={effect ?? 'changes'}
        asCaller={asCaller}
        onRan={onRan}
      />
    </Flex>
  );
}
