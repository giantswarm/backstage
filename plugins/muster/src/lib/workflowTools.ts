import { MusterWorkflow, WorkflowStep } from './k8s';
import { ServerPrefixInfo, matchServers } from './toolGrouping';
import { WORKFLOW_TOOL_PREFIX } from './workflowReferences';

function stepTools(steps: WorkflowStep[]): string[] {
  return steps.flatMap(step => [
    ...(step.tool ? [step.tool] : []),
    ...(step.parallel ?? []).map(sub => sub.tool),
    ...(step.forEach?.steps ?? []).map(sub => sub.tool),
  ]);
}

/**
 * Every tool a workflow's run can call: muster's `status.referencedTools` and
 * the definition's own steps (parallel, forEach and onFailure included), also
 * through the workflows it calls as a step (`workflow_<name>`), each once.
 */
export function toolsOfWorkflow(
  workflow: MusterWorkflow,
  all: MusterWorkflow[],
): string[] {
  const tools = new Set<string>();
  const visited = new Set<string>();
  const visit = (current: MusterWorkflow) => {
    if (visited.has(current.getName())) {
      return;
    }
    visited.add(current.getName());
    for (const tool of [
      ...current.getReferencedTools(),
      ...stepTools(current.getSteps()),
      ...current.getOnFailureSteps().map(sub => sub.tool),
    ]) {
      tools.add(tool);
      if (tool.startsWith(WORKFLOW_TOOL_PREFIX)) {
        const called = all.find(
          w => w.getName() === tool.slice(WORKFLOW_TOOL_PREFIX.length),
        );
        if (called) {
          visit(called);
        }
      }
    }
  };
  visit(workflow);
  return [...tools];
}

/**
 * The servers that can answer these tools: for each `x_*` tool, every server
 * its longest prefix matches -- all instances of a family, since which one a
 * call reaches depends on its arguments.
 */
export function serversOfTools(
  tools: string[],
  prefixes: ServerPrefixInfo[],
): string[] {
  const servers = new Set<string>();
  for (const tool of tools) {
    if (tool.startsWith('x_')) {
      for (const match of matchServers(tool, prefixes)) {
        servers.add(match.serverName);
      }
    }
  }
  return [...servers].sort();
}
