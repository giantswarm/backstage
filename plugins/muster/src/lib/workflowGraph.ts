import type {
  ToolAnnotations,
  WorkflowExecutionStatus,
  WorkflowExecutionStep,
} from '../apis/types';
import type {
  WorkflowCondition,
  WorkflowForEach,
  WorkflowStep,
  WorkflowSubStep,
} from './k8s';
import { toolEffect, ToolEffect } from './toolAnnotations';
import { conditionSummary } from './workflowDisplay';

/**
 * The read-only flow canvas of a muster workflow, as pure data: the graph a
 * definition describes, a deterministic layout of it, and the latest run's
 * per-step records mapped onto it.
 *
 * Only what the definition holds is drawn: an ordered spine of steps (the
 * execution order IS the list order — muster has no explicit DAG), forEach and
 * parallel steps as groups of their sub-steps, a condition as a gate on the
 * step's incoming edge (a false condition SKIPS the step, it never branches —
 * so there are no yes/no edges), and the onFailure cleanup steps as their own
 * lane. There is no trigger or schedule node: muster has neither.
 */

/** One drawable step: a tool call, or the head of a forEach/parallel group. */
export interface FlowStepNode {
  /** Stable layout key: `s<i>` top level, `s<i>.<j>` sub-step, `f<j>` cleanup. */
  key: string;
  /** The definition's step id. */
  id: string;
  /** The plain name: the description, else the id. */
  title: string;
  /** The aggregated tool the step calls (absent on group heads). */
  tool?: string;
  condition?: WorkflowCondition;
  allowFailure: boolean;
  /** The number a reader sees: `2`, `3.1`; none in the cleanup lane. */
  number?: string;
  /** The spine (with its groups) or the cleanup lane. */
  lane: 'main' | 'cleanup';
  /** The key of the forEach/parallel group a sub-step belongs to. */
  parentKey?: string;
  /** The step as the definition holds it — for its details. */
  definition: WorkflowStep | WorkflowSubStep;
}

export type FlowItem =
  | { kind: 'step'; node: FlowStepNode }
  | {
      kind: 'forEach';
      node: FlowStepNode;
      forEach: WorkflowForEach;
      children: FlowStepNode[];
    }
  | { kind: 'parallel'; node: FlowStepNode; children: FlowStepNode[] };

export interface WorkflowGraph {
  main: FlowItem[];
  onFailure: FlowStepNode[];
  /** Top-level step ids, in order — resolves `fromStep` to a number. */
  stepIds: string[];
}

function stepTitle(step: { id?: string; description?: string }): string {
  return step.description || step.id || '(unnamed step)';
}

function subNode(
  step: WorkflowSubStep,
  key: string,
  placement: Pick<FlowStepNode, 'number' | 'lane' | 'parentKey'>,
): FlowStepNode {
  return {
    key,
    id: step.id,
    title: stepTitle(step),
    tool: step.tool || undefined,
    condition: step.condition,
    allowFailure: Boolean(step.allowFailure),
    ...placement,
    definition: step,
  };
}

/**
 * The graph a definition describes. Each top-level step is exactly one of a
 * tool call, a forEach loop (sequential body) or a parallel group; a step
 * that carries both a tool and a group draws as the group, which is how
 * muster runs it.
 */
export function buildWorkflowGraph(
  steps: WorkflowStep[],
  onFailure: WorkflowSubStep[] = [],
): WorkflowGraph {
  const main = steps.map<FlowItem>((step, index) => {
    const number = String(index + 1);
    const node: FlowStepNode = {
      key: `s${index}`,
      id: step.id,
      title: stepTitle(step),
      condition: step.condition,
      allowFailure: Boolean(step.allowFailure),
      number,
      lane: 'main',
      definition: step,
    };
    const child = (sub: WorkflowSubStep, j: number) =>
      subNode(sub, `s${index}.${j}`, {
        number: `${number}.${j + 1}`,
        lane: 'main',
        parentKey: node.key,
      });
    if (step.forEach) {
      return {
        kind: 'forEach',
        node,
        forEach: step.forEach,
        children: (step.forEach.steps ?? []).map(child),
      };
    }
    if (step.parallel) {
      return {
        kind: 'parallel',
        node,
        children: step.parallel.map(child),
      };
    }
    return { kind: 'step', node: { ...node, tool: step.tool || undefined } };
  });
  return {
    main,
    onFailure: onFailure.map((sub, j) =>
      subNode(sub, `f${j}`, { lane: 'cleanup' }),
    ),
    stepIds: steps.map(step => step.id),
  };
}

