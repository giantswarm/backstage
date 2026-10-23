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
import { subStepsOf } from './workflowShape';

/**
 * The read-only flow canvas of a muster workflow, as pure data: the graph a
 * definition describes, a deterministic layout of it, and the latest run's
 * per-step records mapped onto it.
 *
 * Only what the definition holds is drawn: an ordered spine of steps (the
 * execution order IS the list order — muster has no explicit DAG), forEach and
 * parallel steps as groups of their sub-steps — a group may hold another
 * group, at any depth, drawn inside it — a condition as a gate on the step's
 * incoming edge (a false condition SKIPS the step, it never branches — so
 * there are no yes/no edges), and the onFailure cleanup steps as their own
 * lane. There is no trigger or schedule node: muster has neither.
 *
 * Fields the page does not know are left out, never guessed at: a step that
 * is neither a tool call nor a group draws as a step without a tool.
 */

/** The pages a paginated step fetches at most when `maxPages` is unset. */
export const DEFAULT_MAX_PAGES = 10;

/** One drawable step: a tool call, or the head of a forEach/parallel group. */
export interface FlowStepNode {
  /**
   * Stable layout key: `s<i>` top level, `s<i>.<j>` sub-step, `s<i>.<j>.<k>`
   * a nested group's sub-step, `f<j>` cleanup.
   */
  key: string;
  /** The definition's step id. */
  id: string;
  /** The plain name: the description, else the id. */
  title: string;
  /** The aggregated tool the step calls (absent on group heads). */
  tool?: string;
  condition?: WorkflowCondition;
  allowFailure: boolean;
  /** The number a reader sees: `2`, `3.1`, `1.2.3`; none in the cleanup lane. */
  number?: string;
  /** The spine (with its groups) or the cleanup lane. */
  lane: 'main' | 'cleanup';
  /** The key of the innermost forEach/parallel group a sub-step belongs to. */
  parentKey?: string;
  /** The jq program that reshapes the step's result, when it has one. */
  jq?: string;
  /** How a tool step follows the tool's pages, when it does. */
  paginate?: { maxPages: number };
  /** The step as the definition holds it — for its details. */
  definition: WorkflowStep | WorkflowSubStep;
}

export type FlowItem =
  | { kind: 'step'; node: FlowStepNode }
  | {
      kind: 'forEach';
      node: FlowStepNode;
      forEach: WorkflowForEach;
      children: FlowItem[];
    }
  | { kind: 'parallel'; node: FlowStepNode; children: FlowItem[] };

/** A forEach or parallel group. */
export type FlowGroupItem = Exclude<FlowItem, { kind: 'step' }>;

export interface WorkflowGraph {
  main: FlowItem[];
  onFailure: FlowStepNode[];
  /** Top-level step ids, in order — resolves `fromStep` to a number. */
  stepIds: string[];
  /**
   * Every main-lane step's number by its id, at any depth — resolves a loop's
   * `{{ .results.<id> }}` to the step it reads, nested ones included.
   */
  stepNumbers: Record<string, string>;
}

function stepTitle(step: { id?: string; description?: string }): string {
  return step.description || step.id || '(unnamed step)';
}

/** The jq program, when the definition gives a non-empty one. */
function jqOf(step: WorkflowStep): string | undefined {
  return typeof step.jq === 'string' && step.jq.trim() !== ''
    ? step.jq
    : undefined;
}

/** A paginated step's page bound, muster's default where it sets none. */
function paginateOf(step: WorkflowStep): FlowStepNode['paginate'] {
  const paginate = step.paginate;
  if (!paginate || typeof paginate !== 'object') return undefined;
  const { maxPages } = paginate;
  return {
    maxPages:
      typeof maxPages === 'number' && maxPages >= 1
        ? Math.floor(maxPages)
        : DEFAULT_MAX_PAGES,
  };
}

/** A tool step's node: what it calls and how it treats the result. */
function stepNode(
  step: WorkflowSubStep,
  key: string,
  placement: Pick<FlowStepNode, 'number' | 'lane' | 'parentKey'>,
): FlowStepNode {
  const jq = jqOf(step);
  const paginate = paginateOf(step);
  return {
    key,
    id: step.id,
    title: stepTitle(step),
    tool: step.tool || undefined,
    condition: step.condition,
    allowFailure: Boolean(step.allowFailure),
    ...placement,
    ...(jq ? { jq } : {}),
    ...(paginate ? { paginate } : {}),
    definition: step,
  };
}

