import { MCPServer } from '../../../lib/k8s';
import { serverPrefixInfos } from '../../../lib/toolGrouping';
import { workflowRunsAsCaller } from './workflowRunsAsCaller';

function server(name: string, auth?: Record<string, unknown>): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'muster' },
      spec: { type: 'streamable-http', ...(auth ? { auth } : {}) },
    } as never,
    'gazelle',
  );
}

const servers = [
  server('github', { type: 'oauth', forwardToken: true }),
  server('slack', { type: 'oauth' }),
  server('kubernetes'),
];
const prefixes = serverPrefixInfos(servers);

describe('workflowRunsAsCaller', () => {
  it('holds when every step calls a connector that acts as the caller', () => {
    expect(
      workflowRunsAsCaller(
        ['x_github_get_pr', 'x_slack_post', 'workflow_notify'],
        prefixes,
        servers,
        'gazelle',
      ),
    ).toBe(true);
  });

  it('fails on a connector with its own credentials', () => {
    expect(
      workflowRunsAsCaller(
        ['x_github_get_pr', 'x_kubernetes_get_pods'],
        prefixes,
        servers,
        'gazelle',
      ),
    ).toBe(false);
  });

  it('fails on muster’s own tools and on a tool no connector offers', () => {
    expect(
      workflowRunsAsCaller(
        ['x_github_get_pr', 'core_service_list'],
        prefixes,
        servers,
        'gazelle',
      ),
    ).toBe(false);
    expect(
      workflowRunsAsCaller(['x_jira_search'], prefixes, servers, 'gazelle'),
    ).toBe(false);
  });

  it('fails for a workflow that calls no tool', () => {
    expect(workflowRunsAsCaller([], prefixes, servers, 'gazelle')).toBe(false);
  });
});
