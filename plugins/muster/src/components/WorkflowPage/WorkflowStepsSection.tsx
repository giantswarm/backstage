import { Fragment, ReactNode } from 'react';
import { Box, Flex, Link, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import CallSplit from '@material-ui/icons/CallSplit';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  WorkflowCondition,
  WorkflowStep,
  WorkflowSubStep,
} from '../../lib/k8s';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import {
  conditionSummary,
  formatArgValue,
  toolDisplay,
} from '../../lib/workflowDisplay';
import { workflowDetailRouteRef } from '../../routes';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    padding: theme.spacing(2),
    border: '1px solid var(--bui-border-1)',
    borderRadius: theme.shape.borderRadius * 2,
    backgroundColor: 'var(--bui-bg-surface-1)',
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
    color: 'var(--bui-fg-secondary)',
    fontSize: 12,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    border: '1px solid var(--bui-border-1)',
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    color: 'var(--bui-fg-secondary)',
  },
  conditionLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(0.75),
    marginTop: theme.spacing(1),
    color: theme.palette.info.dark,
    fontSize: 13,
    '& svg': { fontSize: 14, marginTop: 2, flexShrink: 0 },
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    wordBreak: 'break-all',
  },
  techBlock: {
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
    color: 'var(--bui-fg-secondary)',
  },
  argsGrid: {
    marginTop: theme.spacing(0.5),
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    columnGap: theme.spacing(3),
    rowGap: theme.spacing(0.5),
    // The sequence must stack at phone width: templated values can be long,
    // so below ~420px the grid folds to one column instead of overflowing.
    [theme.breakpoints.down(420)]: {
      gridTemplateColumns: '1fr',
    },
  },
  argKey: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--bui-fg-secondary)',
  },
  // Grouped sub-steps (forEach, parallel, onFailure) are indented under a rule.
  subSteps: {
    marginTop: theme.spacing(1),
    paddingLeft: theme.spacing(1.5),
    borderLeft: '2px solid var(--bui-border-1)',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
}));

/** The plain name a step goes by: its description first, else its id. */
function stepTitle(step: { id?: string; description?: string }): string {
  return step.description || step.id || '(unnamed step)';
}

/** `?installation=<inst>`, or nothing without one. */
function installationSearch(installation?: string): string {
  return installation
    ? `?installation=${encodeURIComponent(installation)}`
    : '';
}

/**
 * What a step calls, in plain words — the connector's name and the tool's
 * short name, "muster" for core tools, a link for a called workflow — or, in
 * technical mode, the exact aggregated tool name.
 */
function ToolLine({
  tool,
  prefixes,
  technical,
  installation,
}: {
  tool?: string;
  prefixes: ServerPrefixInfo[];
  technical: boolean;
  installation?: string;
}) {
  const classes = useStyles();
  const detailRoute = useRouteRef(workflowDetailRouteRef);
  if (!tool) {
    return null;
  }
  if (technical) {
    return (
      <Text as="p" variant="body-small" color="secondary">
        Tool <code className={classes.mono}>{tool}</code>
      </Text>
    );
  }
  const display = toolDisplay(tool, prefixes);
  let line: ReactNode;
  switch (display.kind) {
    case 'workflow': {
      const base = detailRoute?.({ name: display.workflow });
      line = (
        <>
          Runs the workflow{' '}
          {base ? (
            <Link
              href={`${base}${installationSearch(installation)}`}
              variant="body-small"
            >
              {display.workflow}
            </Link>
          ) : (
            display.workflow
          )}
        </>
      );
      break;
    }
    case 'connector':
      line = (
        <>
          Uses <code className={classes.mono}>{display.tool}</code> on the{' '}
          {display.connector} connector
        </>
      );
      break;
    case 'core':
      line = (
        <>
          Uses muster's <code className={classes.mono}>{display.tool}</code>
        </>
      );
      break;
    default:
      line = (
        <>
          Uses <code className={classes.mono}>{display.tool}</code>
        </>
      );
  }
  return (
    <Text as="p" variant="body-small" color="secondary">
      {line}
    </Text>
  );
}

