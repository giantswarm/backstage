import { MusterWorkflow } from './k8s';

/** Prefix muster gives the aggregated tool that runs a workflow by name. */
export const WORKFLOW_TOOL_PREFIX = 'workflow_';

/**
 * Workflows whose steps (or parallel/forEach sub-steps) call `target` via its
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
    return workflow.getSteps().some(step => {
      if (step.tool === wanted) {
        return true;
      }
      const subSteps = [
        ...(step.parallel ?? []),
        ...(step.forEach?.steps ?? []),
      ];
      return subSteps.some(sub => sub.tool === wanted);
    });
  });
}
