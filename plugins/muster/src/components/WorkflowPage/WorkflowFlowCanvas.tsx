import { ReactNode, useMemo, useState } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import type { WorkflowExecutionSummary } from '../../apis/types';
import { formatDuration } from '../../lib/formatDuration';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { WorkflowStep, WorkflowSubStep } from '../../lib/k8s';
import type { ToolEffect } from '../../lib/toolAnnotations';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { executionOutcome, toolDisplay } from '../../lib/workflowDisplay';
import {
  buildWorkflowGraph,
  findFlowStep,
  FLOW_METRICS,
  FlowStepNode,
  layoutWorkflowGraph,
  mapRunToGraph,
  PlacedGroup,
  PlacedNode,
  StepRunOverlay,
  StepRunStatus,
  stepToolEffects,
} from '../../lib/workflowGraph';
import { useToolCatalogue } from '../shared';
import { useRecentRuns } from './useRecentRuns';
import { WorkflowStepDetails } from './WorkflowStepDetails';

const EDGE_COLOR = 'var(--bui-fg-secondary)';

/**
 * The canvas viewport never grows past this: a workflow may hold a hundred
 * steps, and the page below it (runs, statistics) must stay in reach. The
 * flow scrolls inside its box instead.
 */
export const FLOW_VIEWPORT_MAX_HEIGHT = 560;

const buttonReset = {
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left' as const,
  cursor: 'pointer',
  '&:focus-visible': {
    outline: '2px solid var(--bui-ring, #00609c)',
    outlineOffset: 2,
  },
};

const useStyles = makeStyles({
  figure: {
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  caption: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px 16px',
  },
  legend: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  // The canvas never widens nor over-lengthens the page: a wide flow
  // (parallel siblings, the cleanup lane) scrolls sideways and a long one
  // scrolls down inside its own box — which also keeps 375px usable.
  scroller: {
    maxWidth: '100%',
    maxHeight: `min(${FLOW_VIEWPORT_MAX_HEIGHT}px, 70vh)`,
    overflow: 'auto',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    backgroundColor: 'var(--bui-bg-app)',
    backgroundImage:
      'radial-gradient(var(--bui-border-2) 1px, transparent 1px)',
    backgroundSize: '20px 20px',
  },
  stage: {
    position: 'relative',
    margin: '0 auto',
  },
  edges: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'visible',
  },
  group: {
    position: 'absolute',
    boxSizing: 'border-box',
    border: '1px solid var(--bui-border-2)',
    borderRadius: 14,
    backgroundColor: 'var(--bui-bg-neutral-2)',
  },
  lane: {
    border: '1px dashed var(--bui-negative-border)',
    backgroundColor: 'transparent',
  },
  groupHead: {
    ...buttonReset,
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    height: FLOW_METRICS.groupHeader - 4,
    padding: '8px 14px 0',
    border: 0,
    borderRadius: 14,
    background: 'transparent',
  },
  laneHead: {
    cursor: 'default',
  },
  groupTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  groupLabel: {
    display: 'block',
    marginTop: 2,
    fontSize: 12,
    color: 'var(--bui-fg-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  node: {
    ...buttonReset,
    position: 'absolute',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 14px',
    background: 'var(--bui-bg-neutral-1)',
    border: '1px solid var(--bui-border-2)',
    borderRadius: 12,
    boxShadow: '0 1px 2px rgba(0, 38, 69, 0.05)',
    color: 'var(--bui-fg-primary)',
    '&:hover': { borderColor: 'var(--bui-fg-secondary)' },
  },
  selected: {
    borderColor: 'var(--bui-fg-primary)',
    boxShadow: '0 0 0 2px var(--bui-fg-primary)',
    '&:hover': { borderColor: 'var(--bui-fg-primary)' },
  },
  nodeFailed: {
    borderColor: 'var(--bui-fg-negative)',
    boxShadow: '0 0 0 1px var(--bui-fg-negative)',
  },
  nodeQuiet: {
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  tile: {
    flex: 'none',
    width: 34,
    height: 34,
    borderRadius: 9,
    border: '1px solid var(--bui-border-1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--bui-fg-secondary)',
  },
  text: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    fontSize: 13.5,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sub: {
    fontSize: 12,
    color: 'var(--bui-fg-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  run: {
    flex: 'none',
    fontSize: 11.5,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  runCompleted: { color: 'var(--bui-positive-fg-subdued)' },
  runFailed: { color: 'var(--bui-fg-negative)', fontWeight: 500 },
  runRunning: { color: 'var(--bui-announcement-fg-subdued)' },
  runQuiet: { color: 'var(--bui-fg-secondary)' },
  // Small markers riding the node's top edge: its number on the left, what
  // it does to the world and whether it may fail on the right.
  number: {
    position: 'absolute',
    top: -9,
    left: 10,
    height: 18,
    minWidth: 18,
    padding: '0 5px',
    boxSizing: 'border-box',
    borderRadius: 9,
    border: '1px solid var(--bui-border-2)',
    background: 'var(--bui-bg-neutral-1)',
    fontSize: 11,
    lineHeight: '16px',
    textAlign: 'center',
    color: 'var(--bui-fg-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  numberInline: {
    position: 'static',
    flex: 'none',
  },
  markers: {
    position: 'absolute',
    top: -9,
    right: 10,
    display: 'flex',
    gap: 4,
  },
  marker: {
    height: 18,
    padding: '0 6px',
    borderRadius: 6,
    border: '1px solid var(--bui-border-2)',
    background: 'var(--bui-bg-neutral-1)',
    fontSize: 11,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    color: 'var(--bui-fg-secondary)',
  },
  markerChanges: {
    borderColor: 'var(--bui-warning-border)',
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
  },
  gate: {
    position: 'absolute',
    boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
    height: FLOW_METRICS.gateHeight,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 9px',
    borderRadius: 6,
    border: '1px solid var(--bui-announcement-border)',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-announcement-fg-subdued)',
    fontSize: 11.5,
    whiteSpace: 'nowrap',
  },
  gateText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  gateGlyph: {
    flex: 'none',
    width: 7,
    height: 7,
    transform: 'rotate(45deg)',
    border: '1.5px solid currentColor',
  },
});

