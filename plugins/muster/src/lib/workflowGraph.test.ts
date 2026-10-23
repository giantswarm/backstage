import type { WorkflowExecutionStep } from '../apis/types';
import type { WorkflowStep, WorkflowSubStep } from './k8s';
import { fleetImageScanWorkflow } from './__fixtures__/fleetImageScan';
import {
  buildWorkflowGraph,
  DEFAULT_MAX_PAGES,
  estimateTextWidth,
  featureLabels,
  findFlowStep,
  FLOW_METRICS,
  flowItemsInOrder,
  forEachSummary,
  groupLabel,
  iterationsLabel,
  layoutWorkflowGraph,
  mapRunToGraph,
  paginateLabel,
  stepToolEffects,
} from './workflowGraph';

const STEPS: WorkflowStep[] = [
  {
    id: 'fetch',
    tool: 'x_kubernetes_get_pods',
    description: 'Read the current pods',
  },
  {
    id: 'apply',
    tool: 'x_kubernetes_apply',
    condition: { fromStep: 'fetch', expect: { success: true } },
    allowFailure: true,
  },
  {
    id: 'fanout',
    description: 'Check every cluster',
    forEach: {
      items: '{{ .input.clusters }}',
      as: 'cluster',
      steps: [
        { id: 'probe', tool: 'core_service_list', description: 'Probe it' },
        {
          id: 'report',
          tool: 'x_slack_post',
          condition: { template: '{{ .vars.cluster.ready }}' },
        },
      ],
    },
  },
  {
    id: 'both',
    parallel: [
      { id: 'left', tool: 'x_jira_search' },
      {
        id: 'right',
        tool: 'x_jira_get',
        condition: { fromStep: 'fetch', expect: { success: false } },
      },
      { id: 'middle', tool: 'x_jira_list' },
    ],
  },
];

const CLEANUP: WorkflowSubStep[] = [
  { id: 'rollback', tool: 'x_kubernetes_delete', description: 'Roll back' },
  // Cleanup ids may repeat a main step's id.
  { id: 'apply', tool: 'x_kubernetes_apply', description: 'Re-apply' },
];

function record(
  stepId: string,
  status: WorkflowExecutionStep['status'],
  extra: Partial<WorkflowExecutionStep> = {},
): WorkflowExecutionStep {
  return {
    step_id: stepId,
    tool: 'x',
    status,
    started_at: '2026-10-09T08:00:00Z',
    duration_ms: 0,
    ...extra,
  };
}

describe('buildWorkflowGraph', () => {
  const graph = buildWorkflowGraph(STEPS, CLEANUP);

  it('keeps the spine in definition order, one item per top-level step', () => {
    expect(graph.main.map(item => item.kind)).toEqual([
      'step',
      'step',
      'forEach',
      'parallel',
    ]);
    expect(graph.stepIds).toEqual(['fetch', 'apply', 'fanout', 'both']);
  });

  it('names a step by its description, else its id, and numbers it', () => {
    expect(graph.main[0].node).toMatchObject({
      title: 'Read the current pods',
      number: '1',
      tool: 'x_kubernetes_get_pods',
      allowFailure: false,
    });
    expect(graph.main[1].node).toMatchObject({
      title: 'apply',
      number: '2',
      allowFailure: true,
    });
    expect(graph.main[1].node.condition).toEqual({
      fromStep: 'fetch',
      expect: { success: true },
    });
  });

  it('groups forEach and parallel sub-steps under their container', () => {
    const forEach = graph.main[2];
    const parallel = graph.main[3];
    if (forEach.kind !== 'forEach' || parallel.kind !== 'parallel') {
      throw new Error('expected groups');
    }
    expect(forEach.node.tool).toBeUndefined();
    expect(
      forEach.children.map(c => [c.node.key, c.node.number, c.node.title]),
    ).toEqual([
      ['s2.0', '3.1', 'Probe it'],
      ['s2.1', '3.2', 'report'],
    ]);
    expect(parallel.children.map(c => c.node.id)).toEqual([
      'left',
      'right',
      'middle',
    ]);
  });

  it('puts the onFailure steps in their own unnumbered lane', () => {
    expect(graph.onFailure.map(node => [node.key, node.number])).toEqual([
      ['f0', undefined],
      ['f1', undefined],
    ]);
  });

  it('draws a step carrying both a tool and a group as the group', () => {
    const odd = buildWorkflowGraph([
      { id: 'odd', tool: 'x_a', parallel: [{ id: 'p', tool: 'x_b' }] },
    ]);
    expect(odd.main[0].kind).toBe('parallel');
  });
});

