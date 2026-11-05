import { ReactNode, useCallback, useId, useRef, useState } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ShowMore } from '@giantswarm/backstage-plugin-ui-react';
import { TOOL_EFFECT_LABELS, type ToolEffect } from '../../lib/toolAnnotations';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { conditionSummary, type StepNumbers } from '../../lib/workflowDisplay';
import {
  featureLabels,
  findFlowStep,
  FlowItem,
  FlowStepNode,
  groupLabel as groupLine,
  StepRunOverlay,
  WorkflowGraph,
} from '../../lib/workflowGraph';
import { workflowShapeLabel } from '../../lib/workflowShape';
import {
  accessibleName,
  featureWords,
  quietStatus,
  runBadgeLabel,
  runSpoken,
  toolLine,
} from './flowLabels';
import { EffectBadge, MarkerBadge } from '../shared';
import { WorkflowStepDetails } from './WorkflowStepDetails';
import { StepFeatureBadges } from './StepFeatureBadges';

/** The cleanup lane's line, the same words the canvas puts on it. */
const CLEANUP_LABEL = 'Cleanup muster runs when a step fails';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
  },
  // A group's steps, indented under its head on a rule — the canvas's group
  // box, read top to bottom.
  children: {
    marginLeft: 12,
    paddingLeft: 12,
    borderLeft: '2px solid var(--bui-border-2)',
  },
  card: {
    font: 'inherit',
    color: 'var(--bui-fg-primary)',
    textAlign: 'left',
    cursor: 'pointer',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 44,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    background: 'var(--bui-bg-neutral-1)',
    border: '1px solid var(--bui-border-2)',
    borderRadius: 12,
    boxShadow: '0 1px 2px rgba(0, 38, 69, 0.05)',
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring, #00609c)',
      outlineOffset: 2,
    },
  },
  cardGroup: {
    background: 'var(--bui-bg-neutral-2)',
  },
  cardOpen: {
    borderColor: 'var(--bui-fg-primary)',
    boxShadow: '0 0 0 1px var(--bui-fg-primary)',
  },
  cardFailed: {
    borderColor: 'var(--bui-fg-negative)',
    boxShadow: '0 0 0 1px var(--bui-fg-negative)',
  },
  cardQuiet: {
    borderStyle: 'dashed',
    opacity: 0.7,
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  // The step's number, round; its look is MarkerBadge's, as on the canvas.
  number: {
    flex: 'none',
    minWidth: 18,
    marginTop: 1,
    boxSizing: 'border-box',
    borderRadius: 9,
    fontVariantNumeric: 'tabular-nums',
  },
  // The title is the information: it wraps, it is never cut.
  title: {
    flex: '1 1 auto',
    minWidth: 0,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
  },
  run: {
    flex: 'none',
    fontSize: 12,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  runCompleted: { color: 'var(--bui-positive-fg-subdued)' },
  runFailed: { color: 'var(--bui-fg-negative)', fontWeight: 500 },
  runRunning: { color: 'var(--bui-announcement-fg-subdued)' },
  runQuiet: { color: 'var(--bui-fg-secondary)' },
  line: {
    fontSize: 12.5,
    color: 'var(--bui-fg-secondary)',
    overflowWrap: 'anywhere',
  },
  gate: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontSize: 12.5,
    color: 'var(--bui-announcement-fg-subdued)',
    overflowWrap: 'anywhere',
  },
  gateGlyph: {
    flex: 'none',
    width: 7,
    height: 7,
    transform: 'rotate(45deg)',
    border: '1.5px solid currentColor',
  },
  markers: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  // The feature markers wrap among the card's other markers, as one row.
  inlineMarkers: {
    display: 'contents',
  },
  cleanup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
    padding: 12,
    border: '1px dashed var(--bui-negative-border)',
    borderRadius: 14,
  },
  cleanupHeading: {
    margin: 0,
  },
});

