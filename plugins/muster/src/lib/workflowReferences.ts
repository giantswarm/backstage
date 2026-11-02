import { MusterWorkflow } from './k8s';
import { allSteps } from './workflowShape';

/** Prefix muster gives the aggregated tool that runs a workflow by name. */
export const WORKFLOW_TOOL_PREFIX = 'workflow_';

/**
 * Workflows whose steps (or parallel/forEach sub-steps, at any depth) call `target` via its
 * `workflow_<target>` tool. Cheap because every Workflow CR is already loaded
 * by the MusterDataProvider -- no per-workflow fetch. The target itself is
 * excluded even if it recurses.
 */
export function findReferencedBy(
  target: string,
  all: MusterWorkflow[],
): MusterWorkflow[] {
  const wanted = `${WORKFLOW_TOOL_PREFIX}${target}`;
  return all.filter(workflow => {
    if (workflow.getName() === target) {
      return false;
    }
    return allSteps(workflow.getSteps()).some(step => step.tool === wanted);
  });
}