/** The "Only if …" gate, with the exact spec behind the technical toggle. */
function ConditionLine({
  condition,
  stepIds,
  technical,
}: {
  condition: WorkflowCondition;
  stepIds: string[];
  technical: boolean;
}) {
  const classes = useStyles();
  const expectations: string[] = [];
  if (technical) {
    for (const [key, expectation] of [
      ['expect', condition.expect],
      ['expectNot', condition.expectNot],
    ] as const) {
      if (!expectation) {
        continue;
      }
      const clauses: string[] = [];
      if (expectation.success !== undefined) {
        clauses.push(`success=${String(expectation.success)}`);
      }
      for (const [k, v] of Object.entries(expectation.jsonPath ?? {})) {
        clauses.push(`${k}=${String(v)}`);
      }
      expectations.push(`${key}: ${clauses.join(', ')}`);
    }
  }
  return (
    <div className={classes.conditionLine}>
      <CallSplit />
      <span>
        {conditionSummary(condition, stepIds)}
        {technical && (
          <>
            {condition.template && (
              <div className={classes.mono}>template: {condition.template}</div>
            )}
            {condition.tool && (
              <div className={classes.mono}>
                tool: {condition.tool}
                {condition.args && Object.keys(condition.args).length > 0
                  ? ` ${JSON.stringify(condition.args)}`
                  : ''}
              </div>
            )}
            {condition.fromStep && (
              <div className={classes.mono}>fromStep: {condition.fromStep}</div>
            )}
            {expectations.map(clause => (
              <div key={clause} className={classes.mono}>
                {clause}
              </div>
            ))}
          </>
        )}
      </span>
    </div>
  );
}

/** The templated arguments of a step's call — technical detail only. */
function TechnicalCall({
  step,
}: {
  step: Pick<WorkflowSubStep, 'id' | 'args' | 'store' | 'output'>;
}) {
  const classes = useStyles();
  const entries = Object.entries(step.args ?? {});
  const flags = [
    step.store ? 'stores its result for later steps' : undefined,
    step.output ? 'contributes to the workflow output' : undefined,
  ].filter(Boolean);
  if (entries.length === 0 && flags.length === 0 && !step.id) {
    return null;
  }
  return (
    <Box className={classes.techBlock}>
      {step.id && (
        <Text as="p" variant="body-small">
          <span className={classes.caption}>Step id </span>
          <code className={classes.mono}>{step.id}</code>
        </Text>
      )}
      {entries.length > 0 && (
        <>
          <Text as="p" variant="body-small" className={classes.caption}>
            Arguments (templated)
          </Text>
          <div className={classes.argsGrid}>
            {entries.map(([key, value]) => (
              <Fragment key={key}>
                <span className={classes.argKey}>{key}</span>
                <span className={classes.mono}>{formatArgValue(value)}</span>
              </Fragment>
            ))}
          </div>
        </>
      )}
      {flags.length > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          {flags.join(' · ')}
        </Text>
      )}
    </Box>
  );
}

function StepBody({
  step,
  stepIds,
  prefixes,
  technical,
  installation,
}: {
  step: WorkflowSubStep | WorkflowStep;
  stepIds: string[];
  prefixes: ServerPrefixInfo[];
  technical: boolean;
  installation?: string;
}) {
  return (
    <>
      {step.condition && (
        <ConditionLine
          condition={step.condition}
          stepIds={stepIds}
          technical={technical}
        />
      )}
      <ToolLine
        tool={step.tool}
        prefixes={prefixes}
        technical={technical}
        installation={installation}
      />
      {technical && <TechnicalCall step={step} />}
    </>
  );
}