/** Where a step sits in the graph: its node and the group it heads or is in. */
export interface FlowStepContext {
  node: FlowStepNode;
  /** The forEach/parallel item the node heads (group head) or belongs to. */
  group?: Exclude<FlowItem, { kind: 'step' }>;
}

/** The step behind a layout key, for its details; undefined when unknown. */
export function findFlowStep(
  graph: WorkflowGraph,
  key: string,
): FlowStepContext | undefined {
  for (const item of graph.main) {
    if (item.node.key === key) {
      return item.kind === 'step'
        ? { node: item.node }
        : { node: item.node, group: item };
    }
    if (item.kind !== 'step') {
      const child = item.children.find(c => c.key === key);
      if (child) return { node: child, group: item };
    }
  }
  const cleanup = graph.onFailure.find(node => node.key === key);
  return cleanup ? { node: cleanup } : undefined;
}

/**
 * What a forEach loops over, in words: the input it names, the result of an
 * earlier step, or — for anything else — the expression itself.
 */
export function forEachSummary(
  forEach: Pick<WorkflowForEach, 'items' | 'as'>,
  stepIds: string[] = [],
): string {
  const each = `For each ${forEach.as || 'item'}`;
  const items = (forEach.items ?? '').trim();
  const input = /^\{\{\s*\.input\.([\w.-]+)\s*\}\}$/.exec(items);
  if (input) {
    return `${each} in the input “${input[1]}”`;
  }
  const result = /^\{\{\s*\.results\.([\w-]+)(?:\.[\w.-]+)?\s*\}\}$/.exec(
    items,
  );
  if (result) {
    const number = stepIds.indexOf(result[1]) + 1;
    return number > 0
      ? `${each} in the result of step ${number} (${result[1]})`
      : `${each} in the result of “${result[1]}”`;
  }
  return `${each} in ${items || 'a list'}`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Layout metrics, in CSS pixels. Exported so the renderer draws to them. */
export const FLOW_METRICS = {
  nodeWidth: 240,
  nodeHeight: 64,
  /** Edge length between two plain steps. */
  gap: 32,
  /** Edge length into a gated step: room for the gate marker on the edge. */
  gateGap: 72,
  margin: 24,
  groupPadding: 16,
  /** A group's head: the container step's name and what it does. */
  groupHeader: 52,
  /** Horizontal gap between parallel siblings. */
  parallelGap: 16,
  /** Edge length from parallel siblings back to the group's exit. */
  fanIn: 28,
  /** Gap between the main spine and the cleanup lane. */
  laneGap: 56,
  /** The gate marker's height (its width follows the node column). */
  gateHeight: 24,
} as const;

export interface PlacedNode {
  node: FlowStepNode;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedGroup {
  kind: 'forEach' | 'parallel' | 'onFailure';
  /** The container step (forEach/parallel); absent on the cleanup lane. */
  node?: FlowStepNode;
  /** The second header line: what the group does. */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedEdge {
  key: string;
  /** SVG path data. */
  d: string;
  /** The end point, where the renderer draws the arrival dot. */
  end: { x: number; y: number };
  /** Dashed: the cleanup lane, which only runs when a step fails. */
  dashed: boolean;
}

/** A condition drawn on the edge into the step it gates. */
export interface PlacedGate {
  /** The key of the gated step (or group). */
  key: string;
  /** The plain "Only if …" sentence. */
  label: string;
  /** Center of the marker. */
  x: number;
  y: number;
  /** The widest the marker may grow: the column of the gated step. */
  maxWidth: number;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  groups: PlacedGroup[];
  edges: PlacedEdge[];
  gates: PlacedGate[];
  /** Where the spine (and the cleanup lane) begin: a plain entry dot. */
  starts: { x: number; y: number; dashed: boolean }[];
}

const M = FLOW_METRICS;

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function itemWidth(item: FlowItem): number {
  switch (item.kind) {
    case 'step':
      return M.nodeWidth;
    case 'forEach':
      return M.nodeWidth + 2 * M.groupPadding;
    case 'parallel': {
      const n = item.children.length;
      const row = n * M.nodeWidth + Math.max(0, n - 1) * M.parallelGap;
      return Math.max(M.nodeWidth, row) + 2 * M.groupPadding;
    }
    default:
      return M.nodeWidth;
  }
}

/**
 * A deterministic layout: the spine runs top to bottom on one center line,
 * groups wrap their sub-steps (a forEach body stacks — it runs in order; a
 * parallel group's siblings sit side by side, fanned out from and back into
 * the spine), and the cleanup lane stands to the right as its own dashed
 * strand. No measuring, no randomness: the same definition always lays out
 * the same way, so the renderer is a plain projection of this.
 */
export function layoutWorkflowGraph(graph: WorkflowGraph): FlowLayout {
  const nodes: PlacedNode[] = [];
  const groups: PlacedGroup[] = [];
  const edges: PlacedEdge[] = [];
  const gates: PlacedGate[] = [];
  const starts: FlowLayout['starts'] = [];

  const gapFor = (node: FlowStepNode) => (node.condition ? M.gateGap : M.gap);

  /** A straight edge on a column, with the gate of the step it enters. */
  const connect = (
    key: string,
    x: number,
    fromY: number,
    toY: number,
    target: FlowStepNode,
    dashed: boolean,
  ) => {
    edges.push({
      key,
      d: line(x, fromY, x, toY),
      end: { x, y: toY },
      dashed,
    });
    if (target.condition) {
      gates.push({
        key: target.key,
        label: conditionSummary(target.condition, graph.stepIds),
        x,
        y: (fromY + toY) / 2,
        maxWidth: M.nodeWidth,
      });
    }
  };

  /** A stacked column of steps from `fromY` on center `x`; returns its end. */
  const stack = (
    children: FlowStepNode[],
    x: number,
    fromY: number,
    dashed: boolean,
  ): number => {
    let y = fromY;
    for (const child of children) {
      const top = y + gapFor(child);
      connect(`${child.key}:in`, x, y, top, child, dashed);
      nodes.push({
        node: child,
        x: x - M.nodeWidth / 2,
        y: top,
        width: M.nodeWidth,
        height: M.nodeHeight,
      });
      y = top + M.nodeHeight;
    }
    return y;
  };

  const mainWidth = Math.max(M.nodeWidth, ...graph.main.map(itemWidth));
  const spineX = M.margin + mainWidth / 2;

  let exitY: number = M.margin;
  if (graph.main.length > 0) {
    starts.push({ x: spineX, y: exitY, dashed: false });
  }

  for (const item of graph.main) {
    const top = exitY + gapFor(item.node);
    connect(`${item.node.key}:in`, spineX, exitY, top, item.node, false);

    if (item.kind === 'step') {
      nodes.push({
        node: item.node,
        x: spineX - M.nodeWidth / 2,
        y: top,
        width: M.nodeWidth,
        height: M.nodeHeight,
      });
      exitY = top + M.nodeHeight;
      continue;
    }

    const width = itemWidth(item);
    const headerBottom = top + M.groupHeader;
    let bottom: number;

    if (item.kind === 'forEach') {
      const end = stack(item.children, spineX, headerBottom, false);
      bottom = end + M.groupPadding;
      if (item.children.length > 0) {
        edges.push({
          key: `${item.node.key}:out`,
          d: line(spineX, end, spineX, bottom),
          end: { x: spineX, y: bottom },
          dashed: false,
        });
      }
      groups.push({
        kind: 'forEach',
        node: item.node,
        label: forEachSummary(item.forEach, graph.stepIds),
        x: spineX - width / 2,
        y: top,
        width,
        height: bottom - top,
      });
    } else {
      const n = item.children.length;
      if (n === 0) {
        bottom = headerBottom + M.groupPadding;
      } else {
        const fan = item.children.some(child => child.condition)
          ? M.gateGap
          : M.gap + 8;
        const childTop = headerBottom + fan;
        const row = n * M.nodeWidth + (n - 1) * M.parallelGap;
        const bend = headerBottom + 20;
        bottom = childTop + M.nodeHeight + M.fanIn;
        item.children.forEach((child, j) => {
          const left = spineX - row / 2 + j * (M.nodeWidth + M.parallelGap);
          const cx = left + M.nodeWidth / 2;
          // Fan out: a curve off the spine that lands in a straight stretch
          // above the sibling — the stretch a gate marker sits on.
          edges.push({
            key: `${child.key}:in`,
            d: `M ${spineX} ${headerBottom} C ${spineX} ${bend} ${cx} ${headerBottom} ${cx} ${bend} L ${cx} ${childTop}`,
            end: { x: cx, y: childTop },
            dashed: false,
          });
          if (child.condition) {
            gates.push({
              key: child.key,
              label: conditionSummary(child.condition, graph.stepIds),
              x: cx,
              y: (bend + childTop) / 2,
              maxWidth: M.nodeWidth,
            });
          }
          const childBottom = childTop + M.nodeHeight;
          const join = (childBottom + bottom) / 2;
          edges.push({
            key: `${child.key}:out`,
            d: `M ${cx} ${childBottom} C ${cx} ${join} ${spineX} ${join} ${spineX} ${bottom}`,
            end: { x: spineX, y: bottom },
            dashed: false,
          });
          nodes.push({
            node: child,
            x: left,
            y: childTop,
            width: M.nodeWidth,
            height: M.nodeHeight,
          });
        });
      }
      groups.push({
        kind: 'parallel',
        node: item.node,
        label: 'These run at the same time',
        x: spineX - width / 2,
        y: top,
        width,
        height: bottom - top,
      });
    }
    exitY = bottom;
  }

  let height = exitY + M.margin;
  let width = M.margin * 2 + mainWidth;

  if (graph.onFailure.length > 0) {
    const laneWidth = M.nodeWidth + 2 * M.groupPadding;
    const laneX =
      graph.main.length > 0 ? width - M.margin + M.laneGap : M.margin;
    const laneCenter = laneX + laneWidth / 2;
    const top = M.margin;
    const end = stack(graph.onFailure, laneCenter, top + M.groupHeader, true);
    const bottom = end + M.groupPadding;
    groups.push({
      kind: 'onFailure',
      label: 'Cleanup muster runs when a step fails',
      x: laneX,
      y: top,
      width: laneWidth,
      height: bottom - top,
    });
    width = laneX + laneWidth + M.margin;
    height = Math.max(height, bottom + M.margin);
  }

  return { width, height, nodes, groups, edges, gates, starts };
}

// ---------------------------------------------------------------------------
// Last-run overlay
// ---------------------------------------------------------------------------

/** A node's outcome in one run; `notRun` = the run left no record for it. */
export type StepRunStatus =
  'completed' | 'failed' | 'skipped' | 'running' | 'notRun';

export interface StepRunOverlay {
  status: StepRunStatus;
  /** Summed over a loop's iterations; absent when muster recorded none. */
  durationMs?: number;
  /** How many records the step left — a forEach body step's iterations. */
  runs: number;
  error?: string;
}

function recordStatus(status: WorkflowExecutionStatus): StepRunStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'inprogress':
      return 'running';
    case 'skipped':
    default:
      return 'skipped';
  }
}

/** The verdict over several records: a failure wins, then a running one. */
function combine(statuses: StepRunStatus[]): StepRunStatus {
  if (statuses.length === 0) return 'notRun';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('completed')) return 'completed';
  if (statuses.every(status => status === 'skipped')) return 'skipped';
  return 'notRun';
}

