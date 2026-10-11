import type { WorkflowExecutionStep } from '../apis/types';
import type { WorkflowStep, WorkflowSubStep } from './k8s';
import {
  buildWorkflowGraph,
  estimateTextWidth,
  findFlowStep,
  FLOW_METRICS,
  forEachSummary,
  layoutWorkflowGraph,
  mapRunToGraph,
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
    expect(forEach.children.map(c => [c.key, c.number, c.title])).toEqual([
      ['s2.0', '3.1', 'Probe it'],
      ['s2.1', '3.2', 'report'],
    ]);
    expect(parallel.children.map(c => c.id)).toEqual([
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
      forEachSummary({ items: '{{ .results.fetch.items }}' }, ['x', 'fetch']),
    ).toBe('For each item in the result of step 2 (fetch)');
    expect(forEachSummary({ items: '{{.results.gone}}' }, [])).toBe(
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
    expect(group.label).toBe('For each cluster in the input “clusters”');
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
    expect(loop.headerHeight).toBe(FLOW_METRICS.groupHeaderTwoLines);
    expect(nodeOf(layout, 's0.0').y).toBeGreaterThanOrEqual(
      loop.y + FLOW_METRICS.groupHeaderTwoLines,
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