function SubStepCard({
  subStep,
  stepIds,
  prefixes,
  technical,
  installation,
}: {
  subStep: WorkflowSubStep;
  stepIds: string[];
  prefixes: ServerPrefixInfo[];
  technical: boolean;
  installation?: string;
}) {
  const classes = useStyles();
  return (
    <Box>
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Text variant="body-medium" weight="bold">
          {stepTitle(subStep)}
        </Text>
        {subStep.allowFailure && (
          <span className={classes.badge}>May fail without stopping</span>
        )}
      </Flex>
      <StepBody
        step={subStep}
        stepIds={stepIds}
        prefixes={prefixes}
        technical={technical}
        installation={installation}
      />
    </Box>
  );
}

export interface WorkflowStepsSectionProps {
  steps: WorkflowStep[];
  /** Best-effort cleanup steps muster runs when a step fails. */
  onFailure: WorkflowSubStep[];
  /** Connector prefixes of the installation, for plain tool names. */
  prefixes: ServerPrefixInfo[];
  /** Whether the technical toggle is on: exact tool names, args, specs. */
  technical: boolean;
  installation?: string;
}

/**
 * The workflow's steps as a readable sequence: one numbered card per step with
 * its description (the id where there is none), the plain name of the tool and
 * connector it calls, an "Only if …" line for a condition, and forEach /
 * parallel groups as indented blocks. The onFailure steps render as their own
 * "If it fails" lane at the end. The technical toggle adds exact tool names,
 * templated arguments, step ids and the full condition specs.
 */
export function WorkflowStepsSection({
  steps,
  onFailure,
  prefixes,
  technical,
  installation,
}: WorkflowStepsSectionProps) {
  const classes = useStyles();
  const stepIds = steps.map(step => step.id);

  if (steps.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        This workflow defines no steps.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {steps.map((step, index) => {
        const parallel = step.parallel ?? [];
        const forEach = step.forEach;
        return (
          <Box key={step.id ?? index} className={classes.card}>
            <div className={classes.header}>
              <span className={classes.index}>{index + 1}</span>
              <Text variant="body-medium" weight="bold">
                {stepTitle(step)}
              </Text>
              {step.allowFailure && (
                <span className={classes.badge}>May fail without stopping</span>
              )}
            </div>

            <StepBody
              step={step}
              stepIds={stepIds}
              prefixes={prefixes}
              technical={technical}
              installation={installation}
            />

            {forEach && (
              <>
                <Text as="p" variant="body-small" color="secondary">
                  For each item in{' '}
                  <code className={classes.mono}>{forEach.items}</code>
                  {forEach.as ? ` (as ${forEach.as})` : ''}:
                </Text>
                <div className={classes.subSteps}>
                  {forEach.steps.map(sub => (
                    <SubStepCard
                      key={sub.id}
                      subStep={sub}
                      stepIds={stepIds}
                      prefixes={prefixes}
                      technical={technical}
                      installation={installation}
                    />
                  ))}
                </div>
              </>
            )}

            {parallel.length > 0 && (
              <>
                <Text as="p" variant="body-small" color="secondary">
                  These run at the same time:
                </Text>
                <div className={classes.subSteps}>
                  {parallel.map(sub => (
                    <SubStepCard
                      key={sub.id}
                      subStep={sub}
                      stepIds={stepIds}
                      prefixes={prefixes}
                      technical={technical}
                      installation={installation}
                    />
                  ))}
                </div>
              </>
            )}
          </Box>
        );
      })}

      {onFailure.length > 0 && (
        <Box className={classes.card}>
          <Text variant="body-medium" weight="bold">
            If it fails
          </Text>
          <Text as="p" variant="body-small" color="secondary">
            Best-effort cleanup muster runs when a step fails.
          </Text>
          <div className={classes.subSteps}>
            {onFailure.map(sub => (
              <SubStepCard
                key={sub.id}
                subStep={sub}
                stepIds={stepIds}
                prefixes={prefixes}
                technical={technical}
                installation={installation}
              />
            ))}
          </div>
        </Box>
      )}
    </Flex>
  );
}