describe('forEachSummary', () => {
  it('names the input or the earlier step a loop iterates', () => {
    expect(forEachSummary({ items: '{{ .input.clusters }}', as: 'c' })).toBe(
      'For each c in the input “clusters”',
    );
    expect(
      forEachSummary(
        { items: '{{ .results.fetch.items }}' },
        { x: '1', fetch: '2' },
      ),
    ).toBe('For each item in the result of step 2 (fetch)');
    expect(forEachSummary({ items: '{{.results.gone}}' }, {})).toBe(
      'For each item in the result of “gone”',
    );
  });

  it('keeps any other expression verbatim', () => {
    expect(forEachSummary({ items: '{{ .vars.list }}', as: 'x' })).toBe(
      'For each x in {{ .vars.list }}',
    );
  });
});

describe('layoutWorkflowGraph', () => {
  const graph = buildWorkflowGraph(STEPS, CLEANUP);
  const layout = layoutWorkflowGraph(graph);
  const byKey = (key: string) => {
    const placed = layout.nodes.find(n => n.node.key === key);
    if (!placed) throw new Error(`no node ${key}`);
    return placed;
  };

  it('is deterministic', () => {
    expect(layoutWorkflowGraph(buildWorkflowGraph(STEPS, CLEANUP))).toEqual(
      layout,
    );
  });

  it('stacks the spine top to bottom on one center line', () => {
    const first = byKey('s0');
    const second = byKey('s1');
    expect(second.y).toBeGreaterThan(first.y + first.height);
    expect(first.x + first.width / 2).toBe(second.x + second.width / 2);
    const forEach = layout.groups.find(g => g.kind === 'forEach')!;
    const parallel = layout.groups.find(g => g.kind === 'parallel')!;
    expect(forEach.y).toBeGreaterThan(second.y + second.height);
    expect(parallel.y).toBeGreaterThanOrEqual(forEach.y + forEach.height);
  });

  it('draws a condition as a gate on the incoming edge, never as a branch', () => {
    expect(layout.gates.map(gate => gate.key).sort()).toEqual(
      ['s1', 's2.1', 's3.1'].sort(),
    );
    const gate = layout.gates.find(g => g.key === 's1')!;
    const first = byKey('s0');
    const second = byKey('s1');
    expect(gate.label).toBe('Only if step 1 (fetch) succeeded');
    expect(gate.y).toBeGreaterThan(first.y + first.height);
    expect(gate.y).toBeLessThan(second.y);
    // A gated edge is longer, to leave the marker room.
    expect(second.y - (first.y + first.height)).toBe(FLOW_METRICS.gateGap);
    // One edge into each step: a gate adds no second exit.
    expect(layout.edges.filter(e => e.key === 's1:in')).toHaveLength(1);
  });

  it('wraps a forEach body as a stacked group inside its container', () => {
    const group = layout.groups.find(g => g.kind === 'forEach')!;
    expect(group.label).toBe(
      'For each cluster in the input “clusters”, in order',
    );
    expect(group.node?.title).toBe('Check every cluster');
    for (const key of ['s2.0', 's2.1']) {
      const node = byKey(key);
      expect(node.x).toBeGreaterThanOrEqual(group.x);
      expect(node.x + node.width).toBeLessThanOrEqual(group.x + group.width);
      expect(node.y).toBeGreaterThanOrEqual(group.y + FLOW_METRICS.groupHeader);
      expect(node.y + node.height).toBeLessThanOrEqual(group.y + group.height);
    }
    expect(byKey('s2.1').y).toBeGreaterThan(byKey('s2.0').y);
  });

  it('lays parallel siblings side by side, fanned out from the spine', () => {
    const group = layout.groups.find(g => g.kind === 'parallel')!;
    const siblings = ['s3.0', 's3.1', 's3.2'].map(byKey);
    expect(new Set(siblings.map(s => s.y)).size).toBe(1);
    expect(siblings[0].x).toBeLessThan(siblings[1].x);
    expect(siblings[1].x).toBeLessThan(siblings[2].x);
    expect(siblings[0].x).toBeGreaterThanOrEqual(group.x);
    expect(siblings[2].x + siblings[2].width).toBeLessThanOrEqual(
      group.x + group.width,
    );
    // Each sibling has one edge in and one edge back to the spine.
    for (const sibling of siblings) {
      expect(
        layout.edges.filter(e => e.key.startsWith(`${sibling.node.key}:`)),
      ).toHaveLength(2);
    }
    // The gated sibling's marker sits on its own column.
    const gate = layout.gates.find(g => g.key === 's3.1')!;
    expect(gate.x).toBe(siblings[1].x + siblings[1].width / 2);
  });

  it('keeps the cleanup lane as a separate dashed strand right of the spine', () => {
    const lane = layout.groups.find(g => g.kind === 'onFailure')!;
    const mainRight = Math.max(
      ...layout.groups
        .filter(g => g.kind !== 'onFailure')
        .map(g => g.x + g.width),
    );
    expect(lane.x).toBeGreaterThan(mainRight);
    const cleanup = ['f0', 'f1'].map(byKey);
    expect(cleanup[1].y).toBeGreaterThan(cleanup[0].y);
    const laneEdges = layout.edges.filter(e => e.key.startsWith('f'));
    expect(laneEdges).toHaveLength(2);
    expect(laneEdges.every(e => e.dashed)).toBe(true);
    expect(
      layout.edges.filter(e => !e.key.startsWith('f')).some(e => e.dashed),
    ).toBe(false);
    // No edge joins the spine to the lane: it runs on failure, not in order.
    expect(layout.starts).toEqual([expect.objectContaining({ dashed: false })]);
    expect(layout.width).toBe(lane.x + lane.width + FLOW_METRICS.margin);
  });

  it('names the spine’s center line, where a wide flow opens', () => {
    const spine = ['s0', 's1'].map(byKey);
    for (const node of spine) {
      expect(node.x + node.width / 2).toBe(layout.spineX);
    }
    // The parallel row is wider than a node, and centered on the spine.
    const parallel = layout.groups.find(g => g.kind === 'parallel')!;
    expect(parallel.x + parallel.width / 2).toBe(layout.spineX);
  });

  it('fits everything inside its bounds', () => {
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it('lays out an empty definition and a cleanup-only one', () => {
    expect(layoutWorkflowGraph(buildWorkflowGraph([]))).toMatchObject({
      nodes: [],
      edges: [],
      starts: [],
    });
    const cleanupOnly = layoutWorkflowGraph(buildWorkflowGraph([], CLEANUP));
    expect(cleanupOnly.groups.map(g => g.kind)).toEqual(['onFailure']);
    expect(cleanupOnly.groups[0].x).toBe(FLOW_METRICS.margin);
  });
});

describe('layoutWorkflowGraph — step titles are never cut', () => {
  const titled = (...titles: string[]): WorkflowStep[] =>
    titles.map((description, i) => ({
      id: `step-${i}`,
      tool: 'core_service_list',
      description,
    }));
  const nodeOf = (
    layout: ReturnType<typeof layoutWorkflowGraph>,
    key: string,
  ) => layout.nodes.find(n => n.node.key === key)!;

  it('keeps the narrow node and one line for short titles', () => {
    const layout = layoutWorkflowGraph(
      buildWorkflowGraph(titled('Count the targets', 'Slowest scrape')),
    );
    for (const node of layout.nodes) {
      expect(node.width).toBe(FLOW_METRICS.nodeWidth);
      expect(node.titleFit).toBe('oneLine');
      expect(node.height).toBe(FLOW_METRICS.nodeHeight);
    }
  });

  it('wraps a longer title onto a second line in a taller box', () => {
    const layout = layoutWorkflowGraph(
      buildWorkflowGraph(
        titled('Short', 'Find containers that restarted three times today'),
      ),
    );
    expect(nodeOf(layout, 's0').titleFit).toBe('oneLine');
    expect(nodeOf(layout, 's1').titleFit).toBe('twoLines');
    expect(nodeOf(layout, 's1').height).toBe(FLOW_METRICS.nodeHeightTwoLines);
    // The next step starts below the taller box.
    expect(nodeOf(layout, 's1').y).toBeGreaterThan(
      nodeOf(layout, 's0').y + nodeOf(layout, 's0').height,
    );
  });

  it('widens every node, never past the cap, until each title fits in two lines', () => {
    const long =
      'Read the health of the control plane and of every node it reports';
    const layout = layoutWorkflowGraph(
      buildWorkflowGraph(titled('Short', long)),
    );
    const width = nodeOf(layout, 's1').width;
    expect(width).toBeGreaterThan(FLOW_METRICS.nodeWidth);
    expect(width).toBeLessThanOrEqual(FLOW_METRICS.maxNodeWidth);
    // One width for the whole flow: the spine stays one straight column.
    expect(nodeOf(layout, 's0').width).toBe(width);
    expect(nodeOf(layout, 's1').titleFit).toBe('twoLines');
    // Two lines of the title fit the box's title room.
    const room = width - FLOW_METRICS.nodeChrome;
    expect(estimateTextWidth(long, FLOW_METRICS.titleFontSize)).toBeLessThan(
      2 * room,
    );
  });

  it('clamps only a title longer than two lines at the widest node', () => {
    const layout = layoutWorkflowGraph(
      buildWorkflowGraph(
        titled(
          'CPU saturation across all nodes, averaged over fifteen minutes, compared with the requests the release asks for, per namespace and per node pool',
        ),
      ),
    );
    expect(nodeOf(layout, 's0').width).toBe(FLOW_METRICS.maxNodeWidth);
    expect(nodeOf(layout, 's0').titleFit).toBe('clamped');
    expect(nodeOf(layout, 's0').height).toBe(FLOW_METRICS.nodeHeightTwoLines);
  });

  it('gives a parallel row the height of its tallest sibling and a wrapped group head more room', () => {
    const steps: WorkflowStep[] = [
      {
        id: 'loop',
        description:
          'Inspect each namespace that takes part in the release, one by one',
        forEach: {
          items: '{{ .input.namespaces }}',
          steps: [{ id: 'pods', tool: 'x_a', description: 'Count pods' }],
        },
      },
      {
        id: 'both',
        description: 'At once',
        parallel: [
          { id: 'a', tool: 'x_a', description: 'p99' },
          {
            id: 'b',
            tool: 'x_b',
            description:
              'Error rate of every request over the last five minutes',
          },
        ],
      },
    ];
    const layout = layoutWorkflowGraph(buildWorkflowGraph(steps));
    const loop = layout.groups.find(g => g.kind === 'forEach')!;
    expect(loop.titleFit).toBe('twoLines');
    // What the loop does ("…, in order") wraps at this width as well.
    expect(loop.labelFit).toBe('twoLines');
    expect(loop.headerHeight).toBe(
      FLOW_METRICS.groupHeaderTwoLines + FLOW_METRICS.groupLabelLineHeight,
    );
    expect(nodeOf(layout, 's0.0').y).toBeGreaterThanOrEqual(
      loop.y + loop.headerHeight,
    );
    const parallel = layout.groups.find(g => g.kind === 'parallel')!;
    expect(parallel.headerHeight).toBe(FLOW_METRICS.groupHeader);
    const [a, b] = ['s1.0', 's1.1'].map(key => nodeOf(layout, key));
    expect(a.y).toBe(b.y);
    expect(a.height).toBe(FLOW_METRICS.nodeHeight);
    expect(b.height).toBe(FLOW_METRICS.nodeHeightTwoLines);
    expect(b.y + b.height).toBeLessThanOrEqual(parallel.y + parallel.height);
  });
});

describe('layoutWorkflowGraph — one step expanded in place', () => {
  const graph = buildWorkflowGraph(STEPS, CLEANUP);
  const folded = layoutWorkflowGraph(graph);
  const nodeOf = (
    layout: ReturnType<typeof layoutWorkflowGraph>,
    key: string,
  ) => layout.nodes.find(n => n.node.key === key)!;
  const groupOf = (
    layout: ReturnType<typeof layoutWorkflowGraph>,
    kind: string,
  ) => layout.groups.find(g => g.kind === kind)!;
  /** No two step boxes overlap, no gate sits on a box, all inside bounds. */
  const noOverlap = (layout: ReturnType<typeof layoutWorkflowGraph>) => {
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a === b) continue;
        expect(
          a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height,
        ).toBe(false);
      }
      for (const gate of layout.gates) {
        const onBox =
          gate.x > a.x &&
          gate.x < a.x + a.width &&
          gate.y > a.y &&
          gate.y < a.y + a.height;
        expect(onBox).toBe(false);
      }
      expect(a.y + a.height).toBeLessThanOrEqual(layout.height);
    }
  };

  it('folds every step without an expansion', () => {
    expect(folded.nodes.every(n => n.detailsHeight === 0)).toBe(true);
    expect(folded.groups.every(g => g.detailsHeight === 0)).toBe(true);
  });

  it('grows the expanded step by its details and moves everything after it down', () => {
    const open = layoutWorkflowGraph(graph, { key: 's0', height: 150 });
    const step = nodeOf(open, 's0');
    expect(step.detailsHeight).toBe(150);
    expect(step.height).toBe(nodeOf(folded, 's0').height + 150);
    // Its own place and width stay; the next step keeps its edge length.
    expect(step.y).toBe(nodeOf(folded, 's0').y);
    expect(step.width).toBe(nodeOf(folded, 's0').width);
    expect(nodeOf(open, 's1').y).toBe(nodeOf(folded, 's1').y + 150);
    expect(groupOf(open, 'forEach').y).toBe(groupOf(folded, 'forEach').y + 150);
    expect(open.height).toBe(folded.height + 150);
    // The gate into the next step moves with its edge, clear of the details.
    const gate = open.gates.find(g => g.key === 's1')!;
    expect(gate.y).toBeGreaterThan(step.y + step.height);
    noOverlap(open);
  });

  it('opens one step at a time: the others stay folded', () => {
    const open = layoutWorkflowGraph(graph, { key: 's1', height: 90 });
    expect(open.nodes.filter(n => n.detailsHeight > 0)).toEqual([
      expect.objectContaining({ node: expect.objectContaining({ key: 's1' }) }),
    ]);
  });

  it('gives a group head’s details room above the group’s steps', () => {
    const open = layoutWorkflowGraph(graph, { key: 's2', height: 120 });
    const loop = groupOf(open, 'forEach');
    expect(loop.detailsHeight).toBe(120);
    expect(loop.height).toBe(groupOf(folded, 'forEach').height + 120);
    expect(nodeOf(open, 's2.0').y).toBeGreaterThanOrEqual(
      loop.y + loop.headerHeight + 120,
    );
    noOverlap(open);
  });

  it('grows a parallel row to its expanded sibling, its neighbors in place beside it', () => {
    const open = layoutWorkflowGraph(graph, { key: 's3.1', height: 200 });
    const [left, middle, right] = ['s3.0', 's3.1', 's3.2'].map(key =>
      nodeOf(open, key),
    );
    expect(middle.height).toBe(nodeOf(folded, 's3.1').height + 200);
    expect(left.y).toBe(middle.y);
    expect(right.y).toBe(middle.y);
    expect(left.height).toBe(nodeOf(folded, 's3.0').height);
    const parallel = groupOf(open, 'parallel');
    expect(middle.y + middle.height).toBeLessThanOrEqual(
      parallel.y + parallel.height,
    );
    noOverlap(open);
  });

  it('grows a cleanup step inside its lane', () => {
    const open = layoutWorkflowGraph(graph, { key: 'f0', height: 80 });
    const lane = groupOf(open, 'onFailure');
    expect(nodeOf(open, 'f1').y).toBe(nodeOf(folded, 'f1').y + 80);
    expect(nodeOf(open, 'f1').y + nodeOf(open, 'f1').height).toBeLessThan(
      lane.y + lane.height,
    );
  });

  it('ignores an unknown key and a negative height', () => {
    expect(layoutWorkflowGraph(graph, { key: 'nope', height: 100 })).toEqual(
      folded,
    );
    expect(layoutWorkflowGraph(graph, { key: 's0', height: -5 })).toEqual(
      folded,
    );
  });
});

