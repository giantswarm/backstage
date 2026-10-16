import {
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Text } from '@backstage/ui';
import { makeStyles, Portal } from '@material-ui/core';
import Fullscreen from '@material-ui/icons/Fullscreen';
import FullscreenExit from '@material-ui/icons/FullscreenExit';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  useMediaQueryMatch,
  usePhoneLayout,
  useTouchInput,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { WorkflowStep, WorkflowSubStep } from '../../lib/k8s';
import type { ToolEffect } from '../../lib/toolAnnotations';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import { executionOutcome } from '../../lib/workflowDisplay';
import {
  buildWorkflowGraph,
  findFlowStep,
  FLOW_METRICS,
  FlowStepNode,
  layoutWorkflowGraph,
  mapRunToGraph,
  PlacedGroup,
  PlacedNode,
  StepExpansion,
  StepRunOverlay,
  StepRunStatus,
  stepToolEffects,
  TitleFit,
} from '../../lib/workflowGraph';
import { EffectBadge, MarkerBadge, useToolCatalogue } from '../shared';
import {
  accessibleName,
  quietStatus,
  runBadgeLabel,
  runSpoken,
  toolLine,
} from './flowLabels';
import { useLatestRun } from './useLatestRun';
import { useContentAreaLeft, useInertBehind } from './contentAreaLayer';
import { WorkflowStepDetails } from './WorkflowStepDetails';
import { WorkflowStepList } from './WorkflowStepList';

export { runBadgeLabel } from './flowLabels';

const EDGE_COLOR = 'var(--bui-fg-secondary)';

/**
 * The canvas viewport never grows past this: a workflow may hold a hundred
 * steps, and the page below it (statistics, the advanced details) must stay
 * in reach. The flow scrolls inside its box instead — or the reader takes it
 * full screen.
 */
export const FLOW_VIEWPORT_MAX_HEIGHT = 560;

/**
 * The room an expanded step's details get until the renderer has measured
 * them (the layout is pure). A browser measures before the first paint, so
 * this is only ever seen where nothing lays out — jsdom.
 */