function useRunClass(overlay?: StepRunOverlay): string {
  const classes = useStyles();
  switch (overlay?.status) {
    case 'completed':
      return classes.runCompleted;
    case 'failed':
      return classes.runFailed;
    case 'running':
      return classes.runRunning;
    case undefined:
      return '';
    default:
      return classes.runQuiet;
  }
}

interface StepCardProps {
  node: FlowStepNode;
  /**
   * A group head's second line: what the loop runs over and how many at
   * once, or "at the same time".
   */
  groupLabel?: string;
  prefixes: ServerPrefixInfo[];
  stepNumbers: StepNumbers;
  overlay?: StepRunOverlay;
  effect?: ToolEffect;
  isOpen: boolean;
  detailsId: string;
  onToggle: (key: string) => void;
  cardRef: (key: string, element: HTMLButtonElement | null) => void;
}

/** One step as a tappable card: its number, name, tool, gate and markers. */
function StepCard({
  node,
  groupLabel,
  prefixes,
  stepNumbers,
  overlay,
  effect,
  isOpen,
  detailsId,
  onToggle,
  cardRef,
}: StepCardProps) {
  const classes = useStyles();
  const runClass = useRunClass(overlay);
  const { line } = toolLine(node.tool, prefixes);
  const gate = node.condition
    ? conditionSummary(node.condition, stepNumbers)
    : undefined;
  const hasMarkers =
    Boolean(effect) || node.allowFailure || featureLabels(node).length > 0;

  let stateClass = '';
  if (isOpen) stateClass = classes.cardOpen;
  else if (overlay?.status === 'failed') stateClass = classes.cardFailed;
  else if (quietStatus(overlay)) stateClass = classes.cardQuiet;

  return (
    <button
      type="button"
      ref={element => cardRef(node.key, element)}
      className={[
        classes.card,
        groupLabel !== undefined ? classes.cardGroup : '',
        stateClass,
      ].join(' ')}
      aria-expanded={isOpen}
      aria-controls={isOpen ? detailsId : undefined}
      aria-label={accessibleName(node, [
        groupLabel ?? line,
        gate,
        effect && TOOL_EFFECT_LABELS[effect].toLowerCase(),
        node.allowFailure && 'may fail',
        ...featureWords(node),
        overlay && runSpoken(overlay),
      ])}
      onClick={() => onToggle(node.key)}
      data-step-key={node.key}
      data-run-status={overlay?.status}
    >
      <span className={classes.head}>
        {node.number && (
          <MarkerBadge tone="neutral" size="compact" className={classes.number}>
            {node.number}
          </MarkerBadge>
        )}
        <span className={classes.title}>{node.title}</span>
        {overlay && (
          <span className={`${classes.run} ${runClass}`}>
            {runBadgeLabel(overlay)}
          </span>
        )}
      </span>
      {(groupLabel ?? line) && (
        <span className={classes.line}>{groupLabel ?? line}</span>
      )}
      {gate && (
        <span className={classes.gate}>
          <span className={classes.gateGlyph} aria-hidden="true" />
          <span>{gate}</span>
        </span>
      )}
      {hasMarkers && (
        <span className={classes.markers}>
          {effect && <EffectBadge effect={effect} size="compact" />}
          {node.allowFailure && (
            <MarkerBadge tone="neutral" size="compact">
              May fail
            </MarkerBadge>
          )}
          <StepFeatureBadges node={node} className={classes.inlineMarkers} />
        </span>
      )}
    </button>
  );
}

export interface WorkflowStepListProps {
  graph: WorkflowGraph;
  prefixes: ServerPrefixInfo[];
  installation: string;
  /** The latest run's outcome per step key, when a run is known. */
  overlayOf: (key: string) => StepRunOverlay | undefined;
  /** What each step's tool does, by step key, where the catalogue says. */
  effects: Record<string, ToolEffect>;
}

