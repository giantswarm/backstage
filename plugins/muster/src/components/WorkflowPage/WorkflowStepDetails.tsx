import { Fragment, ReactNode } from 'react';
import { Box, Button, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { countNoun, PHONE_MEDIA } from '@giantswarm/backstage-plugin-ui-react';
import type { WorkflowCondition, WorkflowSubStep } from '../../lib/k8s';
import { TOOL_EFFECT_LABELS, type ToolEffect } from '../../lib/toolAnnotations';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { formatDuration } from '../../lib/formatDuration';
import {
  conditionSummary,
  formatArgValue,
  toolDisplay,
} from '../../lib/workflowDisplay';
import {
  FlowStepContext,
  forEachSummary,
  loopParallelism,
  StepRunOverlay,
} from '../../lib/workflowGraph';
import { DisclosureAccordion, useWorkflowPageLinks } from '../shared';

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
    // Templated values can be long: at phone width the grid folds to one
    // column instead of overflowing the screen.
    [PHONE_MEDIA]: {
      gridTemplateColumns: '1fr',
    },
  },
  key: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--bui-fg-secondary)',
  },
  // A jq program as written: its line breaks kept, and a long line scrolls
  // inside the block rather than widening the details past a phone screen.
  program: {
    minWidth: 0,
  },
  code: {
    margin: '4px 0 0',
    padding: '8px 10px',
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowX: 'auto',
    whiteSpace: 'pre',
    fontFamily: 'monospace',
    fontSize: 12.5,
    lineHeight: 1.5,
    background: 'var(--bui-bg-neutral-2)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 8,
  },
  // Inside the step's own box on the canvas: the box is the panel, its title
  // the heading, and the step's button folds it — so no frame, heading or
  // Close of its own, and one column at the box's narrow width. Last, so the
  // rule it refers to exists.
  inline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 14px 12px',
    borderTop: '1px solid var(--bui-border-1)',
    '& $grid': {
      gridTemplateColumns: '1fr',
    },
  },
});

