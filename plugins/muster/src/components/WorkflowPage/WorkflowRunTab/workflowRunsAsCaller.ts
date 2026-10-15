import { MCPServer, MusterWorkflow } from '../../../lib/k8s';
import { matchServers, ServerPrefixInfo } from '../../../lib/toolGrouping';
import { WORKFLOW_TOOL_PREFIX } from '../../../lib/workflowReferences';
import { runsAsCaller } from '../../ConnectorPage/connectorFacts';

/**
 * Whether every tool a workflow's steps call (nested workflows' included, as
 * `toolsOfWorkflow` lists them) is a connector's that acts as the caller, so
 * the whole run acts with the person's identity. A step on muster's own tools
 * or on a connector with its own credentials makes it false, as on a tool's
 * page. So does a nested workflow whose definition is not among `workflows`:
 * `toolsOfWorkflow` cannot expand it, so what it calls is unknown.
 */
export function workflowRunsAsCaller(
  tools: string[],
  workflows: MusterWorkflow[],
  prefixes: ServerPrefixInfo[],
  servers: MCPServer[],
  installation: string | undefined,
): boolean {
  const nested = tools.filter(tool => tool.startsWith(WORKFLOW_TOOL_PREFIX));
  const stepTools = tools.filter(
    tool => !tool.startsWith(WORKFLOW_TOOL_PREFIX),
  );
  const resolved = nested.every(tool =>
    workflows.some(
      w => w.getName() === tool.slice(WORKFLOW_TOOL_PREFIX.length),
    ),
  );
  return (
    resolved &&
    stepTools.length > 0 &&
    stepTools.every(tool => {
      const matches = tool.startsWith('x_') ? matchServers(tool, prefixes) : [];
      return (
        matches.length > 0 &&
        matches.every(({ serverName }) => {
          const server = servers.find(
            s =>
              s.getName() === serverName &&
              (!installation || s.cluster === installation),
          );
          return server ? runsAsCaller(server) : false;
        })
      );
    })
  );
}