/**
 * The workflow's steps as a list, for a phone: the canvas's graph read top to
 * bottom with the page, in place of a flow wider than the screen inside a
 * scroll box that trapped the swipe.
 *
 * Each step is a card that opens its details in place, under it
 * (`aria-expanded`) — several may be open at once, so opening one never
 * moves the one being read. A forEach or parallel step is a card whose steps
 * are an indented list under it — a nested loop's steps indented once more;
 * a condition is an "Only if …" line on the
 * step it may skip; the cleanup steps are their own section at the end, as
 * the canvas's dashed lane is. Long workflows show a page of steps at a time.
 */
export function WorkflowStepList({
  graph,
  prefixes,
  installation,
  overlayOf,
  effects,
}: WorkflowStepListProps) {
  const classes = useStyles();
  const idPrefix = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const cards = useRef(new Map<string, HTMLButtonElement>());

  const cardRef = useCallback(
    (key: string, element: HTMLButtonElement | null) => {
      if (element) cards.current.set(key, element);
      else cards.current.delete(key);
    },
    [],
  );
  const toggle = useCallback((key: string) => {
    setOpen(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // The details' own Close folds them and puts the focus back on the step,
  // rather than dropping it with the panel.
  const close = (key: string) => {
    toggle(key);
    cards.current.get(key)?.focus();
  };

  const detailsId = (key: string) => `${idPrefix}-details-${key}`;

  const renderStep = (node: FlowStepNode, groupLabel?: string) => {
    const isOpen = open.has(node.key);
    const context = isOpen ? findFlowStep(graph, node.key) : undefined;
    return (
      <>
        <StepCard
          node={node}
          groupLabel={groupLabel}
          prefixes={prefixes}
          stepNumbers={graph.stepNumbers}
          overlay={overlayOf(node.key)}
          effect={effects[node.key]}
          isOpen={isOpen}
          detailsId={detailsId(node.key)}
          onToggle={toggle}
          cardRef={cardRef}
        />
        {context && (
          <WorkflowStepDetails
            id={detailsId(node.key)}
            context={context}
            stepNumbers={graph.stepNumbers}
            prefixes={prefixes}
            installation={installation}
            overlay={overlayOf(node.key)}
            effect={effects[node.key]}
            onClose={() => close(node.key)}
          />
        )}
      </>
    );
  };

  // A group's steps are an indented list under its card, and a group among
  // them nests its own list the same way, at any depth.
  const renderItem = (item: FlowItem): ReactNode => {
    if (item.kind === 'step') {
      return (
        <li key={item.node.key} className={classes.item}>
          {renderStep(item.node)}
        </li>
      );
    }
    return (
      <li key={item.node.key} className={classes.item}>
        {renderStep(item.node, groupLine(item, graph.stepNumbers))}
        {item.children.length > 0 && (
          <ol
            className={`${classes.list} ${classes.children}`}
            aria-label={`Steps of step ${item.node.number}`}
          >
            {item.children.map(renderItem)}
          </ol>
        )}
      </li>
    );
  };

  const cleanupHeadingId = `${idPrefix}-cleanup`;

  return (
    <div className={classes.item}>
      {graph.main.length > 0 && (
        <ShowMore items={graph.main} noun="step">
          {visible => (
            <ol
              className={classes.list}
              aria-label={`The workflow's ${workflowShapeLabel(
                graph.main.map(item => item.node.definition),
              )}, in order`}
            >
              {visible.map(renderItem)}
            </ol>
          )}
        </ShowMore>
      )}
      {graph.onFailure.length > 0 && (
        <section
          className={classes.cleanup}
          aria-labelledby={cleanupHeadingId}
          data-group="onFailure"
        >
          <Text
            as="h3"
            variant="body-medium"
            weight="bold"
            id={cleanupHeadingId}
            className={classes.cleanupHeading}
          >
            If a step fails
          </Text>
          <Text as="p" variant="body-small" color="secondary">
            {CLEANUP_LABEL}.
          </Text>
          <ol className={classes.list} aria-label="Cleanup steps">
            {graph.onFailure.map(node => (
              <li key={node.key} className={classes.item}>
                {renderStep(node)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