describe('mapRunToGraph', () => {
  const graph = buildWorkflowGraph(STEPS, CLEANUP);

  it('marks each step with its recorded outcome and duration', () => {
    const overlay = mapRunToGraph(graph, [
      record('fetch', 'completed', { duration_ms: 1200 }),
      record('apply', 'skipped'),
    ]);
    expect(overlay.s0).toEqual({
      status: 'completed',
      runs: 1,
      durationMs: 1200,
    });
    expect(overlay.s1).toEqual({ status: 'skipped', runs: 1 });
  });

  it('leaves out a duration muster did not record', () => {
    const overlay = mapRunToGraph(graph, [record('fetch', 'completed')]);
    expect(overlay.s0.durationMs).toBeUndefined();
  });

  it('marks steps the run left no record for as not run', () => {
    const overlay = mapRunToGraph(graph, [record('fetch', 'failed')]);
    expect(overlay.s1.status).toBe('notRun');
    expect(overlay['s2.0'].status).toBe('notRun');
    expect(overlay.s2.status).toBe('notRun');
    expect(overlay.f0.status).toBe('notRun');
  });

  it('folds a loop body step’s iterations into one count, failure first', () => {
    const overlay = mapRunToGraph(graph, [
      record('probe', 'completed', { duration_ms: 100 }),
      record('probe_1', 'completed', { duration_ms: 200 }),
      record('probe', 'failed', { error: 'boom' }),
      record('report', 'skipped'),
    ]);
    expect(overlay['s2.0']).toEqual({
      status: 'failed',
      runs: 3,
      durationMs: 300,
      error: 'boom',
    });
    expect(overlay['s2.1']).toEqual({ status: 'skipped', runs: 1 });
    // The group head has no record: it takes its verdict from its body.
    expect(overlay.s2.status).toBe('failed');
  });

  it('reads a group skipped by its own condition off the head’s record', () => {
    const overlay = mapRunToGraph(graph, [record('both', 'skipped')]);
    expect(overlay.s3).toEqual({ status: 'skipped', runs: 1 });
    expect(overlay['s3.0'].status).toBe('notRun');
  });

  it('derives a parallel group from its siblings', () => {
    const overlay = mapRunToGraph(graph, [
      record('left', 'completed'),
      record('right', 'skipped'),
      record('middle', 'inprogress'),
    ]);
    expect(overlay['s3.2'].status).toBe('running');
    expect(overlay.s3.status).toBe('running');
    const done = mapRunToGraph(graph, [
      record('left', 'skipped'),
      record('right', 'skipped'),
      record('middle', 'skipped'),
    ]);
    expect(done.s3.status).toBe('skipped');
  });

  it('puts records after a fatal failure on the cleanup lane, even under a shared id', () => {
    const overlay = mapRunToGraph(graph, [
      record('fetch', 'failed', { error: 'denied' }),
      record('rollback', 'completed'),
      record('apply', 'completed'),
    ]);
    expect(overlay.s0).toMatchObject({ status: 'failed', error: 'denied' });
    expect(overlay.f0.status).toBe('completed');
    expect(overlay.f1.status).toBe('completed');
    // The main step of the same id did not run.
    expect(overlay.s1.status).toBe('notRun');
  });

  it('keeps going on the spine after a failure the step may have', () => {
    const overlay = mapRunToGraph(graph, [
      record('fetch', 'completed'),
      record('apply', 'failed'),
      record('probe', 'completed'),
    ]);
    expect(overlay.s1.status).toBe('failed');
    expect(overlay['s2.0'].status).toBe('completed');
    expect(overlay.f1.status).toBe('notRun');
  });

  it('claims nothing for a run without per-step records', () => {
    expect(mapRunToGraph(graph, undefined)).toEqual({});
    expect(mapRunToGraph(graph, [])).toEqual({});
  });

  it('ignores records for ids the definition no longer has', () => {
    const overlay = mapRunToGraph(graph, [record('renamed', 'completed')]);
    expect(overlay.s0.status).toBe('notRun');
    expect(Object.values(overlay).every(o => o.status === 'notRun')).toBe(true);
  });
});

