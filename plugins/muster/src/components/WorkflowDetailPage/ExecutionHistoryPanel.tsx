import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  makeStyles,
  Theme,
  Typography,
} from '@material-ui/core';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowExecutionSummary } from '../../apis';
import { formatDuration } from '../../lib/formatDuration';
import { ExecutionStatusBadge } from './executionStatus';

const useStyles = makeStyles((theme: Theme) => ({
  panel: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    backgroundColor: theme.palette.background.paper,
    overflow: 'auto',
    // Grow with content, but cap at the viewport so a long history scrolls
    // internally instead of stretching the page.
    maxHeight: 'calc(100vh - 360px)',
  },
  header: {
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  listIcon: {
    minWidth: 32,
  },
}));

export interface ExecutionHistoryPanelProps {
  executions: WorkflowExecutionSummary[];
  selectedExecutionId?: string;
  onSelect: (executionId?: string) => void;
}

/**
 * List of past executions for a workflow. Selecting one loads its per-step
 * results in the adjacent detail panel.
 */
export function ExecutionHistoryPanel({
  executions,
  selectedExecutionId,
  onSelect,
}: ExecutionHistoryPanelProps) {
  const classes = useStyles();

  return (
    <div className={classes.panel}>
      <div className={classes.header}>
        <Typography variant="subtitle1">Executions</Typography>
      </div>
      <List dense disablePadding>
        {executions.map(execution => (
          <ListItem
            key={execution.execution_id}
            button
            selected={execution.execution_id === selectedExecutionId}
            onClick={() => onSelect(execution.execution_id)}
          >
            <ListItemIcon className={classes.listIcon}>
              <ExecutionStatusBadge status={execution.status} label="" />
            </ListItemIcon>
            <ListItemText
              primary={
                <DateComponent value={execution.started_at} relative tooltip />
              }
              secondary={
                execution.status === 'inprogress'
                  ? 'running…'
                  : formatDuration(execution.duration_ms)
              }
            />
          </ListItem>
        ))}
        {executions.length === 0 && (
          <ListItem>
            <ListItemText secondary="No engine- or agent-driven executions recorded. Runs launched from the tool explorer are not recorded here." />
          </ListItem>
        )}
      </List>
    </div>
  );
}
