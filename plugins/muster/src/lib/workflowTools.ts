import { MusterWorkflow, WorkflowCondition, WorkflowStep } from './k8s';
import { ServerPrefixInfo, matchServers } from './toolGrouping';
import { WORKFLOW_TOOL_PREFIX } from './workflowReferences';

/** A step's own tool and the one its condition calls, where it has them. */
function ownTools(step: {
  tool?: string;
  condition?: WorkflowCondition;
}): string[] {
  return [step.tool, step.condition?.tool].filter((tool): tool is string =>
    Boolean(tool),
  );
}

function stepTools(steps: WorkflowStep[]): string[] {
  return steps.flatMap(step => [
    ...ownTools(step),
    ...[...(step.parallel ?? []), ...(step.forEach?.steps ?? [])].flatMap(
      ownTools,
    ),
  ]);
}

/**
 * Every tool a workflow's run can call: muster's `status.referencedTools` and
 * the definition's own steps and their conditions (parallel, forEach and
 * onFailure included), also
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
      ...current.getOnFailureSteps().flatMap(ownTools),
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
