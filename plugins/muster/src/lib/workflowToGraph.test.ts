import { Workflow, WorkflowExecution } from '../apis/types';
import {
  INPUT_NODE_ID,
  StepNodeData,
  workflowToGraph,
} from './workflowToGraph';

const workflow: Workflow = {
  name: 'deploy-app',
  description: 'Deploy an application',
  args: {
    cluster: { type: 'string', required: true },
  },
  steps: [
    { id: 'check-cluster', tool: 'k8s_cluster_get', store: true },
    {
      id: 'deploy',
      tool: 'helm_install',
      args: { cluster: '{{ .input.cluster }}' },
    },
    {
      id: 'rollback',
      tool: 'helm_rollback',
      allow_failure: true,
      condition: {
        from_step: 'deploy',
        expect_not: { success: true },
      },
    },
  ],
};

describe('workflowToGraph', () => {
  it('creates an input node and one node per step in vertical order', () => {
    const { nodes } = workflowToGraph(workflow);

    expect(nodes.map(node => node.id)).toEqual([
      INPUT_NODE_ID,
      'check-cluster',
      'deploy',
      'rollback',
    ]);
    expect(nodes[0].type).toBe('workflowInput');
    expect(nodes.slice(1).every(node => node.type === 'workflowStep')).toBe(
      true,
    );

    // Vertical layout: same x, strictly increasing y.
    const ys = nodes.map(node => node.position.y);
    expect(nodes.every(node => node.position.x === 0)).toBe(true);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });

  it('connects steps in sequence starting from the input node', () => {
    const { edges } = workflowToGraph(workflow);
    const sequenceEdges = edges.filter(edge => edge.id.startsWith('seq-'));

    expect(
      sequenceEdges.map(edge => [edge.source, edge.target]),
    ).toEqual([
      [INPUT_NODE_ID, 'check-cluster'],
      ['check-cluster', 'deploy'],
      ['deploy', 'rollback'],
    ]);
    expect(sequenceEdges.every(edge => edge.animated === false)).toBe(true);
  });

  it('draws a dashed labeled condition edge from condition.from_step', () => {
    const { edges } = workflowToGraph(workflow);
    const conditionEdge = edges.find(edge => edge.id.startsWith('cond-'));

    expect(conditionEdge).toMatchObject({
      source: 'deploy',
      target: 'rollback',
      label: 'expect not',
    });
    expect(conditionEdge?.style?.strokeDasharray).toBe('6 4');
  });

  it('ignores condition.from_step references to unknown steps', () => {
    const { edges } = workflowToGraph({
      ...workflow,
      steps: [
        {
          id: 'only',
          tool: 'noop',
          condition: { from_step: 'missing', expect: { success: true } },
        },
      ],
    });

    expect(edges.filter(edge => edge.id.startsWith('cond-'))).toHaveLength(0);
  });

  it('leaves status undefined without an execution overlay', () => {
    const { nodes } = workflowToGraph(workflow);
    const stepData = nodes[1].data as StepNodeData;

    expect(stepData.status).toBeUndefined();
    expect(stepData.executionStep).toBeUndefined();
  });

  describe('with an execution overlay', () => {
    const execution: WorkflowExecution = {
      execution_id: 'exec-1',
      workflow_name: 'deploy-app',
      status: 'inprogress',
      started_at: '2026-06-10T12:00:00Z',
      duration_ms: 1500,
      input: { cluster: 'gazelle' },
      steps: [
        {
          step_id: 'check-cluster',
          tool: 'k8s_cluster_get',
          status: 'completed',
          started_at: '2026-06-10T12:00:00Z',
          completed_at: '2026-06-10T12:00:01Z',
          duration_ms: 1000,
        },
        {
          step_id: 'deploy',
          tool: 'helm_install',
          status: 'inprogress',
          started_at: '2026-06-10T12:00:01Z',
          duration_ms: 500,
        },
      ],
    };

    it('colors nodes by step status and marks unreached steps pending', () => {
      const { nodes } = workflowToGraph(workflow, execution);
      const statusById = Object.fromEntries(
        nodes
          .filter(node => node.type === 'workflowStep')
          .map(node => [node.id, (node.data as StepNodeData).status]),
      );

      expect(statusById).toEqual({
        'check-cluster': 'completed',
        deploy: 'inprogress',
        rollback: 'pending',
      });
    });

    it('animates only the edge into the running step', () => {
      const { edges } = workflowToGraph(workflow, execution);
      const animated = edges.filter(edge => edge.animated);

      expect(animated.map(edge => edge.id)).toEqual([
        'seq-check-cluster-deploy',
      ]);
    });

    it('passes the execution input to the input node', () => {
      const { nodes } = workflowToGraph(workflow, execution);

      expect(nodes[0].data).toMatchObject({
        kind: 'input',
        input: { cluster: 'gazelle' },
      });
    });

    it('surfaces the condition evaluation outcome for skipped steps', () => {
      const { nodes } = workflowToGraph(workflow, {
        ...execution,
        status: 'completed',
        steps: [
          ...execution.steps!,
          {
            step_id: 'rollback',
            tool: 'helm_rollback',
            status: 'skipped',
            started_at: '2026-06-10T12:00:02Z',
            duration_ms: 0,
            result: { condition_evaluation: false },
          },
        ],
      });

      const rollback = nodes.find(node => node.id === 'rollback');
      expect((rollback?.data as StepNodeData).status).toBe('skipped');
      expect((rollback?.data as StepNodeData).conditionEvaluation).toBe(false);
    });
  });
});