/** The plain line under a step's name: connector · tool, and its tile glyph. */
function toolLine(
  tool: string | undefined,
  prefixes: ServerPrefixInfo[],
): { glyph: string; line: string } {
  if (!tool) {
    return { glyph: '·', line: '' };
  }
  const display = toolDisplay(tool, prefixes);
  switch (display.kind) {
    case 'connector':
      return {
        glyph: display.connector.charAt(0).toUpperCase(),
        line: `${display.connector} · ${display.tool}`,
      };
    case 'core':
      return { glyph: 'M', line: `muster · ${display.tool}` };
    case 'workflow':
      return { glyph: 'W', line: `Runs the workflow ${display.workflow}` };
    default:
      return {
        glyph: display.tool.charAt(0).toUpperCase(),
        line: display.tool,
      };
  }
}

/** A node's last-run badge text: "✓ ×3 1.2s", "✕ Failed", "Skipped"… */
export function runBadgeLabel(overlay: StepRunOverlay): string {
  switch (overlay.status) {
    case 'completed': {
      const parts = ['✓'];
      if (overlay.runs > 1) parts.push(`×${overlay.runs}`);
      if (overlay.durationMs !== undefined) {
        parts.push(formatDuration(overlay.durationMs));
      }
      return parts.join(' ');
    }
    case 'failed':
      return '✕ Failed';
    case 'running':
      return 'Running';
    case 'skipped':
      return 'Skipped';
    case 'notRun':
    default:
      return 'Not run';
  }
}

/** The badge in words, for a node's accessible name. */
function runSpoken(overlay: StepRunOverlay): string {
  switch (overlay.status) {
    case 'completed':
      return overlay.runs > 1
        ? `last run succeeded ${overlay.runs} times`
        : 'last run succeeded';
    case 'failed':
      return 'last run failed';
    case 'running':
      return 'running';
    case 'skipped':
      return 'skipped in the last run';
    case 'notRun':
    default:
      return 'did not run in the last run';
  }
}

function useRunClass(status: StepRunStatus | undefined): string | undefined {
  const classes = useStyles();
  switch (status) {
    case 'completed':
      return classes.runCompleted;
    case 'failed':
      return classes.runFailed;
    case 'running':
      return classes.runRunning;
    case undefined:
      return undefined;
    default:
      return classes.runQuiet;
  }
}