/**
 * The latest run's per-step records, laid onto the graph's nodes.
 *
 * muster records steps in execution order under their definition ids: a
 * forEach body step once per iteration (some stores suffix `_<index>`), a
 * parallel sibling under its own id, a group head only when its condition
 * skipped the whole group, and the cleanup steps after the failure that set
 * them off — where an id may repeat a main step's, so a record after the
 * first fatal failure belongs to the cleanup lane first. A group head without
 * a record of its own takes its verdict from its sub-steps. A node the run
 * left no record for is `notRun` (not reached, or a loop over nothing).
 *
 * Returns nothing for a run without per-step records: claiming every step
 * "did not run" would be a guess, not a reading.
 */
export function mapRunToGraph(
  graph: WorkflowGraph,
  records: WorkflowExecutionStep[] | undefined,
): Record<string, StepRunOverlay> {
  if (!records || records.length === 0) {
    return {};
  }

  type Slot = {
    node: FlowStepNode;
    lane: 'main' | 'cleanup';
    container?: FlowStepNode;
  };
  const mainIndex = new Map<string, Slot>();
  const cleanupIndex = new Map<string, Slot>();
  const remember = (index: Map<string, Slot>, slot: Slot) => {
    if (!index.has(slot.node.id)) index.set(slot.node.id, slot);
  };
  for (const item of graph.main) {
    remember(mainIndex, { node: item.node, lane: 'main' });
    if (item.kind !== 'step') {
      for (const child of item.children) {
        remember(mainIndex, {
          node: child,
          lane: 'main',
          container: item.node,
        });
      }
    }
  }
  for (const node of graph.onFailure) {
    remember(cleanupIndex, { node, lane: 'cleanup' });
  }

  const lookup = (index: Map<string, Slot>, id: string) =>
    index.get(id) ?? index.get(id.replace(/_\d+$/, ''));

  const collected = new Map<
    string,
    { statuses: StepRunStatus[]; duration: number; error?: string }
  >();
  let cleanupPhase = false;

  for (const record of records) {
    const slot = cleanupPhase
      ? (lookup(cleanupIndex, record.step_id) ??
        lookup(mainIndex, record.step_id))
      : (lookup(mainIndex, record.step_id) ??
        lookup(cleanupIndex, record.step_id));
    if (!slot) continue;

    const status = recordStatus(record.status);
    const entry = collected.get(slot.node.key) ?? {
      statuses: [],
      duration: 0,
    };
    entry.statuses.push(status);
    if (record.duration_ms > 0) entry.duration += record.duration_ms;
    if (record.error && !entry.error) entry.error = record.error;
    collected.set(slot.node.key, entry);

    if (
      !cleanupPhase &&
      slot.lane === 'main' &&
      status === 'failed' &&
      !slot.node.allowFailure &&
      !slot.container?.allowFailure
    ) {
      cleanupPhase = true;
    }
  }

  const overlay: Record<string, StepRunOverlay> = {};
  const settle = (node: FlowStepNode): StepRunOverlay => {
    const entry = collected.get(node.key);
    const result: StepRunOverlay = entry
      ? {
          status: combine(entry.statuses),
          runs: entry.statuses.length,
          ...(entry.duration > 0 ? { durationMs: entry.duration } : {}),
          ...(entry.error ? { error: entry.error } : {}),
        }
      : { status: 'notRun', runs: 0 };
    overlay[node.key] = result;
    return result;
  };

  for (const item of graph.main) {
    if (item.kind === 'step') {
      settle(item.node);
      continue;
    }
    const children = item.children.map(settle);
    const own = collected.get(item.node.key);
    if (own) {
      settle(item.node);
    } else {
      const ran = children.filter(child => child.status !== 'notRun');
      overlay[item.node.key] = {
        status: combine(ran.map(child => child.status)),
        runs: 0,
      };
    }
  }
  graph.onFailure.forEach(settle);
  return overlay;
}

/**
 * Each step tool's effect, read off the installation's tool catalogue: a
 * tool the catalogue lists reads only when its server annotates it so; a tool
 * the catalogue does not list stays unknown rather than guessed.
 */
export function stepToolEffects(
  graph: WorkflowGraph,
  catalogue:
    { name: string; annotations?: ToolAnnotations }[] | null | undefined,
): Record<string, ToolEffect> {
  if (!catalogue) return {};
  const byName = new Map(catalogue.map(tool => [tool.name, tool]));
  const effects: Record<string, ToolEffect> = {};
  const visit = (node: FlowStepNode) => {
    const tool = node.tool ? byName.get(node.tool) : undefined;
    if (tool) effects[node.key] = toolEffect(tool);
  };
  for (const item of graph.main) {
    visit(item.node);
    if (item.kind !== 'step') item.children.forEach(visit);
  }
  graph.onFailure.forEach(visit);
  return effects;
}