/**
 * One step and, for a group, the steps it holds — each numbered under its
 * group's number and keyed under its key, at any depth.
 */
function buildItem(
  step: WorkflowStep,
  key: string,
  number: string,
  parentKey?: string,
): FlowItem {
  const placement = {
    number,
    lane: 'main' as const,
    ...(parentKey ? { parentKey } : {}),
  };
  if (!step.forEach && !Array.isArray(step.parallel)) {
    return { kind: 'step', node: stepNode(step, key, placement) };
  }
  const jq = jqOf(step);
  const node: FlowStepNode = {
    key,
    id: step.id,
    title: stepTitle(step),
    condition: step.condition,
    allowFailure: Boolean(step.allowFailure),
    ...placement,
    ...(jq ? { jq } : {}),
    definition: step,
  };
  const children = subStepsOf(step).map((sub, j) =>
    buildItem(sub, `${key}.${j}`, `${number}.${j + 1}`, key),
  );
  return step.forEach
    ? { kind: 'forEach', node, forEach: step.forEach, children }
    : { kind: 'parallel', node, children };
}

/** Every item at every depth, each group before the steps it holds. */
export function flowItemsInOrder(items: FlowItem[]): FlowItem[] {
  return items.flatMap(item =>
    item.kind === 'step' ? [item] : [item, ...flowItemsInOrder(item.children)],
  );
}

/**
 * The graph a definition describes. Each step is exactly one of a tool call,
 * a forEach loop (sequential body) or a parallel group, and a group's steps
 * may be groups again; a step that carries both a tool and a group draws as
 * the group, which is how muster runs it.
 */
export function buildWorkflowGraph(
  steps: WorkflowStep[],
  onFailure: WorkflowSubStep[] = [],
): WorkflowGraph {
  const main = steps.map((step, index) =>
    buildItem(step, `s${index}`, String(index + 1)),
  );
  const stepNumbers: Record<string, string> = {};
  for (const item of flowItemsInOrder(main)) {
    const { id, number } = item.node;
    if (id && number && !(id in stepNumbers)) stepNumbers[id] = number;
  }
  return {
    main,
    onFailure: onFailure.map((sub, j) =>
      stepNode(sub, `f${j}`, { lane: 'cleanup' }),
    ),
    stepIds: steps.map(step => step.id),
    stepNumbers,
  };
}

/** Where a step sits in the graph: its node and the group it heads or is in. */
export interface FlowStepContext {
  node: FlowStepNode;
  /**
   * The forEach/parallel item the node heads (group head) or belongs to (its
   * innermost group).
   */
  group?: FlowGroupItem;
  /**
   * The group the node — or, for a group head, the group it heads — sits in;
   * absent on the spine and in the cleanup lane.
   */
  container?: FlowGroupItem;
}

/** The step behind a layout key, for its details; undefined when unknown. */
export function findFlowStep(
  graph: WorkflowGraph,
  key: string,
): FlowStepContext | undefined {
  const search = (
    items: FlowItem[],
    container?: FlowGroupItem,
  ): FlowStepContext | undefined => {
    for (const item of items) {
      if (item.node.key === key) {
        if (item.kind === 'step') {
          return container
            ? { node: item.node, group: container, container }
            : { node: item.node };
        }
        return container
          ? { node: item.node, group: item, container }
          : { node: item.node, group: item };
      }
      if (item.kind !== 'step') {
        const found = search(item.children, item);
        if (found) return found;
      }
    }
    return undefined;
  };
  const found = search(graph.main);
  if (found) return found;
  const cleanup = graph.onFailure.find(node => node.key === key);
  return cleanup ? { node: cleanup } : undefined;
}

/**
 * What a forEach loops over, in words: the input it names, the result of an
 * earlier step (by its number, nested steps too), or — for anything else —
 * the expression itself.
 */
export function forEachSummary(
  forEach: Pick<WorkflowForEach, 'items' | 'as'>,
  stepNumbers: Record<string, string> = {},
): string {
  const each = `For each ${forEach.as || 'item'}`;
  const items = (typeof forEach.items === 'string' ? forEach.items : '').trim();
  const input = /^\{\{\s*\.input\.([\w.-]+)\s*\}\}$/.exec(items);
  if (input) {
    return `${each} in the input “${input[1]}”`;
  }
  const result = /^\{\{\s*\.results\.([\w-]+)(?:\.[\w.-]+)?\s*\}\}$/.exec(
    items,
  );
  if (result) {
    const number = Object.prototype.hasOwnProperty.call(stepNumbers, result[1])
      ? stepNumbers[result[1]]
      : undefined;
    return number
      ? `${each} in the result of step ${number} (${result[1]})`
      : `${each} in the result of “${result[1]}”`;
  }
  return `${each} in ${items || 'a list'}`;
}

