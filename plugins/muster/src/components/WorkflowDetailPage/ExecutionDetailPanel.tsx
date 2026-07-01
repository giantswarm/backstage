import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import {
  DateComponent,
  JsonHighlight,
} from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowExecution, WorkflowExecutionStep } from '../../apis';
import { formatDuration } from '../../lib/formatDuration';
import { ExecutionStatusBadge } from './executionStatus';

const useStyles = makeStyles((theme: Theme) => ({
  panel: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    // Grow with content, but cap at the viewport so long step results scroll
    // internally instead of stretching the page.
    maxHeight: 'calc(100vh - 360px)',
    overflow: 'auto',
    padding: theme.spacing(2),
  },
  step: {
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingBottom: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5),
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  stepId: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  tool: {
    fontFamily: 'monospace',
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
  },
  timing: {
    color: theme.palette.text.secondary,
  },
  block: {
    marginTop: theme.spacing(0.5),
  },
  blockLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
  error: {
    color: theme.palette.error.main,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
}));

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const classes = useStyles();
  if (value === undefined || value === null) {
    return null;
  }
  return (
    <div className={classes.block}>
      <Typography variant="caption" className={classes.blockLabel}>
        {label}
      </Typography>
      <JsonHighlight customStyle={{ margin: 0, fontSize: '0.7rem' }}>
        {JSON.stringify(value, null, 2)}
      </JsonHighlight>
    </div>
  );
}

function StepResult({ step }: { step: WorkflowExecutionStep }) {
  const classes = useStyles();
  return (
    <div className={classes.step}>
      <div className={classes.stepHeader}>
        <ExecutionStatusBadge status={step.status} />
        <span className={classes.stepId}>{step.step_id}</span>
        <span className={classes.tool}>{step.tool}</span>
        <span className={classes.timing}>
          {step.status === 'inprogress'
            ? 'running…'
            : formatDuration(step.duration_ms)}
        </span>
      </div>
      {step.stored_as && (
        <Typography variant="caption" color="textSecondary">
          stored as <code>{step.stored_as}</code>
        </Typography>
      )}
      {step.error && (
        <div className={classes.block}>
          <Typography variant="caption" className={classes.blockLabel}>
            Error
          </Typography>
          <Typography component="pre" className={classes.error}>
            {step.error}
          </Typography>
        </div>
      )}
      <JsonBlock label="Resolved input" value={step.input} />
      <JsonBlock label="Result" value={step.result} />
    </div>
  );
}

export interface ExecutionDetailPanelProps {
  execution?: WorkflowExecution;
  isLoading: boolean;
  error?: unknown;
}

/**
 * Per-step results for a selected execution, fetched via
 * `core_workflow_execution_get`. Renders status, timing, resolved inputs,
 * stored-as bindings, results, and errors for each step.
 */
export function ExecutionDetailPanel({
  execution,
  isLoading,
  error,
}: ExecutionDetailPanelProps) {
  const classes = useStyles();

  if (error) {
    return (
      <Box className={classes.panel}>
        <ResponseErrorPanel error={error as Error} />
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box className={classes.panel}>
        <Progress />
      </Box>
    );
  }

  if (!execution) {
    return (
      <Box className={classes.panel}>
        <Typography variant="body2" color="textSecondary">
          Select an execution to inspect its step results.
        </Typography>
      </Box>
    );
  }

  const steps = execution.steps ?? [];

  return (
    <Box className={classes.panel}>
      <Box className={classes.stepHeader} mb={2}>
        <ExecutionStatusBadge status={execution.status} />
        <Typography variant="subtitle1">
          <DateComponent value={execution.started_at} tooltip />
        </Typography>
        <span className={classes.timing}>
          {execution.status === 'inprogress'
            ? 'running…'
            : formatDuration(execution.duration_ms)}
        </span>
      </Box>

      {execution.error && (
        <div className={classes.block}>
          <Typography variant="caption" className={classes.blockLabel}>
            Workflow error
          </Typography>
          <Typography component="pre" className={classes.error}>
            {execution.error}
          </Typography>
        </div>
      )}

      {steps.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No step results recorded for this execution.
        </Typography>
      ) : (
        steps.map(step => <StepResult key={step.step_id} step={step} />)
      )}
    </Box>
  );
}