export const DEFAULT_DETAILS_HEIGHT = 180;

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
  // First, so the animations below can refer to it. Only where the reader
  // has not asked for reduced motion.
  '@keyframes fadeIn': {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
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
  captionEnd: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px 16px',
  },
  legend: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  // Full screen: the flow takes the shell's whole content area — the full
  // viewport height beside the nav rail, which stays in view and in use (its
  // left edge is the content area's, measured: `useContentAreaLeft`) — as a
  // layer of its own, with the workflow's name and the way back on top. 16px
  // gutters, so a narrow window keeps its edges.
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 1300,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    backgroundColor: 'var(--bui-bg-app)',
    '&:focus': { outline: 'none' },
    '@media (prefers-reduced-motion: no-preference)': {
      animation: '$fadeIn 120ms ease-out',
    },
  },
  overlayHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  overlayTitle: {
    margin: 0,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
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
  // Full screen: the figure and its box take the layer's whole height. After
  // `figure` and `scroller` on purpose — one sheet, same specificity, so the
  // later rule wins: declared before them, the box kept its inline cap
  // (70vh) and the bottom third of the layer stayed empty (T88c).
  figureFull: {
    flex: '1 1 auto',
    minHeight: 0,
  },
  scrollerFull: {
    flex: '1 1 auto',
    minHeight: 0,
    maxHeight: 'none',
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
    padding: '8px 14px 0',
    border: 0,
    borderRadius: 14,
    background: 'transparent',
  },
  laneHead: {
    cursor: 'default',
  },
  groupTitleText: {
    flex: '1 1 auto',
  },
  groupTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  groupLabel: {
    display: 'block',
    flex: '1 1 auto',
    minWidth: 0,
    fontSize: 12,
    lineHeight: '16px',
    color: 'var(--bui-fg-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // The step's box: its button (number, name, tool, last run) on top and,
  // while expanded, its details under it — the layout gave the box the room.
  node: {
    position: 'absolute',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bui-bg-neutral-1)',
    border: '1px solid var(--bui-border-2)',
    borderRadius: 12,
    boxShadow: '0 1px 2px rgba(0, 38, 69, 0.05)',
    color: 'var(--bui-fg-primary)',
    '&:hover': { borderColor: 'var(--bui-fg-secondary)' },
  },
  nodeHead: {
    ...buttonReset,
    flex: 'none',
    boxSizing: 'border-box',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 14px',
    border: 0,
    borderRadius: 11,
    background: 'transparent',
  },
  // The open details, as they appear in the box.
  details: {
    '@media (prefers-reduced-motion: no-preference)': {
      animation: '$fadeIn 120ms ease-out',
    },
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
  },
  // The title is the information: it wraps onto a second line (the layout
  // sized the box for it), and only a title longer than that is clamped —
  // with the full title as its tooltip.
  title: {
    fontSize: FLOW_METRICS.titleFontSize,
    lineHeight: `${FLOW_METRICS.titleLineHeight}px`,
    fontWeight: 500,
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  // The second line: the tool (cut first — the title is the information)
  // and the last-run badge at its end, so the badge never narrows the title.
  subRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    minWidth: 0,
    marginTop: 2,
  },
  sub: {
    flex: '1 1 auto',
    minWidth: 0,
    fontSize: 12,
    lineHeight: '16px',
    color: 'var(--bui-fg-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  run: {
    flex: 'none',
    marginLeft: 'auto',
    fontSize: 11.5,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  runCompleted: { color: 'var(--bui-positive-fg-subdued)' },
  runFailed: { color: 'var(--bui-fg-negative)', fontWeight: 500 },
  runRunning: { color: 'var(--bui-announcement-fg-subdued)' },
  runQuiet: { color: 'var(--bui-fg-secondary)' },
  // Small markers riding the node's top edge, all compact MarkerBadges: its
  // number on the left, what it does to the world and whether it may fail on
  // the right. The number is round and placed here; its look is MarkerBadge's.
  number: {
    position: 'absolute',
    top: -9,
    left: 10,
    minWidth: 18,
    boxSizing: 'border-box',
    borderRadius: 9,
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
  // Last, so the rules it refers to exist.
  // A parallel group spans its siblings and is often wider than the box,
  // which opens on the spine: its head is centered over the spine, so its
  // name is in view where the reader is.
  headCentered: {
    textAlign: 'center',
    '& $groupTitleRow, & $subRow': { justifyContent: 'center' },
    '& $groupTitleText, & $groupLabel': { flex: '0 1 auto' },
  },
});

/**
 * A title's tooltip: only where the box may not show all of it — a wrapped
 * title (the layout's width is an estimate) or a clamped one. A title on one
 * line shows itself; a tooltip there would only repeat it.
 */
function titleTooltip(title: string, fit: TitleFit): string | undefined {
  return fit === 'oneLine' ? undefined : title;
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
      {effect && <EffectBadge effect={effect} size="compact" />}
      {allowFailure && (
        <MarkerBadge tone="neutral" size="compact">
          May fail
        </MarkerBadge>
      )}
    </span>
  );
}

/** What a step's box needs to expand in place. */
interface Expandable {
  /** Whether this step's details are open in its box. */
  expanded: boolean;
  /** The details' id, for the step's `aria-controls`. */
  detailsId: string;
  /** The open details, rendered under the step's button. */
  details?: ReactNode;
  onToggle: (key: string) => void;
  /** Registers the step's button, so focus can return to it. */
  buttonRef: (key: string, element: HTMLButtonElement | null) => void;
}

interface StepProps extends Expandable {
  node: FlowStepNode;
  prefixes: ServerPrefixInfo[];
  overlay?: StepRunOverlay;
  effect?: ToolEffect;
  /** The "Only if …" gate on the edge into this step. */
  gate?: string;
}

