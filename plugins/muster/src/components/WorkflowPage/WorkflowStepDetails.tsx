import { Fragment, ReactNode } from 'react';
import { Box, Button, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import type { WorkflowCondition, WorkflowSubStep } from '../../lib/k8s';
import type { ToolEffect } from '../../lib/toolAnnotations';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { formatDuration } from '../../lib/formatDuration';
import {
  conditionSummary,
  formatArgValue,
  toolDisplay,
  WORKFLOW_EFFECT_LABELS,
} from '../../lib/workflowDisplay';
import {
  FlowStepContext,
  forEachSummary,
  StepRunOverlay,
} from '../../lib/workflowGraph';
import { workflowDetailRouteRef } from '../../routes';
import { DisclosureAccordion } from '../shared';

const useStyles = makeStyles({
  panel: {
    border: '1px solid var(--bui-border-2)',
    borderRadius: 12,
    background: 'var(--bui-bg-neutral-1)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  facts: {
    margin: 0,
    paddingLeft: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    wordBreak: 'break-all',
  },
  caption: {
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--bui-fg-secondary)',
  },
  grid: {
    marginTop: 4,
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    columnGap: 24,
    rowGap: 4,
    // Templated values can be long: below ~420px the grid folds to one
    // column instead of overflowing the phone.
    '@media (max-width: 420px)': {
      gridTemplateColumns: '1fr',
    },
  },
  key: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--bui-fg-secondary)',
  },
});

/** `?installation=<inst>`, or nothing without one. */
function installationSearch(installation?: string): string {
  return installation
    ? `?installation=${encodeURIComponent(installation)}`
    : '';
}

/** What a step calls, in plain words — a link for a called workflow. */
function PlainTool({
  tool,
  prefixes,
  installation,
}: {
  tool: string;
  prefixes: ServerPrefixInfo[];
  installation?: string;
}) {
  const classes = useStyles();
  const detailRoute = useRouteRef(workflowDetailRouteRef);
  const display = toolDisplay(tool, prefixes);
  switch (display.kind) {
    case 'workflow': {
      const base = detailRoute?.({ name: display.workflow });
      return (
        <>
          Runs the workflow{' '}
          {base ? (
            <Link
              href={`${base}${installationSearch(installation)}`}
              variant="body-medium"
            >
              {display.workflow}
            </Link>
          ) : (
            display.workflow
          )}
          .
        </>
      );
    }
    case 'connector':
      return (
        <>
          Uses <code className={classes.mono}>{display.tool}</code> on the{' '}
          {display.connector} connector.
        </>
      );
    case 'core':
      return (
        <>
          Uses muster's <code className={classes.mono}>{display.tool}</code>.
        </>
      );
    default:
      return (
        <>
          Uses <code className={classes.mono}>{display.tool}</code>.
        </>
      );
  }
}

/** The last run's outcome for this step, in a sentence. */
export function lastRunSentence(overlay: StepRunOverlay): string {
  const times = overlay.runs > 1 ? ` (${overlay.runs} times)` : '';
  const took =
    overlay.durationMs !== undefined
      ? ` in ${formatDuration(overlay.durationMs)}`
      : '';
  switch (overlay.status) {
    case 'completed':
      return `Last run: succeeded${times}${took}.`;
    case 'failed':
      return `Last run: failed${times}${
        overlay.error ? ` — ${overlay.error}` : '.'
      }`;
    case 'running':
      return 'Last run: still running.';
    case 'skipped':
      return 'Last run: skipped — its condition did not hold.';
    case 'notRun':
    default:
      return 'Last run: did not run.';
  }
}

/** The exact condition spec, clause by clause. */
function conditionClauses(condition: WorkflowCondition): string[] {
  const clauses: string[] = [];
  if (condition.template) clauses.push(`template: ${condition.template}`);
  if (condition.tool) {
    clauses.push(
      `tool: ${condition.tool}${
        condition.args && Object.keys(condition.args).length > 0
          ? ` ${JSON.stringify(condition.args)}`
          : ''
      }`,
    );
  }
  if (condition.fromStep) clauses.push(`fromStep: ${condition.fromStep}`);
  for (const [key, expectation] of [
    ['expect', condition.expect],
    ['expectNot', condition.expectNot],
  ] as const) {
    if (!expectation) continue;
    const parts: string[] = [];
    if (expectation.success !== undefined) {
      parts.push(`success=${String(expectation.success)}`);
    }
    for (const [k, v] of Object.entries(expectation.jsonPath ?? {})) {
      parts.push(`${k}=${String(v)}`);
    }
    clauses.push(`${key}: ${parts.join(', ')}`);
  }
  return clauses;
}

