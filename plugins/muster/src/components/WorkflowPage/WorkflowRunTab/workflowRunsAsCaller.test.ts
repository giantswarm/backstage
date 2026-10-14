import { MCPServer, MusterWorkflow } from '../../../lib/k8s';
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

const NOTIFY = new MusterWorkflow(
  {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'Workflow',
    metadata: { name: 'notify', namespace: 'muster' },
    spec: { steps: [{ id: 'post', tool: 'x_slack_post' }] },
  } as never,
  'gazelle',
);
const workflows = [NOTIFY];

describe('workflowRunsAsCaller', () => {
  it('holds when every step calls a connector that acts as the caller', () => {
    expect(
      workflowRunsAsCaller(
        ['x_github_get_pr', 'x_slack_post', 'workflow_notify'],
        workflows,
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
        workflows,
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
        workflows,
        prefixes,
        servers,
        'gazelle',
      ),
    ).toBe(false);
    expect(
      workflowRunsAsCaller(
        ['x_jira_search'],
        workflows,
        prefixes,
        servers,
        'gazelle',
      ),
    ).toBe(false);
  });

  it('fails on a nested workflow whose definition it cannot read', () => {
    // toolsOfWorkflow lists `workflow_audit` without expanding it.
    expect(
      workflowRunsAsCaller(
        ['x_github_get_pr', 'workflow_audit'],
        workflows,
        prefixes,
        servers,
        'gazelle',
      ),
    ).toBe(false);
  });

  it('fails for a workflow that calls no tool', () => {
    expect(
      workflowRunsAsCaller([], workflows, prefixes, servers, 'gazelle'),
    ).toBe(false);
  });
});
