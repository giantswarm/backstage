import { Theme } from '@material-ui/core';
import { StepNodeStatus } from '../../lib/workflowToGraph';

export function statusColor(
  theme: Theme,
  status: StepNodeStatus | undefined,
): string {
  switch (status) {
    case 'completed':
      return theme.palette.success.main;
    case 'failed':
      return theme.palette.error.main;
    case 'inprogress':
      return theme.palette.info.main;
    case 'skipped':
      return theme.palette.text.disabled;
    case 'pending':
      return theme.palette.text.disabled;
    default:
      return theme.palette.divider;
  }
}

export const STATUS_LABELS: Record<StepNodeStatus, string> = {
  completed: 'Completed',
  failed: 'Failed',
  inprogress: 'In progress',
  skipped: 'Skipped',
  pending: 'Pending',
};
