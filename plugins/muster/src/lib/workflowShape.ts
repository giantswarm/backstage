import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import type { WorkflowStep } from './k8s';

/**
 * A workflow's steps at every depth: what a forEach body or a parallel group
 * holds, and how many steps the workflow amounts to.
 */

/**
 * The steps a step holds: its forEach body or its parallel group, else none.
 * A step that carries both draws (and runs) as its forEach.
 */
export function subStepsOf(step: WorkflowStep): WorkflowStep[] {
  if (step.forEach) {
    return Array.isArray(step.forEach.steps) ? step.forEach.steps : [];
  }
  return Array.isArray(step.parallel) ? step.parallel : [];
}

/** Whether a step is a forEach or a parallel group rather than one call. */
export function isGroupStep(step: WorkflowStep): boolean {
  return Boolean(step.forEach) || Array.isArray(step.parallel);
}

/** Every step at every depth, each before the steps it holds. */
export function allSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.flatMap(step => [step, ...allSteps(subStepsOf(step))]);
}

export interface WorkflowShape {
  /** The steps that call something (every step but a group), at any depth. */
  toolSteps: number;
  /** The forEach steps, at any depth. */
  loops: number;
  /** The forEach steps inside another loop or group. */
  nestedLoops: number;
  /** The parallel groups, at any depth. */
  parallelGroups: number;
  /** Whether every tool step sits inside a loop or a group. */
  allGrouped: boolean;
}

/** How many steps a workflow holds and how they are grouped. */
export function workflowShape(steps: WorkflowStep[]): WorkflowShape {
  const shape: WorkflowShape = {
    toolSteps: 0,
    loops: 0,
    nestedLoops: 0,
    parallelGroups: 0,
    allGrouped: true,
  };
  const visit = (step: WorkflowStep, depth: number) => {
    if (step.forEach) {
      shape.loops += 1;
      if (depth > 0) shape.nestedLoops += 1;
    } else if (Array.isArray(step.parallel)) {
      shape.parallelGroups += 1;
    } else {
      shape.toolSteps += 1;
      if (depth === 0) shape.allGrouped = false;
    }
    subStepsOf(step).forEach(sub => visit(sub, depth + 1));
  };
  steps.forEach(step => visit(step, 0));
  return shape;
}

function loopsPhrase({ loops, nestedLoops }: WorkflowShape): string {
  if (nestedLoops === 0) return countNoun(loops, 'loop');
  // Every loop but the outermost one inside another: one nest of loops.
  if (nestedLoops === loops - 1) return `${loops} nested loops`;
  return `${countNoun(loops, 'loop')} (${nestedLoops} nested)`;
}

/**
 * A workflow's size in words, counting the steps at every depth: "3 steps"
 * for a plain list; with loops or parallel groups, the tool steps they hold
 * and the groups — "8 tool steps in 2 nested loops", "5 tool steps, 1 loop"
 * (some steps sit outside it), "4 tool steps in 1 loop and 1 parallel
 * group". The cleanup steps are not counted: they run only on a failure.
 */
export function workflowShapeLabel(steps: WorkflowStep[]): string {
  const shape = workflowShape(steps);
  if (shape.loops === 0 && shape.parallelGroups === 0) {
    return countNoun(steps.length, 'step');
  }
  const groups = [
    shape.loops > 0 ? loopsPhrase(shape) : undefined,
    shape.parallelGroups > 0
      ? countNoun(shape.parallelGroups, 'parallel group')
      : undefined,
  ]
    .filter(Boolean)
    .join(' and ');
  return `${countNoun(shape.toolSteps, 'tool step')}${
    shape.allGrouped ? ' in ' : ', '
  }${groups}`;
}
