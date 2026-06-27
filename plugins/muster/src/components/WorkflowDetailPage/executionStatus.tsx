import { ReactNode } from 'react';
import {
  StatusAborted,
  StatusError,
  StatusOK,
  StatusRunning,
} from '@backstage/core-components';
import { WorkflowExecutionStatus } from '../../apis';

/**
 * Renders a muster execution/step status as a Backstage status badge. Kept
 * here (rather than reusing the ReactFlow StatusIcon) so the workflow manager
 * does not depend on the flow/ stack.
 */
export function ExecutionStatusBadge({
  status,
  label,
}: {
  status: WorkflowExecutionStatus;
  label?: ReactNode;
}) {
  const text = label ?? status;
  switch (status) {
    case 'completed':
      return <StatusOK>{text}</StatusOK>;
    case 'failed':
      return <StatusError>{text}</StatusError>;
    case 'inprogress':
      return <StatusRunning>{text}</StatusRunning>;
    case 'skipped':
    default:
      return <StatusAborted>{text}</StatusAborted>;
  }
}
