import { ReactNode } from 'react';
import {
  Box,
  Paper,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import AccountTree from '@material-ui/icons/AccountTree';
import CallSplit from '@material-ui/icons/CallSplit';
import ChevronRight from '@material-ui/icons/ChevronRight';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  WorkflowStep,
  WorkflowSubStep,
  WorkflowCondition,
} from '../../lib/k8s';
import { VIOLET } from '../shared';
import { workflowDetailRouteRef } from '../../routes';

const WORKFLOW_TOOL_PREFIX = 'workflow_';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
    marginBottom: theme.spacing(1.5),
    '&:last-child': {
      marginBottom: 0,
    },
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.75, 1.5),
  },
  index: {
    flexShrink: 0,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    fontSize: 12,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  stepId: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 500,
  },
  badges: {
    marginLeft: 'auto',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    '& svg': { fontSize: 12 },
  },
  badgeOutline: {
    border: `1px solid ${theme.palette.divider}`,
  },
  badgeNeutral: {
    backgroundColor: theme.palette.action.selected,
    color: theme.palette.text.secondary,
  },
  description: {
    marginTop: theme.spacing(1),
    color: theme.palette.text.secondary,
  },
  // The muted Tool/Arguments call block (mockup `bg-muted/50`).
  callBlock: {
    marginTop: theme.spacing(1),
    padding: theme.spacing(1.25),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
  },
  caption: {
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: 11,
    fontWeight: 500,
    color: theme.palette.text.secondary,
  },
  tool: {
    display: 'block',
    marginTop: 2,
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 500,
    wordBreak: 'break-all',
  },
  toolLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    marginTop: 2,
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 500,
    wordBreak: 'break-all',
  },
  argsDivider: {
    marginTop: theme.spacing(1.25),
    paddingTop: theme.spacing(1.25),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  argsGrid: {
    marginTop: theme.spacing(0.5),
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    columnGap: theme.spacing(3),
    rowGap: theme.spacing(0.5),
  },
  argKey: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  argValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    wordBreak: 'break-all',
  },
  // Blue "Conditional — runs only if" callout.
  conditionBox: {
    marginTop: theme.spacing(1),
    padding: theme.spacing(1.25),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.info.main}`,
    backgroundColor: `${theme.palette.info.main}14`,
  },
  conditionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    fontSize: 12,
    fontWeight: 500,
    color: theme.palette.info.dark,
    '& svg': { fontSize: 14 },
  },
  conditionList: {
    margin: theme.spacing(0.75, 0, 0),
    paddingLeft: 0,
    listStyle: 'none',
  },
  conditionItem: {
    fontSize: 12,
  },
  mono: {
    fontFamily: 'monospace',
  },
  subSteps: {
    marginTop: theme.spacing(1),
    paddingLeft: theme.spacing(1.5),
    borderLeft: `2px solid ${theme.palette.divider}`,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  subHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
  },
  groupLabel: {
    marginTop: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
}));

function workflowToolSlug(tool?: string): string | null {
  return tool && tool.startsWith(WORKFLOW_TOOL_PREFIX)
    ? tool.slice(WORKFLOW_TOOL_PREFIX.length)
    : null;
}

/** Format an argument value for the definition list (objects → compact JSON). */
function formatArgValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function ToolBlock({
  tool,
  args,
  installation,
}: {
  tool?: string;
  args?: Record<string, unknown>;
  installation?: string;
}) {
  const classes = useStyles();
  const theme = useTheme();
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);
  const slug = workflowToolSlug(tool);
  const entries = Object.entries(args ?? {});

  let toolNode: ReactNode;
  if (!tool) {
    toolNode = <code className={classes.tool}>(no tool)</code>;
  } else if (slug) {
    const base = workflowDetailLink?.({ name: slug }) ?? '#';
    const href = installation
      ? `${base}?installation=${encodeURIComponent(installation)}`
      : base;
    toolNode = (
      <Link to={href} className={classes.toolLink}>
        <AccountTree style={{ fontSize: 14, color: VIOLET }} />
        <code>{tool}</code>
        <ChevronRight
          style={{ fontSize: 14, color: theme.palette.text.secondary }}
        />
      </Link>
    );
  } else {
    toolNode = <code className={classes.tool}>{tool}</code>;
  }

  return (
    <Box className={classes.callBlock}>
      <Typography component="div" className={classes.caption}>
        Tool
      </Typography>
      {toolNode}
      {entries.length > 0 && (
        <Box className={classes.argsDivider}>
          <Typography component="div" className={classes.caption}>
            Arguments
          </Typography>
          <Box className={classes.argsGrid}>
            {entries.map(([k, v]) => (
              <Box key={k} display="contents">
                <span className={classes.argKey}>{k}</span>
                <span className={classes.argValue}>{formatArgValue(v)}</span>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ConditionCallout({
  condition,
  fromStepNumber,
}: {
  condition: WorkflowCondition;
  fromStepNumber?: number;
}) {
  const classes = useStyles();

  let source: ReactNode = 'a probe';
  if (condition.fromStep) {
    source = (
      <>
        the stored result of step{fromStepNumber ? ` ${fromStepNumber}` : ''}{' '}
        <code className={classes.mono}>{condition.fromStep}</code>
      </>
    );
  } else if (condition.tool) {
    source = (
      <>
        a <code className={classes.mono}>{condition.tool}</code> probe
      </>
    );
  } else if (condition.template) {
    source = (
      <>
        <code className={classes.mono}>{condition.template}</code>
      </>
    );
  }

  const clauses: {
    key: string;
    verb: string;
    expectation?: typeof condition.expect;
  }[] = [];
  if (condition.expect) {
    clauses.push({
      key: 'expect',
      verb: 'matches',
      expectation: condition.expect,
    });
  }
  if (condition.expectNot) {
    clauses.push({
      key: 'expectNot',
      verb: 'does not match',
      expectation: condition.expectNot,
    });
  }

  return (
    <Box className={classes.conditionBox}>
      <Typography component="div" className={classes.conditionHead}>
        <CallSplit />
        Conditional — runs only if {source}:
      </Typography>
      {clauses.length > 0 && (
        <ul className={classes.conditionList}>
          {clauses.map(c => (
            <li key={c.key} className={classes.conditionItem}>
              <Typography
                component="span"
                variant="caption"
                color="textSecondary"
              >
                {c.verb}{' '}
              </Typography>
              {c.expectation?.success !== undefined && (
                <span className={classes.mono}>
                  success={String(c.expectation.success)}
                </span>
              )}
              {c.expectation?.jsonPath &&
                Object.entries(c.expectation.jsonPath).map(([k, v], i) => (
                  <span key={k} className={classes.mono}>
                    {(c.expectation?.success !== undefined || i > 0) && ', '}
                    {k}={String(v)}
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Box>
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
  const theme = useTheme();
  const callsWorkflow = Boolean(workflowToolSlug(step.tool));
  const badges: ReactNode[] = [];

  if (callsWorkflow) {
    badges.push(
      <span
        key="calls"
        className={`${classes.badge} ${classes.badgeOutline}`}
        style={{ color: VIOLET }}
      >
        <AccountTree />
        Calls workflow
      </span>,
    );
  }
  if (step.condition) {
    badges.push(
      <span
        key="cond"
        className={`${classes.badge} ${classes.badgeOutline}`}
        style={{ color: theme.palette.info.dark }}
      >
        <CallSplit />
        Conditional
      </span>,
    );
  }
  if (parallel) {
    badges.push(
      <span
        key="parallel"
        className={`${classes.badge} ${classes.badgeNeutral}`}
      >
        Parallel group
      </span>,
    );
  }
  if (loop) {
    badges.push(
      <span key="loop" className={`${classes.badge} ${classes.badgeNeutral}`}>
        Loop (forEach)
      </span>,
    );
  }
  if (step.store) {
    badges.push(
      <span key="store" className={`${classes.badge} ${classes.badgeNeutral}`}>
        Stores result
      </span>,
    );
  }
  if (step.allowFailure) {
    badges.push(
      <span key="allow" className={`${classes.badge} ${classes.badgeNeutral}`}>
        Allows failure
      </span>,
    );
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
    <Box>
      <Box className={classes.subHead}>
        <span className={classes.stepId}>{subStep.id}</span>
        <StepBadges step={subStep} />
      </Box>
      {subStep.description && (
        <Typography variant="body2" className={classes.description}>
          {subStep.description}
        </Typography>
      )}
      {subStep.condition && <ConditionCallout condition={subStep.condition} />}
      <ToolBlock
        tool={subStep.tool}
        args={subStep.args}
        installation={installation}
      />
    </Box>
  );
}

export interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  installation?: string;
  /** All step ids in order, used to resolve a condition's `fromStep` number. */
  stepIds?: string[];
}

/**
 * One ordered workflow step, rendered to the mockup's numbered-card spec: a
 * numbered circle, the step id, right-aligned status badges (violet "Calls
 * workflow", blue "Conditional", neutral "Stores result"/"Allows failure"), the
 * blue "Conditional — runs only if" callout, and the muted Tool/Arguments call
 * block (a definition list, not a JSON dump). Workflow cross-links jump to the
 * called workflow's detail page carrying the active installation.
 */
export function WorkflowStepCard({
  step,
  index,
  installation,
  stepIds,
}: WorkflowStepCardProps) {
  const classes = useStyles();
  const parallel = Boolean(step.parallel && step.parallel.length > 0);
  const loop = Boolean(step.forEach);

  const fromStepNumber =
    step.condition?.fromStep && stepIds
      ? stepIds.indexOf(step.condition.fromStep) + 1 || undefined
      : undefined;

  return (
    <Paper variant="outlined" className={classes.card}>
      <Box className={classes.header}>
        <span className={classes.index}>{index + 1}</span>
        <span className={classes.stepId}>{step.id}</span>
        <StepBadges step={step} parallel={parallel} loop={loop} />
      </Box>

      {step.description && (
        <Typography variant="body2" className={classes.description}>
          {step.description}
        </Typography>
      )}

      {step.condition && (
        <ConditionCallout
          condition={step.condition}
          fromStepNumber={fromStepNumber}
        />
      )}

      {step.tool && (
        <ToolBlock
          tool={step.tool}
          args={step.args}
          installation={installation}
        />
      )}

      {step.forEach && (
        <>
          <Typography variant="caption" className={classes.groupLabel}>
            For each <code className={classes.mono}>{step.forEach.items}</code>
            {step.forEach.as ? ` as ${step.forEach.as}` : ''}
          </Typography>
          <Box className={classes.subSteps}>
            {step.forEach.steps.map(sub => (
              <SubStepCard
                key={sub.id}
                subStep={sub}
                installation={installation}
              />
            ))}
          </Box>
        </>
      )}

      {parallel && (
        <>
          <Typography variant="caption" className={classes.groupLabel}>
            Runs in parallel:
          </Typography>
          <Box className={classes.subSteps}>
            {step.parallel!.map(sub => (
              <SubStepCard
                key={sub.id}
                subStep={sub}
                installation={installation}
              />
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
}