function RunBadge({ overlay }: { overlay?: StepRunOverlay }) {
  const classes = useStyles();
  const runClass = useRunClass(overlay?.status);
  if (!overlay) {
    return null;
  }
  return (
    <span className={`${classes.run} ${runClass ?? ''}`} title={overlay.error}>
      {runBadgeLabel(overlay)}
    </span>
  );
}

function Markers({
  effect,
  allowFailure,
}: {
  effect?: ToolEffect;
  allowFailure: boolean;
}) {
  const classes = useStyles();
  if (!effect && !allowFailure) {
    return null;
  }
  return (
    <span className={classes.markers}>
      {effect && (
        <span
          className={`${classes.marker} ${
            effect === 'changes' ? classes.markerChanges : ''
          }`}
        >
          {effect === 'changes' ? 'Changes things' : 'Reads'}
        </span>
      )}
      {allowFailure && <span className={classes.marker}>May fail</span>}
    </span>
  );
}

function quietStatus(overlay?: StepRunOverlay): boolean {
  return overlay?.status === 'skipped' || overlay?.status === 'notRun';
}

/** "Step 2: Apply the manifests, kubernetes · apply, last run failed". */
function accessibleName(
  node: FlowStepNode,
  parts: (string | undefined | false)[],
): string {
  const head = node.lane === 'cleanup' ? 'Cleanup step' : `Step ${node.number}`;
  return [`${head}: ${node.title}`, ...parts].filter(Boolean).join(', ');
}

interface StepProps {
  node: FlowStepNode;
  prefixes: ServerPrefixInfo[];
  overlay?: StepRunOverlay;
  effect?: ToolEffect;
  /** The "Only if …" gate on the edge into this step. */
  gate?: string;
  selected: boolean;
  onSelect: (key: string) => void;
}