/** The step's technical fields: id, exact tool, templated args, specs. */
function TechnicalFields({ context }: { context: FlowStepContext }) {
  const classes = useStyles();
  const { node, group } = context;
  const definition = node.definition as WorkflowSubStep;
  const args = Object.entries(definition.args ?? {});
  const isHead = group?.node.key === node.key;
  const rows: [string, ReactNode][] = [
    ['Step id', <code className={classes.mono}>{node.id}</code>],
  ];
  if (node.tool) {
    rows.push(['Tool', <code className={classes.mono}>{node.tool}</code>]);
  }
  if (isHead && group?.kind === 'forEach') {
    rows.push([
      'Items',
      <code className={classes.mono}>{group.forEach.items}</code>,
    ]);
    if (group.forEach.as) {
      rows.push([
        'As',
        <code className={classes.mono}>{group.forEach.as}</code>,
      ]);
    }
  }
  if (node.condition) {
    rows.push([
      'Condition',
      <>
        {conditionClauses(node.condition).map(clause => (
          <div key={clause} className={classes.mono}>
            {clause}
          </div>
        ))}
      </>,
    ]);
  }
  const flags = [
    definition.store ? 'stores its result for later steps' : undefined,
    definition.output ? 'contributes to the workflow output' : undefined,
  ].filter(Boolean);
  if (flags.length > 0) {
    rows.push(['Result', flags.join(' · ')]);
  }

  return (
    <Flex direction="column" gap="2">
      <div className={classes.grid}>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <span className={classes.caption}>{label}</span>
            <span>{value}</span>
          </Fragment>
        ))}
      </div>
      {args.length > 0 && (
        <Box>
          <Text as="p" variant="body-small" className={classes.caption}>
            Arguments (templated)
          </Text>
          <div className={classes.grid}>
            {args.map(([key, value]) => (
              <Fragment key={key}>
                <span className={classes.key}>{key}</span>
                <span className={classes.mono}>{formatArgValue(value)}</span>
              </Fragment>
            ))}
          </div>
        </Box>
      )}
    </Flex>
  );
}

export interface WorkflowStepDetailsProps {
  context: FlowStepContext;
  /** Top-level step ids, to name a `fromStep` reference by number. */
  stepIds: string[];
  prefixes: ServerPrefixInfo[];
  installation?: string;
  /** The latest run's outcome for this step, when a run is known. */
  overlay?: StepRunOverlay;
  /** What the step's tool does, from the tool catalogue, when known. */
  effect?: ToolEffect;
  onClose: () => void;
}

/**
 * One step's details, opened from the flow canvas: the plain description
 * first — what it calls, when it is skipped, whether it may fail, how the last
 * run went — then its own "Show technical information" fold-out with the
 * exact tool name, templated arguments and condition spec. Disclosure is per
 * step: nothing technical shows until a reader asks for it on this step.
 */
export function WorkflowStepDetails({
  context,
  stepIds,
  prefixes,
  installation,
  overlay,
  effect,
  onClose,
}: WorkflowStepDetailsProps) {
  const classes = useStyles();
  const { node, group } = context;
  const isHead = group?.node.key === node.key;
  const parent = !isHead ? group : undefined;
  const heading =
    node.lane === 'cleanup'
      ? `Cleanup step · ${node.title}`
      : `Step ${node.number} · ${node.title}`;

  const facts: ReactNode[] = [];
  if (node.tool) {
    facts.push(
      <PlainTool
        tool={node.tool}
        prefixes={prefixes}
        installation={installation}
      />,
    );
  }
  if (isHead && group?.kind === 'forEach') {
    const count = group.children.length;
    facts.push(
      `${forEachSummary(group.forEach, stepIds)}, it runs its ${count} step${
        count === 1 ? '' : 's'
      } in order.`,
    );
  }
  if (isHead && group?.kind === 'parallel') {
    const count = group.children.length;
    facts.push(
      `Runs its ${count} step${count === 1 ? '' : 's'} at the same time.`,
    );
  }
  if (parent) {
    facts.push(
      parent.kind === 'forEach'
        ? `Part of step ${parent.node.number} (${parent.node.title}): ${forEachSummary(
            parent.forEach,
            stepIds,
          ).replace(/^F/, 'f')}.`
        : `Part of step ${parent.node.number} (${parent.node.title}): runs at the same time as its siblings.`,
    );
  }
  if (node.lane === 'cleanup') {
    facts.push(
      'Runs only when a step fails, as best-effort cleanup — its own failure does not stop the cleanup.',
    );
  }
  if (node.condition) {
    facts.push(
      `${conditionSummary(
        node.condition,
        stepIds,
      )} — otherwise this step is skipped.`,
    );
  }
  if (node.allowFailure) {
    facts.push('May fail without stopping the workflow.');
  }
  if (effect) {
    facts.push(
      effect === 'reads'
        ? `Its tool ${WORKFLOW_EFFECT_LABELS.reads.toLowerCase()}.`
        : 'Its tool can change things.',
    );
  }
  if (overlay) {
    facts.push(lastRunSentence(overlay));
  }

  return (
    <section
      className={classes.panel}
      aria-label={`Details of ${heading}`}
      data-testid="workflow-step-details"
    >
      <div className={classes.head}>
        <Text as="h3" variant="title-x-small">
          {heading}
        </Text>
        <Button variant="tertiary" size="small" onPress={onClose}>
          Close
        </Button>
      </div>
      <ul className={classes.facts}>
        {facts.map((fact, index) => (
          <li key={index}>
            <Text as="span" variant="body-medium">
              {fact}
            </Text>
          </li>
        ))}
      </ul>
      <DisclosureAccordion summary="Show technical information">
        <TechnicalFields context={context} />
      </DisclosureAccordion>
    </section>
  );
}
