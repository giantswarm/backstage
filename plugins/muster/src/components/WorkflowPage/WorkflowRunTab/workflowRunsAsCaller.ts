import { MCPServer } from '../../../lib/k8s';
import { matchServers, ServerPrefixInfo } from '../../../lib/toolGrouping';
import { WORKFLOW_TOOL_PREFIX } from '../../../lib/workflowReferences';
import { runsAsCaller } from '../../ConnectorPage/connectorFacts';

/**
 * Whether every tool a workflow's steps call (nested workflows' included, as
 * `toolsOfWorkflow` lists them) is a connector's that acts as the caller, so
 * the whole run acts with the person's identity. A step on muster's own tools
 * or on a connector with its own credentials makes it false, as on a tool's
 * page.
 */
export function workflowRunsAsCaller(
  tools: string[],
  prefixes: ServerPrefixInfo[],
  servers: MCPServer[],
  installation: string | undefined,
): boolean {
  const stepTools = tools.filter(
    tool => !tool.startsWith(WORKFLOW_TOOL_PREFIX),
  );
  return (
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