/**
 * How many iterations a loop runs at once, when the definition says so.
 * muster runs them one after another where it does not.
 */
export function loopParallelism(
  forEach: Pick<WorkflowForEach, 'parallelism'>,
): number | undefined {
  const { parallelism } = forEach;
  return typeof parallelism === 'number' && parallelism >= 1
    ? Math.floor(parallelism)
    : undefined;
}

/** "in order", "one at a time", "up to 8 at once". */
export function iterationsLabel(
  forEach: Pick<WorkflowForEach, 'parallelism'>,
): string {
  const parallelism = loopParallelism(forEach);
  if (parallelism === undefined) return 'in order';
  if (parallelism === 1) return 'one at a time';
  return `up to ${parallelism} at once`;
}

/**
 * A loop group's line: what it loops over and how many iterations run at
 * once — "For each mc in the input “clusters”, up to 8 at once".
 */
export function forEachLabel(
  forEach: Pick<WorkflowForEach, 'items' | 'as' | 'parallelism'>,
  stepNumbers: Record<string, string> = {},
): string {
  return `${forEachSummary(forEach, stepNumbers)}, ${iterationsLabel(forEach)}`;
}

/** The line a group head carries under its name. */
export function groupLabel(
  group: FlowGroupItem,
  stepNumbers: Record<string, string> = {},
): string {
  return group.kind === 'forEach'
    ? forEachLabel(group.forEach, stepNumbers)
    : 'These run at the same time';
}

/** "Paginated, up to 100 pages". */
export function paginateLabel(paginate: { maxPages: number }): string {
  return `Paginated, up to ${paginate.maxPages} page${
    paginate.maxPages === 1 ? '' : 's'
  }`;
}

/** The marker of a step whose result a jq program reshapes. */
export const JQ_LABEL = 'jq transform';

/**
 * The markers of what a step does with its result, in the order they show:
 * it follows the tool's pages, a jq program reshapes it.
 */
