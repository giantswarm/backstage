import {
  Chip,
  Drawer,
  IconButton,
  makeStyles,
  Theme,
  Typography,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import {
  DateComponent,
  JsonHighlight,
} from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowExecutionStep, WorkflowStep } from '../../apis';
import { StatusIcon } from '../flow';
import { StepNodeStatus } from '../../lib/workflowToGraph';

const useStyles = makeStyles((theme: Theme) => ({
  drawerPaper: {
    width: 480,
    maxWidth: '90vw',
    padding: theme.spacing(2),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  title: {
    flex: 1,
    fontFamily: 'monospace',
  },
  section: {
    marginBottom: theme.spacing(2),
  },
  sectionTitle: {
    marginBottom: theme.spacing(0.5),
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(2),
  },
  error: {
    color: theme.palette.error.main,
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
}));

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  const classes = useStyles();
  if (value === undefined || value === null) {
    return null;
  }
  return (
    <div className={classes.section}>
      <Typography variant="subtitle2" className={classes.sectionTitle}>
        {title}
      </Typography>
      <JsonHighlight customStyle={{ margin: 0, fontSize: '0.75rem' }}>
        {JSON.stringify(value, null, 2)}
      </JsonHighlight>
    </div>
  );
}

export interface StepDetailDrawerProps {
  step?: WorkflowStep;
  executionStep?: WorkflowExecutionStep;
  status?: StepNodeStatus;
  onClose: () => void;
}

export function StepDetailDrawer({
  step,
  executionStep,
  status,
  onClose,
}: StepDetailDrawerProps) {
  const classes = useStyles();

  return (
    <Drawer
      anchor="right"
      open={Boolean(step)}
      onClose={onClose}
      classes={{ paper: classes.drawerPaper }}
    >
      {step && (
        <>
          <div className={classes.header}>
            {status && <StatusIcon status={status} />}
            <Typography variant="h6" className={classes.title}>
              {step.id}
            </Typography>
            <IconButton size="small" onClick={onClose} aria-label="Close">
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>

          <div className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Tool
            </Typography>
            <Typography variant="body2" style={{ fontFamily: 'monospace' }}>
              {step.tool}
            </Typography>
            {step.description && (
              <Typography variant="body2" color="textSecondary">
                {step.description}
              </Typography>
            )}
          </div>

          <div className={classes.chips}>
            {step.store && <Chip size="small" label="store" />}
            {step.allow_failure && <Chip size="small" label="allow failure" />}
            {executionStep?.stored_as && (
              <Chip
                size="small"
                variant="outlined"
                label={`stored as ${executionStep.stored_as}`}
              />
            )}
          </div>

          {executionStep && (
            <div className={classes.section}>
              <Typography variant="subtitle2" className={classes.sectionTitle}>
                Timing
              </Typography>
              <Typography variant="body2">
                Started <DateComponent value={executionStep.started_at} />
                {' · '}
                {executionStep.status === 'inprogress'
                  ? 'running…'
                  : formatDuration(executionStep.duration_ms)}
              </Typography>
            </div>
          )}

          {executionStep?.error && (
            <div className={classes.section}>
              <Typography variant="subtitle2" className={classes.sectionTitle}>
                Error
              </Typography>
              <Typography component="pre" className={classes.error}>
                {executionStep.error}
              </Typography>
            </div>
          )}

          <JsonSection title="Condition" value={step.condition} />
          <JsonSection
            title={executionStep ? 'Resolved input' : 'Arguments (templated)'}
            value={executionStep?.input ?? step.args}
          />
          <JsonSection title="Result" value={executionStep?.result} />
        </>
      )}
    </Drawer>
  );
}
