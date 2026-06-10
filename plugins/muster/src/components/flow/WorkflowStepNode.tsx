import { CSSProperties, memo } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import {
  Chip,
  makeStyles,
  Theme,
  Typography,
  useTheme,
} from '@material-ui/core';
import classNames from 'classnames';
import { StepNodeData } from '../../lib/workflowToGraph';
import { WorkflowCondition } from '../../apis/types';
import { statusColor } from './statusColors';
import { StatusIcon } from './StatusIcon';

const useStyles = makeStyles((theme: Theme) => ({
  node: {
    width: 320,
    borderRadius: theme.shape.borderRadius * 2,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.shadows[1],
    overflow: 'hidden',
    fontFamily: theme.typography.fontFamily,
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
    borderTop: '3px solid var(--muster-status-color)',
  },
  selected: {
    borderColor: theme.palette.primary.main,
    boxShadow: theme.shadows[4],
  },
  skipped: {
    opacity: 0.65,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  stepId: {
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  content: {
    padding: theme.spacing(1, 1.5),
  },
  tool: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    wordBreak: 'break-all',
  },
  description: {
    display: 'block',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.75, 1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
  },
  chip: {
    height: 20,
    fontSize: '0.65rem',
  },
  conditionHandle: {
    top: '50%',
  },
}));

function conditionSummary(condition: WorkflowCondition): string {
  const negated = condition.expect_not !== undefined;
  const source = condition.from_step
    ? `from ${condition.from_step}`
    : (condition.tool ?? '');
  return `${negated ? 'unless' : 'if'} ${source}`.trim();
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function skippedChipLabel(data: StepNodeData): string | undefined {
  if (data.status !== 'skipped') {
    return undefined;
  }
  if (data.conditionEvaluation === undefined) {
    return 'skipped';
  }
  return `skipped (condition: ${data.conditionEvaluation})`;
}

type Props = NodeProps & { data: StepNodeData };

export const WorkflowStepNode = memo(({ data, selected }: Props) => {
  const classes = useStyles();
  const theme = useTheme();
  const { step, status } = data;
  const condition = step.condition;
  const skippedLabel = skippedChipLabel(data);
  const stripeColor =
    status !== undefined ? statusColor(theme, status) : 'transparent';

  const hasFooter = Boolean(
    step.store ||
    step.allow_failure ||
    condition ||
    skippedLabel ||
    data.executionStep?.error,
  );

  return (
    <div
      className={classNames(classes.node, {
        [classes.selected]: selected,
        [classes.skipped]: status === 'skipped',
      })}
      style={{ '--muster-status-color': stripeColor } as CSSProperties}
      data-testid={`workflow-step-node-${step.id}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className={classes.header}>
        {status && <StatusIcon status={status} />}
        <Typography variant="body2" className={classes.stepId}>
          {step.id}
        </Typography>
        {data.executionStep && (
          <Typography variant="caption" color="textSecondary">
            {formatDuration(data.executionStep.duration_ms)}
          </Typography>
        )}
      </div>
      <div className={classes.content}>
        <Typography variant="body2" className={classes.tool}>
          {step.tool}
        </Typography>
        {step.description && (
          <Typography variant="caption" className={classes.description}>
            {step.description}
          </Typography>
        )}
      </div>
      {hasFooter && (
        <div className={classes.footer}>
          {step.store && (
            <Chip className={classes.chip} size="small" label="store" />
          )}
          {step.allow_failure && (
            <Chip className={classes.chip} size="small" label="allow failure" />
          )}
          {condition && (
            <Chip
              className={classes.chip}
              size="small"
              variant="outlined"
              label={conditionSummary(condition)}
            />
          )}
          {skippedLabel && (
            <Chip className={classes.chip} size="small" label={skippedLabel} />
          )}
          {data.executionStep?.error && (
            <Chip
              className={classes.chip}
              size="small"
              color="secondary"
              label="error"
            />
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
      <Handle
        type="source"
        id="condition-out"
        position={Position.Right}
        className={classes.conditionHandle}
        isConnectable={false}
      />
      <Handle
        type="target"
        id="condition-in"
        position={Position.Right}
        className={classes.conditionHandle}
        isConnectable={false}
      />
    </div>
  );
});