function StepNode({
  node,
  box,
  prefixes,
  overlay,
  effect,
  gate,
  expanded,
  detailsId,
  details,
  onToggle,
  buttonRef,
}: StepProps & { box: PlacedNode }) {
  const classes = useStyles();
  const { glyph, line } = toolLine(node.tool, prefixes);
  let stateClass = '';
  if (expanded) stateClass = classes.selected;
  else if (overlay?.status === 'failed') stateClass = classes.nodeFailed;
  else if (quietStatus(overlay)) stateClass = classes.nodeQuiet;
  return (
    <div
      className={`${classes.node} ${stateClass}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      }}
      data-node={node.key}
    >
      {node.number && (
        <MarkerBadge tone="neutral" size="compact" className={classes.number}>
          {node.number}
        </MarkerBadge>
      )}
      <Markers effect={effect} allowFailure={node.allowFailure} />
      <button
        type="button"
        ref={element => buttonRef(node.key, element)}
        className={classes.nodeHead}
        style={{ height: box.height - box.detailsHeight - 2 }}
        aria-expanded={expanded}
        aria-controls={expanded ? detailsId : undefined}
        aria-label={accessibleName(node, [
          line,
          gate,
          effect && (effect === 'changes' ? 'changes things' : 'reads'),
          node.allowFailure && 'may fail',
          overlay && runSpoken(overlay),
        ])}
        onClick={() => onToggle(node.key)}
        data-step-key={node.key}
        data-run-status={overlay?.status}
        data-title-fit={box.titleFit}
      >
        <span className={classes.tile}>{glyph}</span>
        <span className={classes.text}>
          <span
            className={classes.title}
            title={titleTooltip(node.title, box.titleFit)}
          >
            {node.title}
          </span>
          {(line || overlay) && (
            <span className={classes.subRow}>
              {line && (
                <span className={classes.sub} title={line}>
                  {line}
                </span>
              )}
              <RunBadge overlay={overlay} />
            </span>
          )}
        </span>
      </button>
      {expanded && details}
    </div>
  );
}

/**
 * A forEach/parallel group (its head expands the container step's details
 * under it), or the cleanup lane.
 */
function Group({
  group,
  overlay,
  gate,
  expanded,
  detailsId,
  details,
  onToggle,
  buttonRef,
}: {
  group: PlacedGroup;
  overlay?: StepRunOverlay;
  gate?: string;
} & Expandable) {
  const classes = useStyles();
  const node = group.node;
  const title = node?.title ?? 'If it fails';
  const content = (
    <>
      <span className={classes.groupTitleRow}>
        {node?.number && (
          <MarkerBadge
            tone="neutral"
            size="compact"
            className={`${classes.number} ${classes.numberInline}`}
          >
            {node.number}
          </MarkerBadge>
        )}
        <span
          className={`${classes.title} ${classes.groupTitleText}`}
          title={titleTooltip(title, group.titleFit)}
        >
          {title}
        </span>
        {node?.allowFailure && (
          <MarkerBadge tone="neutral" size="compact">
            May fail
          </MarkerBadge>
        )}
      </span>
      <span className={classes.subRow}>
        <span className={classes.groupLabel} title={group.label}>
          {group.label}
        </span>
        <RunBadge overlay={overlay} />
      </span>
    </>
  );
  let stateClass = '';
  if (group.kind === 'onFailure') stateClass = classes.lane;
  else if (expanded) stateClass = classes.selected;
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
      data-title-fit={group.titleFit}
    >
      {node ? (
        <div data-node={node.key}>
          <button
            type="button"
            ref={element => buttonRef(node.key, element)}
            className={`${classes.groupHead} ${
              group.kind === 'parallel' ? classes.headCentered : ''
            }`}
            style={{ height: group.headerHeight - 4 }}
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            aria-label={accessibleName(node, [
              group.label,
              gate,
              node.allowFailure && 'may fail',
              overlay && runSpoken(overlay),
            ])}
            onClick={() => onToggle(node.key)}
            data-step-key={node.key}
          >
            {content}
          </button>
          {expanded && details}
        </div>
      ) : (
        <div
          className={`${classes.groupHead} ${classes.laneHead}`}
          style={{ height: group.headerHeight - 4 }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export interface WorkflowFlowCanvasProps {
  name: string;
  steps: WorkflowStep[];
  onFailure: WorkflowSubStep[];
  prefixes: ServerPrefixInfo[];
  installation: string;
  /** Whether the muster session can read runs and the tool catalogue. */
  hasSession: boolean;
}

/** "Step 2 · Apply the manifests", "Cleanup step · Roll back". */
function stepHeading(node: FlowStepNode): string {
  return node.lane === 'cleanup'
    ? `Cleanup step · ${node.title}`
    : `Step ${node.number} · ${node.title}`;
}

/**
 * The open step's details: their measured height (until the first
 * measurement, `DEFAULT_DETAILS_HEIGHT`), kept current as they change — the
 * technical fold-out opening, a window resized. Measured in a layout effect,
 * so the box has its room before the browser paints.
 */
function useDetailsHeight(
  ref: RefObject<HTMLElement>,
  expandedKey: string | undefined,
  remountKey: unknown,
): number {
  const [measured, setMeasured] = useState<StepExpansion>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!expandedKey || !element) return undefined;
    const measure = () => {
      const height = element.offsetHeight;
      if (height <= 0) return;
      setMeasured(current =>
        current?.key === expandedKey && current.height === height
          ? current
          : { key: expandedKey, height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, expandedKey, remountKey]);
  return measured && measured.key === expandedKey
    ? measured.height
    : DEFAULT_DETAILS_HEIGHT;
}

/**
 * The workflow drawn as a flow, from its definition only: the steps in order
 * on one spine, forEach and parallel steps as groups, a condition as an
 * "Only if …" gate on the edge into the step it may skip (never a yes/no
 * branch — muster has none), and the cleanup steps as a separate dashed lane.
 * No trigger, schedule or version: muster has none of them. With a muster
 * session the latest run's per-step records colour the nodes (done, failed,
 * skipped, not run) with durations where muster recorded them, and each
 * step's tool says whether it reads or changes things.
 *
 * The flow is the page's only step view. A step (or group head) expands in
 * place: its box grows to hold its details — plain first, technical
 * information behind the step's own fold-out — and the layout moves what
 * follows down to make room. One step at a time; pressing it again, Escape,
 * or a click on the canvas beside the steps folds it. The viewport is
 * capped, so a hundred-step workflow scrolls inside its box instead of
 * burying the page; "Full screen" gives the flow the shell's whole content
 * area beside the nav rail (Escape or "Exit full screen" brings it back).
 *
 * At phone width the same graph, overlay and effects render as a step list
 * instead (`WorkflowStepList`): no sideways flow, no nested scroll box.
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
  const isPhone = usePhoneLayout();
  const isTouch = useTouchInput();
  const reduceMotion = useMediaQueryMatch('(prefers-reduced-motion: reduce)');
  const idPrefix = useId();
  const [expandedKey, setExpandedKey] = useState<string>();
  const [fullScreenChosen, setFullScreen] = useState(false);
  // A phone has no canvas, so nothing to take full screen.
  const fullScreen = fullScreenChosen && !isPhone;

  const graph = useMemo(
    () => buildWorkflowGraph(steps, onFailure),
    [steps, onFailure],
  );
  const detailsRef = useRef<HTMLDivElement>(null);
  const detailsHeight = useDetailsHeight(detailsRef, expandedKey, fullScreen);
  // Folded, for where the flow opens; with the open step's details, for
  // drawing. The expansion only ever adds height, so the spine stays put.
  const foldedLayout = useMemo(() => layoutWorkflowGraph(graph), [graph]);
  const layout = useMemo(
    () =>
      expandedKey
        ? layoutWorkflowGraph(graph, {
            key: expandedKey,
            height: detailsHeight,
          })
        : foldedLayout,
    [graph, foldedLayout, expandedKey, detailsHeight],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  // A flow wider than its box (a wide parallel group, the cleanup lane)
  // would open at its left edge, with the spine half outside the box. Open
  // it on the spine instead: the steps in order first, the siblings and the
  // lane a sideways scroll away. Once per definition and per box (inline or
  // full screen), never against the reader's own scrolling — expanding a
  // step does not move the view sideways.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || foldedLayout.width <= viewport.clientWidth) return;
    viewport.scrollLeft = Math.max(
      0,
      foldedLayout.spineX - viewport.clientWidth / 2,
    );
  }, [foldedLayout, fullScreen]);

  // The steps' buttons, so folding by Escape can put the focus back on one.
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const buttonRef = useCallback(
    (key: string, element: HTMLButtonElement | null) => {
      if (element) buttons.current.set(key, element);
      else buttons.current.delete(key);
    },
    [],
  );
  const toggle = useCallback(
    (key: string) =>
      setExpandedKey(current => (current === key ? undefined : key)),
    [],
  );

  // The open details come into view — the box grew under the step pressed,
  // possibly past the viewport's edge. Smoothly, unless the reader asked for
  // reduced motion.
  useEffect(() => {
    if (!expandedKey) return;
    detailsRef.current?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [expandedKey, detailsHeight, fullScreen, reduceMotion]);

  // A click on the canvas beside the steps folds the open one. A listener,
  // not a handler on the stage: the stage is no control (Escape is the
  // keyboard's way), and a click inside a step's box — its details' fold-out
  // among them — keeps it open.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !expandedKey) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest?.('[data-node]')) {
        setExpandedKey(undefined);
      }
    };
    viewport.addEventListener('click', onClick);
    return () => viewport.removeEventListener('click', onClick);
  }, [expandedKey, fullScreen]);

  // Escape folds the open step first (focus back on it), then leaves full
  // screen. Within the layer in full screen, within the flow inline — never
  // on the rail beside the layer, whose own menus close on Escape.
  const figureRef = useRef<HTMLElement>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const target: HTMLElement | null = fullScreen ? layer : figureRef.current;
    if (!target || (!fullScreen && !expandedKey)) return undefined;
    const onKeyDown = (event: Event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      if (expandedKey) {
        event.stopPropagation();
        setExpandedKey(undefined);
        buttons.current.get(expandedKey)?.focus();
      } else if (fullScreen) {
        event.stopPropagation();
        setFullScreen(false);
      }
    };
    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
  }, [expandedKey, fullScreen, layer]);

  // Full screen covers the content area: the page behind it is inert, the
  // rail beside it stays usable; focus moves into the layer, and comes back
  // to "Full screen" when it closes.
  useInertBehind(layer, fullScreen);
  const contentLeft = useContentAreaLeft(fullScreen);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const wasFullScreen = useRef(false);
  useEffect(() => {
    if (fullScreen) {
      layer?.focus();
    } else if (wasFullScreen.current) {
      toggleButtonRef.current?.focus();
    }
    wasFullScreen.current = fullScreen;
  }, [fullScreen, layer]);

  const runs = useLatestRun(name, installation, hasSession);
  const latest = runs.latest;
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

  const expanded = expandedKey ? findFlowStep(graph, expandedKey) : undefined;

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

  const overlayOf = (key: string) => (hasOverlay ? overlay[key] : undefined);
  const detailsId = (key: string) => `${idPrefix}-details-${key}`;

  const legend = hasEffects && (
    <span className={classes.legend}>
      <Text as="span" variant="body-small" color="secondary">
        What each step's tool does:
      </Text>
      <EffectBadge effect="reads" size="compact" />
      <EffectBadge effect="changes" size="compact" />
    </span>
  );

  // A phone gets the steps as a list, not the canvas: a parallel group or
  // the cleanup lane makes the flow wider than the screen (the lane was a
  // sliver at its edge), and the capped scroll box trapped the swipe that
  // should scroll the page. The list reads top to bottom with the page, and
  // a step's details open in place under it.
  if (isPhone) {
    return (
      <figure className={classes.figure} data-testid="workflow-step-list">
        <figcaption className={classes.caption}>
          <Text as="span" variant="body-small" color="secondary">
            {runCaption ? `${runCaption} ` : ''}
            {isTouch ? 'Tap' : 'Select'} a step to see its details.
          </Text>
          {legend}
        </figcaption>
        <WorkflowStepList
          graph={graph}
          prefixes={prefixes}
          installation={installation}
          overlayOf={overlayOf}
          effects={effects}
        />
      </figure>
    );
  }

  const caption = (
    <figcaption className={classes.caption}>
      <Text as="span" variant="body-small" color="secondary">
        {runCaption ? `${runCaption} ` : ''}
        {isTouch ? 'Tap' : 'Select'} a step to see its details.
      </Text>
      <span className={classes.captionEnd}>
        {legend}
        {!fullScreen && (
          <Button
            ref={toggleButtonRef}
            variant="secondary"
            size="small"
            iconStart={<Fullscreen fontSize="small" />}
            onPress={() => setFullScreen(true)}
          >
            Full screen
          </Button>
        )}
      </span>
    </figcaption>
  );

  // The open step's details, in its box under its button. The wrapper is
  // what the layout's room is measured from.
  const details = expanded && (
    <div ref={detailsRef} className={classes.details}>
      <WorkflowStepDetails
        variant="inline"
        id={detailsId(expanded.node.key)}
        context={expanded}
        stepIds={graph.stepIds}
        prefixes={prefixes}
        installation={installation}
        overlay={overlayOf(expanded.node.key)}
        effect={effects[expanded.node.key]}
      />
    </div>
  );
  const expandable = (key: string): Expandable => ({
    expanded: expandedKey === key,
    detailsId: detailsId(key),
    details: expandedKey === key ? details : undefined,
    onToggle: toggle,
    buttonRef,
  });

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
        {...expandable(key)}
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
        {...expandable(key)}
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

  const figure = (
    <figure
      ref={figureRef}
      className={`${classes.figure} ${fullScreen ? classes.figureFull : ''}`}
      data-testid="workflow-flow-canvas"
    >
      {caption}
      <div
        ref={viewportRef}
        className={`${classes.scroller} ${
          fullScreen ? classes.scrollerFull : ''
        }`}
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
      {/* Says which step opened, for a screen reader; the step's button
          also says it is expanded. */}
      <span role="status" className={classes.srOnly}>
        {expanded ? `${stepHeading(expanded.node)}: details shown.` : ''}
      </span>
    </figure>
  );

  if (!fullScreen) {
    return figure;
  }
  // In <body>, outside the page: a fixed layer is not caught by a
  // transformed ancestor, and the page behind (the content area) can be made
  // inert without the layer.
  return (
    <Portal>
      <div
        ref={setLayer}
        className={classes.overlay}
        style={{ left: contentLeft }}
        // Not modal: the nav rail beside it stays in use.
        role="dialog"
        aria-label={`${name}: flow, full screen`}
        tabIndex={-1}
        data-testid="workflow-flow-full-screen"
      >
        <div className={classes.overlayHead}>
          <Text as="h2" variant="title-small" className={classes.overlayTitle}>
            {name}
          </Text>
          <Button
            variant="secondary"
            size="small"
            iconStart={<FullscreenExit fontSize="small" />}
            onPress={() => setFullScreen(false)}
          >
            Exit full screen
          </Button>
        </div>
        {figure}
      </div>
    </Portal>
  );
}
