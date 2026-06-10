import type { Edge, Node } from '@xyflow/react';
import {
  Workflow,
  WorkflowArgDefinition,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowStep,
} from '../apis/types';

/**
 * Per-node execution status. `pending` is used for steps an in-progress
 * execution has not reached yet; `undefined` (no overlay) means the graph
 * shows the bare workflow definition.
 */
export type StepNodeStatus =
  | 'pending'
  | 'inprogress'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface StepNodeData {
  kind: 'step';
  step: WorkflowStep;
  status?: StepNodeStatus;
  executionStep?: WorkflowExecutionStep;
  /** Boolean outcome of the step's condition, when evaluated. */
  conditionEvaluation?: boolean;
  [key: string]: unknown;
}

export interface InputNodeData {
  kind: 'input';
  workflowName: string;
  args: Record<string, WorkflowArgDefinition>;
  /** Arguments of the selected execution, when an overlay is applied. */
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

export type WorkflowNodeData = StepNodeData | InputNodeData;

export const INPUT_NODE_ID = '__input';

const NODE_WIDTH = 320;
const INPUT_NODE_OFFSET = 150;
const STEP_VERTICAL_GAP = 170;

function summarizeCondition(step: WorkflowStep): string {
  const condition = step.condition;
  if (!condition) return '';
  return condition.expect_not !== undefined ? 'expect not' : 'expect';
}

function extractConditionEvaluation(
  executionStep: WorkflowExecutionStep | undefined,
): boolean | undefined {
  const result = executionStep?.result;
  if (result && typeof result === 'object' && 'condition_evaluation' in result) {
    const value = (result as Record<string, unknown>).condition_evaluation;
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

/**
 * Transform a muster workflow definition (plus an optional execution
 * overlay) into xyflow nodes and edges.
 *
 * Layout is a vertical linear sequence: an input node for the workflow
 * args followed by one node per step in definition order. Condition
 * dependencies (`condition.from_step`) are drawn as dashed side edges from
 * the referenced step to the guarded step.
 */
export function workflowToGraph(
  workflow: Workflow,
  execution?: WorkflowExecution,
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const nodes: Node<WorkflowNodeData>[] = [];
  const edges: Edge[] = [];

  const executionSteps = new Map<string, WorkflowExecutionStep>();
  for (const step of execution?.steps ?? []) {
    executionSteps.set(step.step_id, step);
  }

  nodes.push({
    id: INPUT_NODE_ID,
    type: 'workflowInput',
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    data: {
      kind: 'input',
      workflowName: workflow.name,
      args: workflow.args ?? {},
      input: execution?.input,
    },
  });

  const steps = workflow.steps ?? [];
  steps.forEach((step, index) => {
    const executionStep = executionSteps.get(step.id);
    let status: StepNodeStatus | undefined;
    if (execution) {
      status = executionStep?.status ?? 'pending';
    }

    nodes.push({
      id: step.id,
      type: 'workflowStep',
      position: {
        x: 0,
        y: INPUT_NODE_OFFSET + index * STEP_VERTICAL_GAP,
      },
      width: NODE_WIDTH,
      data: {
        kind: 'step',
        step,
        status,
        executionStep,
        conditionEvaluation: extractConditionEvaluation(executionStep),
      },
    });

    const source = index === 0 ? INPUT_NODE_ID : steps[index - 1].id;
    edges.push({
      id: `seq-${source}-${step.id}`,
      source,
      target: step.id,
      // Animate the edge into the currently running step.
      animated: status === 'inprogress',
    });

    const fromStep = step.condition?.from_step;
    if (fromStep && steps.some(s => s.id === fromStep)) {
      edges.push({
        id: `cond-${fromStep}-${step.id}`,
        source: fromStep,
        sourceHandle: 'condition-out',
        target: step.id,
        targetHandle: 'condition-in',
        label: summarizeCondition(step),
        style: { strokeDasharray: '6 4' },
      });
    }
  });

  return { nodes, edges };
}
