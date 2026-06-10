import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  makeStyles,
  Theme,
  Typography,
} from '@material-ui/core';
import AccountTreeIcon from '@material-ui/icons/AccountTree';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowExecutionSummary } from '../../apis';
import { StatusIcon } from '../flow';

const useStyles = makeStyles((theme: Theme) => ({
  panel: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    backgroundColor: theme.palette.background.paper,
    overflow: 'auto',
    height: '100%',
  },
  header: {
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  listIcon: {
    minWidth: 32,
  },
}));

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export interface ExecutionHistoryPanelProps {
  executions: WorkflowExecutionSummary[];
  selectedExecutionId?: string;
  onSelect: (executionId?: string) => void;
}

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
        <ListItem
          button
          selected={selectedExecutionId === undefined}
          onClick={() => onSelect(undefined)}
        >
          <ListItemIcon className={classes.listIcon}>
            <AccountTreeIcon fontSize="small" color="action" />
          </ListItemIcon>
          <ListItemText
            primary="Definition"
            secondary="Workflow without execution overlay"
          />
        </ListItem>
        {executions.map(execution => (
          <ListItem
            key={execution.execution_id}
            button
            selected={execution.execution_id === selectedExecutionId}
            onClick={() => onSelect(execution.execution_id)}
          >
            <ListItemIcon className={classes.listIcon}>
              <StatusIcon status={execution.status} />
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
            <ListItemText secondary="No executions recorded for this workflow." />
          </ListItem>
        )}
      </List>
    </div>
  );
}