describe('stepToolEffects', () => {
  const graph = buildWorkflowGraph(STEPS, CLEANUP);

  it('reads each step tool’s effect off the catalogue', () => {
    const effects = stepToolEffects(graph, [
      { name: 'x_kubernetes_get_pods', annotations: { readOnlyHint: true } },
      { name: 'x_kubernetes_apply', annotations: { readOnlyHint: false } },
      { name: 'x_kubernetes_delete' },
      { name: 'core_service_list', annotations: { readOnlyHint: true } },
    ]);
    expect(effects).toEqual({
      s0: 'reads',
      s1: 'changes',
      's2.0': 'reads',
      f0: 'changes',
      f1: 'changes',
    });
  });

  it('leaves tools the catalogue does not list unknown', () => {
    expect(stepToolEffects(graph, [])).toEqual({});
    expect(stepToolEffects(graph, undefined)).toEqual({});
  });
});

describe('findFlowStep', () => {
  const graph = buildWorkflowGraph(STEPS, CLEANUP);

  it('finds a plain step, a group head with its group, a sub-step and a cleanup step', () => {
    expect(findFlowStep(graph, 's0')).toEqual({ node: graph.main[0].node });
    expect(findFlowStep(graph, 's2')?.group?.kind).toBe('forEach');
    const sub = findFlowStep(graph, 's3.1');
    expect(sub?.node.id).toBe('right');
    expect(sub?.node.parentKey).toBe('s3');
    expect(sub?.group?.kind).toBe('parallel');
    const cleanup = findFlowStep(graph, 'f1');
    expect(cleanup?.node).toMatchObject({ id: 'apply', lane: 'cleanup' });
    expect(cleanup?.group).toBeUndefined();
  });

  it('keeps the definition for the details, and knows nothing of unknown keys', () => {
    expect(findFlowStep(graph, 's1')?.node.definition).toBe(STEPS[1]);
    expect(findFlowStep(graph, 'nope')).toBeUndefined();
  });
});

