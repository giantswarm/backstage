import { ReactNode } from 'react';
import { Box, Chip, Typography, makeStyles, Theme } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { JsonHighlight } from '@giantswarm/backstage-plugin-ui-react';
import {
  WorkflowStep,
  WorkflowSubStep,
  WorkflowCondition,
} from '../../lib/k8s';
import { workflowDetailRouteRef } from '../../routes';

const WORKFLOW_TOOL_PREFIX = 'workflow_';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(1.5),
  },
  subCard: {
    borderLeft: `2px solid ${theme.palette.divider}`,
    paddingLeft: theme.spacing(1.5),
    marginTop: theme.spacing(1),
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  index: {
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  },
  stepId: {
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  tool: {
    fontFamily: 'monospace',
    color: theme.palette.text.secondary,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    margin: theme.spacing(0.5, 0),
  },
  block: {
    marginTop: theme.spacing(1),
  },
  blockLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
}));

/** Resolve the call target: a workflow cross-link or a plain tool name. */
function ToolName({
  tool,
  installation,
}: {
  tool?: string;
  installation?: string;
}) {
  const classes = useStyles();
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);

  if (!tool) {
    return <span className={classes.tool}>(no tool)</span>;
  }
  if (tool.startsWith(WORKFLOW_TOOL_PREFIX)) {
    const target = tool.slice(WORKFLOW_TOOL_PREFIX.length);
    const base = workflowDetailLink?.({ name: target }) ?? '#';
    const href = installation
      ? `${base}?installation=${encodeURIComponent(installation)}`
      : base;
    return (
      <span className={classes.tool}>
        <Link to={href}>{tool}</Link>
      </span>
    );
  }
  return <span className={classes.tool}>{tool}</span>;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const classes = useStyles();
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return null;
  }
  return (
    <div className={classes.block}>
      <Typography variant="caption" className={classes.blockLabel}>
        {label}
      </Typography>
      <JsonHighlight customStyle={{ margin: 0, fontSize: '0.75rem' }}>
        {JSON.stringify(value, null, 2)}
      </JsonHighlight>
    </div>
  );
}

interface StepLike {
  id?: string;
  tool?: string;
  args?: Record<string, unknown>;
  condition?: WorkflowCondition;
  store?: boolean;
  allowFailure?: boolean;
  description?: string;
}

/** The badges shared by steps and sub-steps. */
function StepBadges({
  step,
  parallel,
  loop,
}: {
  step: StepLike;
  parallel?: boolean;
  loop?: boolean;
}) {
  const classes = useStyles();
  const callsWorkflow = step.tool?.startsWith(WORKFLOW_TOOL_PREFIX);
  const badges: ReactNode[] = [];
  if (callsWorkflow) {
    badges.push(
      <Chip key="calls" size="small" color="primary" label="Calls workflow" />,
    );
  }
  if (parallel) {
    badges.push(<Chip key="parallel" size="small" label="Parallel group" />);
  }
  if (loop) {
    badges.push(<Chip key="loop" size="small" label="Loop (forEach)" />);
  }
  if (step.condition) {
    badges.push(<Chip key="cond" size="small" label="Conditional" />);
  }
  if (step.store) {
    badges.push(<Chip key="store" size="small" label="Stores result" />);
  }
  if (step.allowFailure) {
    badges.push(<Chip key="allow" size="small" label="Allows failure" />);
  }
  if (badges.length === 0) {
    return null;
  }
  return <Box className={classes.badges}>{badges}</Box>;
}

function SubStepCard({
  subStep,
  installation,
}: {
  subStep: WorkflowSubStep;
  installation?: string;
}) {
  const classes = useStyles();
  return (
    <Box className={classes.subCard}>
      <div className={classes.header}>
        <span className={classes.stepId}>{subStep.id}</span>
        <ToolName tool={subStep.tool} installation={installation} />
      </div>
      <StepBadges step={subStep} />
      {subStep.description && (
        <Typography variant="body2" color="textSecondary">
          {subStep.description}
        </Typography>
      )}
      <JsonBlock label="Condition" value={subStep.condition} />
      <JsonBlock label="Arguments (templated)" value={subStep.args} />
    </Box>
  );
}

export interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  installation?: string;
}

/**
 * One ordered workflow step rendered from the CRD spec. Surfaces the structure
 * the mockups asked for: badges for cross-workflow calls, conditional
 * execution, result storage, tolerated failure, and parallel/loop groups, plus
 * the condition and templated-argument blocks. Cross-links jump to the called
 * workflow's detail page.
 */
export function WorkflowStepCard({
  step,
  index,
  installation,
}: WorkflowStepCardProps) {
  const classes = useStyles();
  const parallel = step.parallel && step.parallel.length > 0;
  const loop = Boolean(step.forEach);

  return (
    <Box className={classes.card}>
      <div className={classes.header}>
        <span className={classes.index}>{index + 1}.</span>
        <span className={classes.stepId}>{step.id}</span>
        {step.tool && <ToolName tool={step.tool} installation={installation} />}
      </div>
      <StepBadges step={step} parallel={parallel} loop={loop} />
      {step.description && (
        <Typography variant="body2" color="textSecondary">
          {step.description}
        </Typography>
      )}
      <JsonBlock label="Condition" value={step.condition} />
      {step.tool && (
        <JsonBlock label="Arguments (templated)" value={step.args} />
      )}

      {step.forEach && (
        <div className={classes.block}>
          <Typography variant="caption" className={classes.blockLabel}>
            For each <code>{step.forEach.items}</code>
            {step.forEach.as ? ` as ${step.forEach.as}` : ''}
          </Typography>
          {step.forEach.steps.map(sub => (
            <SubStepCard
              key={sub.id}
              subStep={sub}
              installation={installation}
            />
          ))}
        </div>
      )}

      {parallel && (
        <div className={classes.block}>
          <Typography variant="caption" className={classes.blockLabel}>
            Runs in parallel:
          </Typography>
          {step.parallel!.map(sub => (
            <SubStepCard
              key={sub.id}
              subStep={sub}
              installation={installation}
            />
          ))}
        </div>
      )}
    </Box>
  );
}
