import { MCPServer, MusterWorkflow } from './k8s';
import { serverPrefixInfos } from './toolGrouping';
import { serversOfTools, toolsOfWorkflow } from './workflowTools';

function workflow(
  name: string,
  spec: Record<string, unknown>,
  referencedTools?: string[],
): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: { name },
      spec,
      ...(referencedTools ? { status: { referencedTools } } : {}),
    } as never,
    'gazelle',
  );
}

function server(name: string, family?: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: family
        ? { family: { name: family, instanceArg: 'management_cluster' } }
        : {},
    } as never,
    'gazelle',
  );
}

describe('toolsOfWorkflow', () => {
  it('collects step, condition, parallel, forEach and onFailure tools and muster’s referenced ones', () => {
    const roster = workflow(
      'roster',
      {
        steps: [
          {
            id: 'a',
            tool: 'x_agent-manager_list_agents',
            condition: { tool: 'x_github_get_pr' },
          },
          { id: 'b', parallel: [{ id: 'b1', tool: 'x_kubernetes_get_pods' }] },
          {
            id: 'c',
            forEach: { items: 'x', steps: [{ id: 'c1', tool: 'x_foo_bar' }] },
          },
        ],
        onFailure: [
          {
            id: 'f',
            tool: 'x_slack_post',
            condition: { tool: 'x_slack_check' },
          },
        ],
      },
      ['x_only_in_status'],
    );
    expect(toolsOfWorkflow(roster, [roster]).sort()).toEqual([
      'x_agent-manager_list_agents',
      'x_foo_bar',
      'x_github_get_pr',
      'x_kubernetes_get_pods',
      'x_only_in_status',
      'x_slack_check',
      'x_slack_post',
    ]);
  });

  it('follows the workflows it calls, each once', () => {
    const outer = workflow('outer', {
      steps: [{ id: 'a', tool: 'workflow_inner' }],
    });
    const inner = workflow('inner', {
      steps: [
        { id: 'b', tool: 'x_kubernetes_get_pods' },
        { id: 'c', tool: 'workflow_outer' },
      ],
    });
    expect(toolsOfWorkflow(outer, [outer, inner]).sort()).toEqual([
      'workflow_inner',
      'workflow_outer',
      'x_kubernetes_get_pods',
    ]);
  });
});

describe('serversOfTools', () => {
  it('names every instance of a family, the singular server, and nothing for muster’s own', () => {
    const prefixes = serverPrefixInfos([
      server('walrus-mcp-kubernetes', 'kubernetes'),
      server('gazelle-mcp-kubernetes', 'kubernetes'),
      server('agent-manager'),
    ]);
    expect(
      serversOfTools(
        [
          'x_kubernetes_get_pods',
          'x_agent-manager_list_agents',
          'core_workflow_list',
          'workflow_inner',
          'x_unknown_tool',
        ],
        prefixes,
      ),
    ).toEqual([
      'agent-manager',
      'gazelle-mcp-kubernetes',
      'walrus-mcp-kubernetes',
    ]);
  });
});