/** What a step calls, in plain words — a link for a called workflow. */
function PlainTool({
  tool,
  prefixes,
  installation,
}: {
  tool: string;
  prefixes: ServerPrefixInfo[];
  installation: string;
}) {
  const classes = useStyles();
  const workflowLinks = useWorkflowPageLinks();
  const display = toolDisplay(tool, prefixes);
  switch (display.kind) {
    case 'workflow': {
      const href = workflowLinks.workflow(display.workflow, installation);
      return (
        <>
          Runs the workflow{' '}
          {href ? (
            <Link href={href} variant="body-medium">
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
      <code className={classes.mono}>{String(group.forEach.items ?? '')}</code>,
    ]);
    if (group.forEach.as) {
      rows.push([
        'As',
        <code className={classes.mono}>{group.forEach.as}</code>,
      ]);
    }
    const parallelism = loopParallelism(group.forEach);
    rows.push([
      'Parallelism',
      parallelism === undefined ? (
        'not set (one after another)'
      ) : (
        <code className={classes.mono}>{parallelism}</code>
      ),
    ]);
  }
  if (node.paginate) {
    const paginate = definition.paginate ?? {};
    const set = (['itemsField', 'tokenField', 'tokenArg'] as const).filter(
      field => typeof paginate[field] === 'string',
    );
    rows.push([
      'Pagination',
      <>
        <div className={classes.mono}>
          maxPages: {node.paginate.maxPages}
          {typeof paginate.maxPages === 'number' ? '' : ' (default)'}
        </div>
        {set.map(field => (
          <div key={field} className={classes.mono}>
            {field}: {paginate[field]}
          </div>
        ))}
      </>,
    ]);
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
      {node.jq && (
        <div className={classes.program}>
          <Text as="p" variant="body-small" className={classes.caption}>
            jq program
          </Text>
          <pre className={classes.code} data-testid="step-jq-program">
            <code>{node.jq}</code>
          </pre>
        </div>
      )}
    </Flex>
  );
}

export interface WorkflowStepDetailsProps {
  /** The panel's id, for the control that opens it (`aria-controls`). */
  id?: string;
  context: FlowStepContext;
  /** Top-level step ids, to name a `fromStep` reference by number. */
  stepIds: string[];
  /** Every step's number by its id, to name the step a loop reads. */
  stepNumbers: Record<string, string>;
  prefixes: ServerPrefixInfo[];
  installation: string;
  /** The latest run's outcome for this step, when a run is known. */
  overlay?: StepRunOverlay;
  /** What the step's tool does, from the tool catalogue, when known. */
  effect?: ToolEffect;
  /**
   * `panel` (the phone list): its own frame, heading and Close. `inline`
   * (inside the step's box on the canvas): the box is the frame and the
   * step's button folds it, so neither heading nor Close.
   */
  variant?: 'panel' | 'inline';
  /** Folds the details; the panel's Close calls it. */
  onClose?: () => void;
}

/**
 * One step's details, opened in place — inside the step's box on the flow
 * canvas, under the step's card in the phone list: the plain description
 * first — what it calls, when it is skipped, whether it may fail, how the last
 * run went — then its own "Show technical information" fold-out with the
 * exact tool name, templated arguments and condition spec. Disclosure is per
 * step: nothing technical shows until a reader asks for it on this step.
 */
export function WorkflowStepDetails({
  id,
  context,
  stepIds,
  stepNumbers,
  prefixes,
  installation,
  overlay,
  effect,
  variant = 'panel',
  onClose,
}: WorkflowStepDetailsProps) {
  const classes = useStyles();
  const { node, group, container: parent } = context;
  const isHead = group?.node.key === node.key;
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
      `${forEachSummary(group.forEach, stepNumbers)}, it runs its ${countNoun(
        count,
        'step',
      )} in order.`,
    );
    const parallelism = loopParallelism(group.forEach);
    let iterations = 'The items run one after another';
    if (parallelism === 1) iterations = 'The items run one at a time';
    else if (parallelism) iterations = `Up to ${parallelism} items run at once`;
    // A nested loop's limit holds within one item of the loop around it.
    const within =
      parent?.kind === 'forEach'
        ? `, within each ${parent.forEach.as || 'item'} of step ${
            parent.node.number
          }`
        : '';
    facts.push(`${iterations}${within}.`);
  }
  if (isHead && group?.kind === 'parallel') {
    const count = group.children.length;
    facts.push(`Runs its ${countNoun(count, 'step')} at the same time.`);
  }
  if (parent) {
    facts.push(
      parent.kind === 'forEach'
        ? `It belongs to step ${parent.node.number} (${parent.node.title}) and runs ${forEachSummary(
            parent.forEach,
            stepNumbers,
          ).replace(/^F/, 'f')}.`
        : `It belongs to step ${parent.node.number} (${parent.node.title}) and runs at the same time as its siblings.`,
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
  if (node.paginate) {
    facts.push(
      `Follows the tool's pages, up to ${countNoun(
        node.paginate.maxPages,
        'page',
      )}, and keeps every page's items as one list.`,
    );
  }
  if (node.jq) {
    facts.push(
      isHead && group?.kind === 'forEach'
        ? 'A jq program turns the records of its iterations into its result.'
        : 'A jq program reshapes its result before later steps use it.',
    );
  }
  if (node.allowFailure) {
    facts.push('May fail without stopping the workflow.');
  }
  if (effect) {
    facts.push(`Its tool ${TOOL_EFFECT_LABELS[effect].toLowerCase()}.`);
  }
  if (overlay) {
    facts.push(lastRunSentence(overlay));
  }

  const inline = variant === 'inline';
  return (
    <section
      id={id}
      className={inline ? classes.inline : classes.panel}
      aria-label={`Details of ${heading}`}
      data-testid="workflow-step-details"
    >
      {!inline && (
        <div className={classes.head}>
          <Text as="h3" variant="title-x-small">
            {heading}
          </Text>
          {onClose && (
            <Button variant="tertiary" size="small" onPress={onClose}>
              Close
            </Button>
          )}
        </div>
      )}
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