export function featureLabels(
  node: Pick<FlowStepNode, 'paginate' | 'jq'>,
): string[] {
  return [
    ...(node.paginate ? [paginateLabel(node.paginate)] : []),
    ...(node.jq ? [JQ_LABEL] : []),
  ];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Layout metrics, in CSS pixels. Exported so the renderer draws to them. */
export const FLOW_METRICS = {
  /** The narrowest node; every node of a flow shares one width. */
  nodeWidth: 240,
  /**
   * The widest a node grows so its title fits in two lines. Past it the
   * title is clamped (the full title is its tooltip) — the capped viewport
   * scrolls, but a parallel row of very wide nodes would stop being a flow.
   */
  maxNodeWidth: 360,
  /** A node whose title is one line. */
  nodeHeight: 64,
  /** A node whose title wraps onto a second line. */
  nodeHeightTwoLines: 82,
  /** A step title's font size and line height (the renderer draws to them). */
  titleFontSize: 13.5,
  titleLineHeight: 18,
  /**
   * A node's width that is not title: side padding, the glyph tile, a gap.
   * The last-run badge rides the second line, so it takes none of it.
   */
  nodeChrome: 14 + 34 + 12 + 14,
  /** Edge length between two plain steps. */
  gap: 32,
  /** Edge length into a gated step: room for the gate marker on the edge. */
  gateGap: 72,
  margin: 24,
  groupPadding: 16,
  /** A group's head: the container step's name and what it does. */
  groupHeader: 52,
  /** A group's head whose name wraps onto a second line. */
  groupHeaderTwoLines: 70,
  /** A group head's width that is not title: padding, number, a gap. */
  groupHeadChrome: 14 + 30 + 8 + 14,
  /**
   * The "May fail" marker beside a group head's title, with the row's 8px
   * gap. A compact MarkerBadge in Roboto at 12px measures 54px (62px with
   * the gap); re-measure if the marker's text or padding changes.
   */
  mayFailMarker: 72,
  /** Horizontal gap between parallel siblings. */
  parallelGap: 16,
  /** Edge length from parallel siblings back to the group's exit. */
  fanIn: 28,
  /** Gap between the main spine and the cleanup lane. */
  laneGap: 56,
  /** The gate marker's height (its width follows the node column). */
  gateHeight: 24,
  /**
   * A row of markers under a step's lines (or a group head's), for what the
   * step does with its result: paginated, a jq transform. A compact
   * MarkerBadge is 18px; a row's top margin (or gap) is 4. They wrap onto a
   * second row in a narrow box.
   */
  featureRow: 22,
  /** A group head's second line (what the group does) and its font size. */
  groupLabelFontSize: 12,
  groupLabelLineHeight: 16,
  /**
   * The room the last-run badge takes at the end of a group head's second
   * line ("✓ ×12 1m 4s" at 11.5px, with the row's gap).
   */
  runBadgeRoom: 72,
} as const;

/**
 * How a title sits in its box: one line, two lines, or longer than two lines
 * even at the widest node — then the renderer clamps it to two lines and the
 * full title is its tooltip.
 */
export type TitleFit = 'oneLine' | 'twoLines' | 'clamped';

export interface PlacedNode {
  node: FlowStepNode;
  x: number;
  y: number;
  width: number;
  /** The whole box: the step's own lines plus its open details. */
  height: number;
  titleFit: TitleFit;
  /** The room for the step's details under its lines; 0 while folded. */
  detailsHeight: number;
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
  /**
   * The head's height: one or two lines of the container step's name, one or
   * two of what the group does, and its markers' row.
   */
  headerHeight: number;
  titleFit: TitleFit;
  /** How the second line (`label`) sits: one line, two, or clamped. */
  labelFit: TitleFit;
  /** The room for the container step's details under its head; 0 while folded. */
  detailsHeight: number;
}

/**
 * The one step whose details are open inside its box, and how much room they
 * take — measured by the renderer (the layout stays pure). The box grows by
 * that much and everything after it moves down, so it never overlaps a
 * neighbor.
 */
export interface StepExpansion {
  key: string;
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
  /**
   * The x of the spine's center line. A flow wider than its viewport (a
   * wide parallel group, the cleanup lane) opens scrolled to it, so the
   * steps in order are what the reader sees first.
   */
  spineX: number;
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

/**
 * A title's width in CSS pixels at `fontSize`, estimated from per-glyph
 * classes of a proportional sans at medium weight. The layout is pure (it
 * runs in tests and before the fonts load), so it cannot measure; the
 * estimate errs wide, and the renderer's two-line clamp plus tooltip covers
 * what it still gets wrong.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (/[iljtfrI.,:;'!|()[\] ]/.test(ch)) em += 0.32;
    else if (/[mwMW@%]/.test(ch)) em += 0.86;
    else if (/[A-Z]/.test(ch)) em += 0.68;
    else if (/[0-9]/.test(ch)) em += 0.58;
    else em += 0.56;
  }
  return em * fontSize;
}

/**
 * Word wrapping never fills a line: a second line starts at a word that did
 * not fit. A two-line budget counts this share of both lines.
 */
const WRAP_FILL = 0.85;
/** The safety margin on a single line (the estimate is only an estimate). */
const LINE_FILL = 0.96;

function fitTitle(textWidth: number, available: number): TitleFit {
  if (textWidth <= available * LINE_FILL) return 'oneLine';
  if (textWidth <= 2 * available * WRAP_FILL) return 'twoLines';
  return 'clamped';
}

/** The width at which a title fits in two lines, chrome included. */
function widthForTwoLines(textWidth: number, chrome: number): number {
  return Math.ceil(textWidth / (2 * WRAP_FILL) + chrome);
}

/**
 * The rows a step's feature markers take in `room` pixels: none without
 * markers, else as many as wrapping them needs. A compact marker is its text
 * at 12px plus 6px of padding a side; markers sit 4px apart.
 */
function featureRows(node: FlowStepNode, room: number): number {
  let rows = 0;
  let used = 0;
  for (const label of featureLabels(node)) {
    const width = estimateTextWidth(label, M.groupLabelFontSize) + 12;
    if (rows === 0 || used + 4 + width > room) {
      rows += 1;
      used = width;
    } else {
      used += 4 + width;
    }
  }
  return rows;
}

/** Every step a node draws for, group heads aside, at every depth. */
function stepNodes(graph: WorkflowGraph): FlowStepNode[] {
  return [
    ...flowItemsInOrder(graph.main)
      .filter(item => item.kind === 'step')
      .map(item => item.node),
    ...graph.onFailure,
  ];
}

/**
 * The one node width of a flow: the narrowest that fits every title in two
 * lines (a forEach head's too, at any depth — it is at least a node wide
 * plus its padding), within [nodeWidth, maxNodeWidth]. Rounded to 4px so
 * widths stay crisp.
 */
function flowNodeWidth(graph: WorkflowGraph): number {
  let needed: number = M.nodeWidth;
  for (const node of stepNodes(graph)) {
    const text = estimateTextWidth(node.title, M.titleFontSize);
    needed = Math.max(needed, widthForTwoLines(text, M.nodeChrome));
  }
  for (const item of flowItemsInOrder(graph.main)) {
    if (item.kind !== 'forEach') continue;
    const text = estimateTextWidth(item.node.title, M.titleFontSize);
    const headChrome =
      M.groupHeadChrome + (item.node.allowFailure ? M.mayFailMarker : 0);
    needed = Math.max(
      needed,
      widthForTwoLines(text, headChrome) - 2 * M.groupPadding,
    );
  }
  return Math.min(M.maxNodeWidth, Math.ceil(needed / 4) * 4);
}

/**
 * An item's width: a node, or a group around what it holds — a loop's body
 * stacks (as wide as its widest step), a parallel group's steps sit side by
 * side. A group inside a group is wider by its own padding.
 */
function itemWidth(item: FlowItem, nodeWidth: number): number {
  switch (item.kind) {
    case 'forEach':
      return (
        Math.max(
          nodeWidth,
          ...item.children.map(child => itemWidth(child, nodeWidth)),
        ) +
        2 * M.groupPadding
      );
    case 'parallel': {
      const widths = item.children.map(child => itemWidth(child, nodeWidth));
      const row =
        widths.reduce((sum, width) => sum + width, 0) +
        Math.max(0, widths.length - 1) * M.parallelGap;
      return Math.max(nodeWidth, row) + 2 * M.groupPadding;
    }
    case 'step':
    default:
      return nodeWidth;
  }
}

/**
 * A deterministic layout: the spine runs top to bottom on one center line,
 * groups wrap their sub-steps (a forEach body stacks — it runs in order; a
 * parallel group's siblings sit side by side, fanned out from and back into
 * the spine), a group inside a group is drawn inside it, the same way, at
 * any depth, and the cleanup lane stands to the right as its own dashed
 * strand. No measuring, no randomness: the same definition always lays out
 * the same way, so the renderer is a plain projection of this.
 *
 * Step titles are the information, so the boxes are sized to them: every
 * node shares the narrowest width at which each title fits in two lines
 * (capped at `maxNodeWidth`), a node whose title wraps is taller, and so is
 * a group head whose name — or what the group does — wraps. Only a title too
 * long for two lines at the widest node is clamped (`titleFit: 'clamped'`),
 * with its full text as the tooltip. A step that is paginated or reshapes
 * its result with jq has a row of markers more.
 *
 * One step may be expanded (`expansion`): its box — or its group's head —
 * grows by the room its details take, and the steps after it move down (a
 * parallel row grows to its tallest sibling, so its neighbors keep their
 * place beside it). Nothing is drawn over the open details.
 */
export function layoutWorkflowGraph(
  graph: WorkflowGraph,
  expansion?: StepExpansion,
): FlowLayout {
  const nodes: PlacedNode[] = [];
  const groups: PlacedGroup[] = [];
  const edges: PlacedEdge[] = [];
  const gates: PlacedGate[] = [];
  const starts: FlowLayout['starts'] = [];

  const nodeWidth = flowNodeWidth(graph);
  const titleRoom = nodeWidth - M.nodeChrome;

  const gapFor = (node: FlowStepNode) => (node.condition ? M.gateGap : M.gap);

  /** The room for the node's open details: 0 unless it is the expanded one. */
  const detailsOf = (node: FlowStepNode) =>
    expansion?.key === node.key ? Math.max(0, Math.ceil(expansion.height)) : 0;

  /** A node's box for its title (one line or two), markers and open details. */
  const sized = (node: FlowStepNode) => {
    const titleFit = fitTitle(
      estimateTextWidth(node.title, M.titleFontSize),
      titleRoom,
    );
    const detailsHeight = detailsOf(node);
    return {
      titleFit,
      height:
        (titleFit === 'oneLine' ? M.nodeHeight : M.nodeHeightTwoLines) +
        featureRows(node, titleRoom) * M.featureRow +
        detailsHeight,
      detailsHeight,
    };
  };

  /**
   * A group head's height at `width`: the container step's name and what
   * the group does (`label`), each on one line or two, and its markers.
   */
  const headOf = (node: FlowStepNode, width: number, label: string) => {
    const room =
      width - M.groupHeadChrome - (node.allowFailure ? M.mayFailMarker : 0);
    const titleFit = fitTitle(
      estimateTextWidth(node.title, M.titleFontSize),
      room,
    );
    const labelFit = fitTitle(
      estimateTextWidth(label, M.groupLabelFontSize),
      width - 2 * 14 - M.runBadgeRoom,
    );
    return {
      titleFit,
      labelFit,
      headerHeight:
        (titleFit === 'oneLine' ? M.groupHeader : M.groupHeaderTwoLines) +
        (labelFit === 'oneLine' ? 0 : M.groupLabelLineHeight) +
        featureRows(node, width - 2 * 14) * M.featureRow,
      detailsHeight: detailsOf(node),
    };
  };

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
        maxWidth: nodeWidth,
      });
    }
  };

  /**
   * Places one item with its top at `top` on center `x` — a node, or a group
   * with everything it holds — and returns its bottom.
   */
  const place = (item: FlowItem, x: number, top: number): number => {
    if (item.kind === 'step') {
      const box = sized(item.node);
      nodes.push({
        node: item.node,
        x: x - nodeWidth / 2,
        y: top,
        width: nodeWidth,
        ...box,
      });
      return top + box.height;
    }

    const width = itemWidth(item, nodeWidth);
    const label = groupLabel(item, graph.stepNumbers);
    const head = headOf(item.node, width, label);
    const headerBottom = top + head.headerHeight + head.detailsHeight;
    // The group's slot comes first, so groups stay in reading order (a
    // group before the groups it holds); its height is known once its
    // steps are placed.
    const slot = groups.length;
    groups.push(undefined as unknown as PlacedGroup);
    let bottom: number;

    if (item.kind === 'forEach') {
      const end = stack(item.children, x, headerBottom, false);
      bottom = end + M.groupPadding;
      if (item.children.length > 0) {
        edges.push({
          key: `${item.node.key}:out`,
          d: line(x, end, x, bottom),
          end: { x, y: bottom },
          dashed: false,
        });
      }
    } else if (item.children.length === 0) {
      bottom = headerBottom + M.groupPadding;
    } else {
      const fan = item.children.some(child => child.node.condition)
        ? M.gateGap
        : M.gap + 8;
      const childTop = headerBottom + fan;
      const widths = item.children.map(child => itemWidth(child, nodeWidth));
      const row =
        widths.reduce((sum, w) => sum + w, 0) +
        (widths.length - 1) * M.parallelGap;
      const bend = headerBottom + 20;
      // Siblings share a row: the row is as tall as its tallest sibling,
      // and each keeps its own height inside it.
      let left = x - row / 2;
      const placed = item.children.map((child, j) => {
        const cx = left + widths[j] / 2;
        left += widths[j] + M.parallelGap;
        // Fan out: a curve off the spine that lands in a straight stretch
        // above the sibling — the stretch a gate marker sits on.
        edges.push({
          key: `${child.node.key}:in`,
          d: `M ${x} ${headerBottom} C ${x} ${bend} ${cx} ${headerBottom} ${cx} ${bend} L ${cx} ${childTop}`,
          end: { x: cx, y: childTop },
          dashed: false,
        });
        if (child.node.condition) {
          gates.push({
            key: child.node.key,
            label: conditionSummary(child.node.condition, graph.stepIds),
            x: cx,
            y: (bend + childTop) / 2,
            maxWidth: nodeWidth,
          });
        }
        return { child, cx, childBottom: place(child, cx, childTop) };
      });
      bottom =
        Math.max(...placed.map(({ childBottom }) => childBottom)) + M.fanIn;
      for (const { child, cx, childBottom } of placed) {
        const join = (childBottom + bottom) / 2;
        edges.push({
          key: `${child.node.key}:out`,
          d: `M ${cx} ${childBottom} C ${cx} ${join} ${x} ${join} ${x} ${bottom}`,
          end: { x, y: bottom },
          dashed: false,
        });
      }
    }

    groups[slot] = {
      kind: item.kind,
      node: item.node,
      label,
      x: x - width / 2,
      y: top,
      width,
      height: bottom - top,
      ...head,
    };
    return bottom;
  };

  /** A stacked column of items from `fromY` on center `x`; returns its end. */
  function stack(
    items: FlowItem[],
    x: number,
    fromY: number,
    dashed: boolean,
  ): number {
    let y = fromY;
    for (const item of items) {
      const top = y + gapFor(item.node);
      connect(`${item.node.key}:in`, x, y, top, item.node, dashed);
      y = place(item, x, top);
    }
    return y;
  }

  const mainWidth = Math.max(
    nodeWidth,
    ...graph.main.map(item => itemWidth(item, nodeWidth)),
  );
  const spineX = M.margin + mainWidth / 2;

  if (graph.main.length > 0) {
    starts.push({ x: spineX, y: M.margin, dashed: false });
  }
  const exitY = stack(graph.main, spineX, M.margin, false);

  let height = exitY + M.margin;
  let width = M.margin * 2 + mainWidth;

  if (graph.onFailure.length > 0) {
    const laneWidth = nodeWidth + 2 * M.groupPadding;
    const laneX =
      graph.main.length > 0 ? width - M.margin + M.laneGap : M.margin;
    const laneCenter = laneX + laneWidth / 2;
    const top = M.margin;
    const end = stack(
      graph.onFailure.map(node => ({ kind: 'step', node })),
      laneCenter,
      top + M.groupHeader,
      true,
    );
    const bottom = end + M.groupPadding;
    groups.push({
      kind: 'onFailure',
      label: 'Cleanup muster runs when a step fails',
      x: laneX,
      y: top,
      width: laneWidth,
      height: bottom - top,
      headerHeight: M.groupHeader,
      titleFit: 'oneLine',
      labelFit: 'oneLine',
      detailsHeight: 0,
    });
    width = laneX + laneWidth + M.margin;
    height = Math.max(height, bottom + M.margin);
  }

  return { width, height, spineX, nodes, groups, edges, gates, starts };
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
 * forEach body step once per iteration (some stores suffix `_<index>`, a
 * nested loop's once per index), a
 * parallel sibling under its own id, a group head only when its condition
 * skipped the whole group, and the cleanup steps after the failure that set
 * them off — where an id may repeat a main step's, so a record after the
 * first fatal failure belongs to the cleanup lane first. A group head without
 * a record of its own takes its verdict from its sub-steps (a nested group's
 * from its own first). A node the run
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
    /** The group heads the node sits in, outermost first. */
    containers: FlowStepNode[];
  };
  const mainIndex = new Map<string, Slot>();
  const cleanupIndex = new Map<string, Slot>();
  const remember = (index: Map<string, Slot>, slot: Slot) => {
    if (!index.has(slot.node.id)) index.set(slot.node.id, slot);
  };
  const rememberAll = (items: FlowItem[], containers: FlowStepNode[]) => {
    for (const item of items) {
      remember(mainIndex, { node: item.node, lane: 'main', containers });
      if (item.kind !== 'step') {
        rememberAll(item.children, [...containers, item.node]);
      }
    }
  };
  rememberAll(graph.main, []);
  for (const node of graph.onFailure) {
    remember(cleanupIndex, { node, lane: 'cleanup', containers: [] });
  }

  const lookup = (index: Map<string, Slot>, id: string) =>
    index.get(id) ?? index.get(id.replace(/(?:_\d+)+$/, ''));

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
      !slot.containers.some(container => container.allowFailure)
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

  const settleItem = (item: FlowItem): StepRunOverlay => {
    if (item.kind === 'step') {
      return settle(item.node);
    }
    const children = item.children.map(settleItem);
    if (collected.has(item.node.key)) {
      return settle(item.node);
    }
    const ran = children.filter(child => child.status !== 'notRun');
    const result: StepRunOverlay = {
      status: combine(ran.map(child => child.status)),
      runs: 0,
    };
    overlay[item.node.key] = result;
    return result;
  };
  graph.main.forEach(settleItem);
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
  flowItemsInOrder(graph.main).forEach(item => visit(item.node));
  graph.onFailure.forEach(visit);
  return effects;
}