describe('a nested forEach (fleet-image-scan)', () => {
  const fleet = fleetImageScanWorkflow();
  const graph = buildWorkflowGraph(fleet.getSteps(), fleet.getOnFailureSteps());
  const KINDS = [
    'deployments',
    'replicasets',
    'statefulsets',
    'daemonsets',
    'cronjobs',
    'jobs',
    'pods',
  ];

  const outer = graph.main[0];
  const inner = outer.kind === 'forEach' ? outer.children[1] : undefined;
  const nodeOf = (
    layout: ReturnType<typeof layoutWorkflowGraph>,
    key: string,
  ) => layout.nodes.find(placed => placed.node.key === key)!;

  it('models the nested loop as a group of its own, numbered on', () => {
    if (outer.kind !== 'forEach' || inner?.kind !== 'forEach') {
      throw new Error('expected two loops');
    }
    expect(graph.main).toHaveLength(1);
    expect(
      outer.children.map(c => [c.kind, c.node.key, c.node.number]),
    ).toEqual([
      ['step', 's0.0', '1.1'],
      ['forEach', 's0.1', '1.2'],
    ]);
    expect(
      inner.children.map(c => [c.kind, c.node.key, c.node.number, c.node.id]),
    ).toEqual(
      KINDS.map((kind, k) => ['step', `s0.1.${k}`, `1.2.${k + 1}`, kind]),
    );
    expect(inner.node.parentKey).toBe('s0');
    expect(inner.children[0].node.parentKey).toBe('s0.1');
    // Every tool step names its tool; only the loop heads have none.
    for (const item of flowItemsInOrder(graph.main)) {
      expect(Boolean(item.node.tool)).toBe(item.kind === 'step');
    }
    expect(graph.stepNumbers).toMatchObject({
      fleet: '1',
      clusters: '1.1',
      scan: '1.2',
      pods: '1.2.7',
    });
  });

  it('labels each loop with what it reads and how many run at once', () => {
    if (outer.kind !== 'forEach' || inner?.kind !== 'forEach') {
      throw new Error('expected two loops');
    }
    expect(groupLabel(outer, graph.stepNumbers)).toBe(
      'For each mc in the input “management_clusters”, up to 8 at once',
    );
    expect(groupLabel(inner, graph.stepNumbers)).toBe(
      'For each cluster in the result of step 1.1 (clusters), one at a time',
    );
    expect(iterationsLabel({})).toBe('in order');
    expect(iterationsLabel({ parallelism: 1 })).toBe('one at a time');
    expect(iterationsLabel({ parallelism: 50 })).toBe('up to 50 at once');
  });

  it('keeps each step’s pagination bound and jq program', () => {
    const nodes = flowItemsInOrder(graph.main).map(item => item.node);
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    expect(byId.clusters.paginate).toEqual({ maxPages: 10 });
    expect(byId.deployments.paginate).toEqual({ maxPages: 100 });
    expect(byId.fleet.paginate).toBeUndefined();
    expect(byId.fleet.jq).toContain('clusters_scanned');
    expect(byId.scan.jq).toBeUndefined();
    expect(nodes.filter(node => node.jq)).toHaveLength(9);
    expect(featureLabels(byId.pods)).toEqual([
      'Paginated, up to 100 pages',
      'jq transform',
    ]);
    // muster's default bound where the definition sets none.
    const unbounded = buildWorkflowGraph([
      { id: 'a', tool: 'x_a', paginate: {} },
    ]);
    expect(unbounded.main[0].node.paginate).toEqual({
      maxPages: DEFAULT_MAX_PAGES,
    });
    expect(paginateLabel({ maxPages: 1 })).toBe('Paginated, up to 1 page');
  });

  it('finds a nested step with its loop, and a nested loop with the loop around it', () => {
    const step = findFlowStep(graph, 's0.1.3')!;
    expect(step.node.id).toBe('daemonsets');
    expect(step.group?.node.key).toBe('s0.1');
    expect(step.container?.node.key).toBe('s0.1');
    const head = findFlowStep(graph, 's0.1')!;
    expect(head.group?.node.key).toBe('s0.1');
    expect(head.container?.node.key).toBe('s0');
    expect(findFlowStep(graph, 's0')!.container).toBeUndefined();
  });

  it('draws the nested loop inside the outer one and its steps inside it', () => {
    const layout = layoutWorkflowGraph(graph);
    const [outerBox, innerBox] = layout.groups;
    expect(layout.groups.map(g => [g.kind, g.node?.key])).toEqual([
      ['forEach', 's0'],
      ['forEach', 's0.1'],
    ]);
    const inside = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) =>
      a.x >= b.x &&
      a.y >= b.y &&
      a.x + a.width <= b.x + b.width &&
      a.y + a.height <= b.y + b.height;
    expect(inside(innerBox, outerBox)).toBe(true);
    expect(innerBox.width).toBe(outerBox.width - 2 * FLOW_METRICS.groupPadding);
    expect(layout.nodes).toHaveLength(8);
    for (const node of layout.nodes) {
      expect(inside(node, outerBox)).toBe(true);
      expect(inside(node, innerBox)).toBe(node.node.key !== 's0.0');
      // Below the head of the innermost group it sits in.
      const group = node.node.key === 's0.0' ? outerBox : innerBox;
      expect(node.y).toBeGreaterThanOrEqual(group.y + group.headerHeight);
    }
    // The steps stack in order, none over another.
    const sorted = [...layout.nodes].sort((a, b) => a.y - b.y);
    sorted.slice(1).forEach((node, i) => {
      expect(node.y).toBeGreaterThanOrEqual(sorted[i].y + sorted[i].height);
    });
    // The step before the nested loop ends above it; the gate (its
    // condition) sits on the edge between them.
    const clusters = nodeOf(layout, 's0.0');
    expect(clusters.y + clusters.height).toBeLessThan(innerBox.y);
    expect(layout.gates.map(g => g.key)).toEqual(['s0.1']);
    // A row of markers more than a plain step.
    expect(clusters.height).toBeGreaterThanOrEqual(
      FLOW_METRICS.nodeHeight + FLOW_METRICS.featureRow,
    );
    expect(outerBox.headerHeight).toBeGreaterThanOrEqual(
      FLOW_METRICS.groupHeader + FLOW_METRICS.featureRow,
    );
  });

  it('opens a nested step in place, moving what follows it down', () => {
    const folded = layoutWorkflowGraph(graph);
    const open = layoutWorkflowGraph(graph, { key: 's0.1.2', height: 120 });
    expect(nodeOf(open, 's0.1.2').height).toBe(
      nodeOf(folded, 's0.1.2').height + 120,
    );
    expect(nodeOf(open, 's0.1.3').y).toBe(nodeOf(folded, 's0.1.3').y + 120);
    expect(nodeOf(open, 's0.1.1').y).toBe(nodeOf(folded, 's0.1.1').y);
    expect(open.groups[0].height).toBe(folded.groups[0].height + 120);
  });

  it('lays a group inside a parallel group out in the row', () => {
    const layout = layoutWorkflowGraph(
      buildWorkflowGraph([
        {
          id: 'both',
          parallel: [
            { id: 'a', tool: 'x_a' },
            {
              id: 'loop',
              forEach: {
                items: '{{ .input.xs }}',
                steps: [{ id: 'b', tool: 'x_b' }],
              },
            },
          ],
        },
      ]),
    );
    const [row, loopBox] = layout.groups;
    const a = nodeOf(layout, 's0.0');
    expect(loopBox.y).toBe(a.y);
    expect(loopBox.x).toBeGreaterThanOrEqual(a.x + a.width);
    expect(loopBox.x + loopBox.width).toBeLessThanOrEqual(row.x + row.width);
    expect(nodeOf(layout, 's0.1.0').y).toBeGreaterThan(loopBox.y);
  });

  it('lays the last run’s nested records onto the nested steps', () => {
    const records = [
      record('clusters', 'completed', { duration_ms: 100 }),
      record('deployments', 'completed', { duration_ms: 10 }),
      record('deployments_1', 'completed', { duration_ms: 10 }),
      record('pods_0_1', 'failed', { error: 'boom' }),
    ];
    const overlay = mapRunToGraph(graph, records);
    expect(overlay['s0.0']).toMatchObject({ status: 'completed', runs: 1 });
    expect(overlay['s0.1.0']).toMatchObject({
      status: 'completed',
      runs: 2,
      durationMs: 20,
    });
    expect(overlay['s0.1.6']).toMatchObject({
      status: 'failed',
      error: 'boom',
    });
    expect(overlay['s0.1.1']).toEqual({ status: 'notRun', runs: 0 });
    // Each loop head takes its verdict from what it holds.
    expect(overlay['s0.1'].status).toBe('failed');
    expect(overlay.s0.status).toBe('failed');
  });

  it('reads each nested tool’s effect off the catalogue', () => {
    const effects = stepToolEffects(graph, [
      { name: 'x_kubernetes_list', annotations: { readOnlyHint: true } },
    ]);
    expect(Object.keys(effects).sort()).toEqual(
      ['s0.0', ...KINDS.map((_, k) => `s0.1.${k}`)].sort(),
    );
  });

  it('builds what it knows of fields it does not know', () => {
    const odd = buildWorkflowGraph([
      { id: 'wait', ...({ wait: { seconds: 5 } } as object) } as WorkflowStep,
      {
        id: 'loop',
        forEach: {
          items: '{{ .input.xs }}',
          parallelism: 'all' as never,
          steps: [
            {
              id: 'call',
              tool: 'x_a',
              paginate: 'yes' as never,
              jq: 42 as never,
            },
          ],
        },
      },
      { id: 'empty', forEach: { items: '{{ .input.xs }}' } as never },
    ]);
    expect(odd.main.map(item => item.kind)).toEqual([
      'step',
      'forEach',
      'forEach',
    ]);
    expect(odd.main[0].node.tool).toBeUndefined();
    const loopItem = odd.main[1];
    if (loopItem.kind !== 'forEach') throw new Error('expected a loop');
    expect(iterationsLabel(loopItem.forEach)).toBe('in order');
    expect(loopItem.children[0].node).not.toHaveProperty('paginate');
    expect(loopItem.children[0].node).not.toHaveProperty('jq');
    expect(() => layoutWorkflowGraph(odd)).not.toThrow();
  });
});