function StepNode({
  node,
  box,
  prefixes,
  overlay,
  effect,
  gate,
  selected,
  onSelect,
}: StepProps & { box: PlacedNode }) {
  const classes = useStyles();
  const { glyph, line } = toolLine(node.tool, prefixes);
  let stateClass = '';
  if (selected) stateClass = classes.selected;
  else if (overlay?.status === 'failed') stateClass = classes.nodeFailed;
  else if (quietStatus(overlay)) stateClass = classes.nodeQuiet;
  return (
    <button
      type="button"
      className={`${classes.node} ${stateClass}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      }}
      aria-pressed={selected}
      aria-label={accessibleName(node, [
        line,
        gate,
        effect && (effect === 'changes' ? 'changes things' : 'only reads'),
        node.allowFailure && 'may fail',
        overlay && runSpoken(overlay),
      ])}
      onClick={() => onSelect(node.key)}
      data-step-key={node.key}
      data-run-status={overlay?.status}
    >
      {node.number && <span className={classes.number}>{node.number}</span>}
      <Markers effect={effect} allowFailure={node.allowFailure} />
      <span className={classes.tile}>{glyph}</span>
      <span className={classes.text}>
        <span className={classes.title} title={node.title}>
          {node.title}
        </span>
        {line && (
          <span className={classes.sub} title={line}>
            {line}
          </span>
        )}
      </span>
      <RunBadge overlay={overlay} />
    </button>
  );
}

/** A forEach/parallel group (its head selects the container step), or the cleanup lane. */
function Group({
  group,
  overlay,
  gate,
  selected,
  onSelect,
}: {
  group: PlacedGroup;
  overlay?: StepRunOverlay;
  gate?: string;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  const classes = useStyles();
  const node = group.node;
  const title = node?.title ?? 'If it fails';
  const content = (
    <>
      <span className={classes.groupTitleRow}>
        {node?.number && (
          <span className={`${classes.number} ${classes.numberInline}`}>
            {node.number}
          </span>
        )}
        <span className={classes.title} title={title} style={{ flex: 1 }}>
          {title}
        </span>
        {node?.allowFailure && <span className={classes.marker}>May fail</span>}
        <RunBadge overlay={overlay} />
      </span>
      <span className={classes.groupLabel} title={group.label}>
        {group.label}
      </span>
    </>
  );
  let stateClass = '';
  if (group.kind === 'onFailure') stateClass = classes.lane;
  else if (selected) stateClass = classes.selected;
  else if (quietStatus(overlay)) stateClass = classes.nodeQuiet;
  return (
    <div
      className={`${classes.group} ${stateClass}`}
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
      }}
      data-group={group.kind}
      data-run-status={overlay?.status}
    >
      {node ? (
        <button
          type="button"
          className={classes.groupHead}
          aria-pressed={selected}
          aria-label={accessibleName(node, [
            group.label,
            gate,
            node.allowFailure && 'may fail',
            overlay && runSpoken(overlay),
          ])}
          onClick={() => onSelect(node.key)}
          data-step-key={node.key}
        >
          {content}
        </button>
      ) : (
        <div className={`${classes.groupHead} ${classes.laneHead}`}>
          {content}
        </div>
      )}
    </div>
  );
}

/** The newest run of a page of summaries (they arrive newest first). */
function newestRun(
  runs: WorkflowExecutionSummary[] | null | undefined,
): WorkflowExecutionSummary | undefined {
  if (!runs || runs.length === 0) {
    return undefined;
  }
  return runs.reduce((newest, run) =>
    run.started_at > newest.started_at ? run : newest,
  );
}

export interface WorkflowFlowCanvasProps {
  name: string;
  steps: WorkflowStep[];
  onFailure: WorkflowSubStep[];
  prefixes: ServerPrefixInfo[];
  installation?: string;
  /** Whether the muster session can read runs and the tool catalogue. */
  hasSession: boolean;
}

/**
 * The workflow drawn as a flow, from its definition only: the steps in order
 * on one spine, forEach and parallel steps as groups, a condition as an
 * "Only if …" gate on the edge into the step it may skip (never a yes/no
 * branch — muster has none), and the cleanup steps as a separate dashed lane.
 * No trigger, schedule or version: muster has none of them. With a muster
 * session the latest run's per-step records colour the nodes (done, failed,
 * skipped, not run) with durations where muster recorded them, and each
 * step's tool says whether it only reads or changes things.
 *
 * The flow is the page's only step view: every step (and group head) is a
 * button that opens its details under the canvas — plain first, technical
 * information behind the step's own fold-out. The viewport is capped, so a
 * hundred-step workflow scrolls inside its box instead of burying the page.
 */
export function WorkflowFlowCanvas({
  name,
  steps,
  onFailure,
  prefixes,
  installation,
  hasSession,
}: WorkflowFlowCanvasProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const [selectedKey, setSelectedKey] = useState<string>();

  const graph = useMemo(
    () => buildWorkflowGraph(steps, onFailure),
    [steps, onFailure],
  );
  const layout = useMemo(() => layoutWorkflowGraph(graph), [graph]);

  const runs = useRecentRuns(name, installation, hasSession);
  const latest = newestRun(runs.data?.executions);
  // Same key as the runs section's per-run trace, so expanding the newest run
  // there reads from this cache.
  const execution = useQuery({
    queryKey: [
      'muster',
      'workflow-execution',
      installation,
      latest?.execution_id,
    ],
    queryFn: () => musterApi.getExecution(latest!.execution_id, installation),
    enabled: hasSession && Boolean(latest),
  });
  const overlay = useMemo(
    () => mapRunToGraph(graph, execution.data?.steps),
    [graph, execution.data],
  );
  const hasOverlay = Object.keys(overlay).length > 0;

  const catalogue = useToolCatalogue(installation, hasSession);
  const effects = useMemo(
    () => stepToolEffects(graph, catalogue.data?.tools),
    [graph, catalogue.data],
  );
  const hasEffects = Object.keys(effects).length > 0;

  const selected = selectedKey ? findFlowStep(graph, selectedKey) : undefined;

  if (graph.main.length === 0 && graph.onFailure.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        This workflow defines no steps.
      </Text>
    );
  }

  let runCaption: string | undefined;
  if (hasSession && runs.data && !latest) {
    runCaption = 'No runs recorded yet — the flow shows the definition only.';
  } else if (latest && execution.data) {
    const outcome = executionOutcome(execution.data.status);
    const when = formatRelativeTime(latest.started_at) ?? latest.started_at;
    runCaption = hasOverlay
      ? `Last run ${when} · ${outcome.label} — each step shows how it went.`
      : `Last run ${when} · ${outcome.label} — muster recorded no per-step results for it.`;
  }

  const toggle = (key: string) =>
    setSelectedKey(current => (current === key ? undefined : key));
  const overlayOf = (key: string) => (hasOverlay ? overlay[key] : undefined);

  // Reading (and tab) order follows the flow: each group's head before its
  // steps, the cleanup lane last. Groups paint before their steps, so the
  // steps sit on top of the group boxes.
  const nodeByKey = new Map(layout.nodes.map(n => [n.node.key, n]));
  const gateByKey = new Map(layout.gates.map(g => [g.key, g.label]));
  const groupByKey = new Map(
    layout.groups.map(g => [g.node?.key ?? 'lane', g]),
  );
  const ordered: ReactNode[] = [];
  const pushNode = (key: string) => {
    const placed = nodeByKey.get(key);
    if (!placed) return;
    ordered.push(
      <StepNode
        key={key}
        node={placed.node}
        box={placed}
        prefixes={prefixes}
        overlay={overlayOf(key)}
        effect={effects[key]}
        gate={gateByKey.get(key)}
        selected={selectedKey === key}
        onSelect={toggle}
      />,
    );
  };
  const pushGroup = (key: string) => {
    const group = groupByKey.get(key);
    if (!group) return;
    ordered.push(
      <Group
        key={`group-${key}`}
        group={group}
        overlay={group.node ? overlayOf(group.node.key) : undefined}
        gate={gateByKey.get(key)}
        selected={selectedKey === key}
        onSelect={toggle}
      />,
    );
  };
  for (const item of graph.main) {
    if (item.kind === 'step') {
      pushNode(item.node.key);
    } else {
      pushGroup(item.node.key);
      item.children.forEach(child => pushNode(child.key));
    }
  }
  if (graph.onFailure.length > 0) {
    pushGroup('lane');
    graph.onFailure.forEach(node => pushNode(node.key));
  }

  return (
    <figure className={classes.figure} data-testid="workflow-flow-canvas">
      <figcaption className={classes.caption}>
        <Text as="span" variant="body-small" color="secondary">
          {runCaption ? `${runCaption} ` : ''}Select a step to see its details.
        </Text>
        {hasEffects && (
          <span className={classes.legend}>
            <Text as="span" variant="body-small" color="secondary">
              What each step's tool does:
            </Text>
            <span className={classes.marker}>Reads</span>
            <span className={`${classes.marker} ${classes.markerChanges}`}>
              Changes things
            </span>
          </span>
        )}
      </figcaption>
      <div
        className={classes.scroller}
        role="group"
        aria-label={`Flow of the workflow's ${steps.length} step${
          steps.length === 1 ? '' : 's'
        }${onFailure.length > 0 ? ' and its cleanup steps' : ''}`}
        data-testid="workflow-flow-viewport"
      >
        <div
          className={classes.stage}
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className={classes.edges}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.starts.map(start => (
              <circle
                key={`start-${start.x}`}
                cx={start.x}
                cy={start.y}
                r={4}
                fill="var(--bui-bg-neutral-1)"
                stroke={EDGE_COLOR}
                strokeWidth={1.6}
              />
            ))}
            {layout.edges.map(edge => (
              <g key={edge.key} opacity={0.6}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke={EDGE_COLOR}
                  strokeWidth={1.6}
                  strokeDasharray={edge.dashed ? '5 4' : undefined}
                />
                <circle
                  cx={edge.end.x}
                  cy={edge.end.y}
                  r={3}
                  fill={EDGE_COLOR}
                />
              </g>
            ))}
          </svg>
          {ordered}
          {layout.gates.map(gate => (
            // The gate's sentence is also the gated step's details; on the
            // canvas it is a picture of the edge, so it stays out of the
            // reading order (the step's own button names its condition).
            <span
              key={`gate-${gate.key}`}
              className={classes.gate}
              style={{ left: gate.x, top: gate.y, maxWidth: gate.maxWidth }}
              title={gate.label}
              aria-hidden="true"
              data-gate-for={gate.key}
            >
              <span className={classes.gateGlyph} />
              <span className={classes.gateText}>{gate.label}</span>
            </span>
          ))}
        </div>
      </div>
      {selected && (
        <WorkflowStepDetails
          key={selected.node.key}
          context={selected}
          stepIds={graph.stepIds}
          prefixes={prefixes}
          installation={installation}
          overlay={overlayOf(selected.node.key)}
          effect={effects[selected.node.key]}
          onClose={() => setSelectedKey(undefined)}
        />
      )}
    </figure>
  );
}
