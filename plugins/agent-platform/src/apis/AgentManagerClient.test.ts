/* eslint-disable @backstage/no-mixed-plugin-imports -- The client composes the installation's Muster API. */
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { AgentManagerError } from '../lib/agentManager';
import { AgentManagerClient } from './AgentManagerClient';

function makeMusterApi(answer: () => Promise<unknown>) {
  const callTool = jest.fn(
    async (_name: string, _args: Record<string, unknown>, _inst?: string) =>
      answer(),
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

const REQUEST = {
  namespace: 'kagent',
  name: 'helper',
  message: 'Summarise the open incidents',
  requestId: 'req-1',
  sessionName: 'Summarise the open incidents',
};

describe('AgentManagerClient model endpoints', () => {
  it.each([
    'https://user:synthetic-value@models.example/v1',
    'https://models.example/v1?api_key=synthetic-value',
    'https://models.example/v1?%61pi_key=synthetic-value',
    'https://models.example/v1?api_key_synthetic-value',
    'https://models.example/v1?safe=value;api_key=synthetic-value',
    'https://models.example/v1#synthetic-value',
  ])(
    'rejects a credential-bearing endpoint before MCP transmission: %s',
    async endpoint => {
      const { api, callTool } = makeMusterApi(async () => ({ name: 'model' }));
      Object.assign(api, {
        describeTool: jest.fn(async () => ({
          inputSchema: {
            properties: Object.fromEntries(
              [
                'projectID',
                'location',
                'endpoint',
                'displayName',
                'noCredential',
              ].map(field => [field, {}]),
            ),
          },
        })),
      });
      const client = new AgentManagerClient(api, 'inst-1');
      const operation = client.setOrganizationModel({
        namespace: 'kagent',
        name: 'model',
        provider: 'OpenAI',
        model: 'test-model',
        requestId: 'model-endpoint-validation',
        endpoint,
      });
      await expect(operation).rejects.toThrow(/credential/i);
      await expect(operation).rejects.not.toThrow('synthetic-value');
      expect(callTool).not.toHaveBeenCalled();
    },
  );
});

describe('AgentManagerClient.startSession', () => {
  it('calls start_session through muster on the installation, as the person', async () => {
    const { api, callTool } = makeMusterApi(async () => ({
      session: { id: 'sess-1', contextId: 'sess-1' },
      turn: { task: { status: { state: 'TASK_STATE_SUBMITTED' } } },
    }));
    const client = new AgentManagerClient(api, 'inst-1');

    const result = await client.startSession(REQUEST);

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_start_session',
      {
        namespace: 'kagent',
        name: 'helper',
        message: 'Summarise the open incidents',
        requestId: 'req-1',
        sessionName: 'Summarise the open incidents',
        noWorkspace: true,
      },
      'inst-1',
    );
    expect(result.sessionId).toBe('sess-1');
  });

  it('creates only, without a message, when none is given', async () => {
    const { api, callTool } = makeMusterApi(async () => ({
      session: { id: 'sess-1' },
    }));
    await new AgentManagerClient(api, 'inst-1').startSession({
      ...REQUEST,
      message: undefined,
    });
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('message');
  });

  it('says noWorkspace when there is no grant: the plain session, never the agent default', async () => {
    const { api, callTool } = makeMusterApi(async () => ({
      session: { id: 'sess-1' },
    }));
    await new AgentManagerClient(api, 'inst-1').startSession({
      ...REQUEST,
      sessionName: '',
    });
    const args = callTool.mock.calls[0][1];
    expect(args).not.toHaveProperty('workspaceGrant');
    expect(args).toHaveProperty('noWorkspace', true);
    expect(args).not.toHaveProperty('sessionName');
  });

  it('passes a workspace grant through', async () => {
    const { api, callTool } = makeMusterApi(async () => ({
      session: { id: 'sess-1' },
      workspace: 'team-a',
    }));
    const result = await new AgentManagerClient(api, 'inst-1').startSession({
      ...REQUEST,
      workspaceGrant: 'grant-token',
    });
    expect(callTool.mock.calls[0][1]).toMatchObject({
      workspaceGrant: 'grant-token',
    });
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('noWorkspace');
    expect(result.workspace).toBe('team-a');
  });

  it('classifies a refusal as the other tools do', async () => {
    const { api } = makeMusterApi(async () => {
      throw new Error('conflict: agent kagent/helper has no ready revision');
    });
    const error = await new AgentManagerClient(api, 'inst-1')
      .startSession(REQUEST)
      .catch(e => e);
    expect(error).toBeInstanceOf(AgentManagerError);
    expect(error.code).toBe('conflict');
  });

  it('fails on an answer without a session id rather than navigating nowhere', async () => {
    const { api } = makeMusterApi(async () => ({ session: {} }));
    await expect(
      new AgentManagerClient(api, 'inst-1').startSession(REQUEST),
    ).rejects.toThrow(/without a session id/);
  });
});

describe('AgentManagerClient.getOrganization', () => {
  it('separates the organization from erases, which agent-manager answers side by side', async () => {
    const { api, callTool } = makeMusterApi(async () => ({
      name: 'payments',
      harnesses: ['kagent'],
      workerReplicas: 1,
      erases: { namespace: 'agents-payments', kept: 'tombstones' },
    }));

    const details = await new AgentManagerClient(api, 'inst-1').getOrganization(
      'payments',
    );

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_get_organization',
      { name: 'payments' },
      'inst-1',
    );
    expect(details.organization).toEqual({
      name: 'payments',
      harnesses: ['kagent'],
      workerReplicas: 1,
    });
    expect(details.erases).toMatchObject({
      namespace: 'agents-payments',
      kept: 'tombstones',
    });
  });
});

describe('AgentManagerClient.deleteOrganization', () => {
  it('sends the typed name only when given, and mode commit only when asked', async () => {
    const { api, callTool } = makeMusterApi(async () => ({ deleted: false }));
    const client = new AgentManagerClient(api, 'inst-1');

    await client.deleteOrganization({
      name: 'payments',
      mode: 'commit',
    });
    await client.deleteOrganization({
      name: 'payments',
      confirm: 'payments',
    });

    expect(callTool.mock.calls.map(([, args]) => args)).toEqual([
      { name: 'payments', mode: 'commit' },
      { name: 'payments', confirm: 'payments' },
    ]);
  });
});

describe('AgentManagerClient.createOrganization', () => {
  it('sends the admins and the display name only when there are some', async () => {
    const { api, callTool } = makeMusterApi(async () => ({ created: true }));
    const client = new AgentManagerClient(api, 'inst-1');

    await client.createOrganization({
      name: 'payments',
      displayName: 'Payments',
      adminGroups: ['payments-admins'],
      adminUsers: ['jane@example.com'],
    });
    await client.createOrganization({
      name: 'billing',
      displayName: '',
      adminGroups: [],
      adminUsers: [],
    });

    expect(callTool.mock.calls.map(([name, args]) => [name, args])).toEqual([
      [
        'x_agent-manager_create_organization',
        {
          name: 'payments',
          displayName: 'Payments',
          adminGroups: ['payments-admins'],
          adminUsers: ['jane@example.com'],
        },
      ],
      ['x_agent-manager_create_organization', { name: 'billing' }],
    ]);
  });
});

describe('AgentManagerClient.updateOrganizationAdmins', () => {
  it('sends an empty kind, which removes it, and leaves out a kind not given', async () => {
    const { api, callTool } = makeMusterApi(async () => ({}));
    const client = new AgentManagerClient(api, 'inst-1');

    await client.updateOrganizationAdmins({
      name: 'payments',
      adminGroups: [],
      adminUsers: ['jane@example.com'],
    });
    await client.updateOrganizationAdmins({
      name: 'payments',
      adminGroups: ['payments-admins'],
      mode: 'commit',
    });

    expect(callTool.mock.calls.map(([name, args]) => [name, args])).toEqual([
      [
        'x_agent-manager_update_organization',
        { name: 'payments', adminGroups: [], adminUsers: ['jane@example.com'] },
      ],
      [
        'x_agent-manager_update_organization',
        { name: 'payments', adminGroups: ['payments-admins'], mode: 'commit' },
      ],
    ]);
  });
});

const SPEC = {
  namespace: 'agents-payments',
  name: 'helper',
  displayName: 'Helper',
  modelConfig: 'default',
  toolset: ['preset:read-only'],
};
const UPDATE = { namespace: 'agents-payments', name: 'helper', tags: [] };

describe('AgentManagerClient addresses an organization by its name', () => {
  /** agent-manager with one organization, payments, in agents-payments. */
  function withPayments(platformNamespace?: string) {
    const callTool = jest.fn(
      async (name: string, _args: Record<string, unknown>, _inst?: string) => {
        switch (name) {
          case 'x_agent-manager_get_info':
            return {
              capabilities: { organizations: true },
              ...(platformNamespace && {
                namespaces: { default: platformNamespace, managed: [] },
              }),
            };
          case 'x_agent-manager_list_organizations':
            return {
              organizations: [
                {
                  name: 'payments',
                  namespace: 'agents-payments',
                  permissions: { manage: true, member: true },
                },
              ],
            };
          case 'x_agent-manager_start_session':
            return { session: { id: 'sess-1' } };
          default:
            return {};
        }
      },
    );
    const client = new AgentManagerClient(
      { callTool } as unknown as MusterApi,
      'inst-1',
    );
    const argsOf = (tool: string) =>
      callTool.mock.calls
        .filter(([name]) => name === `x_agent-manager_${tool}`)
        .map(([, args]) => args);
    return { client, argsOf };
  }

  it.each([
    [
      'an organization namespace',
      'agents-payments',
      { organization: 'payments' },
    ],
    ['the platform namespace', 'kagent', { namespace: 'kagent' }],
    ['a namespace of no organization', 'team-x', { namespace: 'team-x' }],
  ])('an agent tool in %s', async (_case, namespace, place) => {
    const { client, argsOf } = withPayments();
    await client.getAgent(namespace, 'helper');
    await client.startSession({ ...REQUEST, namespace });
    expect(argsOf('get_agent')).toEqual([{ ...place, name: 'helper' }]);
    expect(argsOf('start_session')[0]).toMatchObject(place);
    expect(argsOf('start_session')[0]).not.toHaveProperty(
      'organization' in place ? 'namespace' : 'organization',
    );
  });

  it.each<[string, string, (client: AgentManagerClient) => Promise<unknown>]>([
    ['create_agent', 'create_agent', client => client.createAgent(SPEC)],
    [
      'create_agent in mode commit',
      'create_agent',
      client => client.commitAgent(SPEC),
    ],
    ['validate_agent', 'validate_agent', client => client.validateAgent(SPEC)],
    [
      'validate_agent of an update',
      'validate_agent',
      client => client.validateUpdate(UPDATE, 'commit'),
    ],
    ['update_agent', 'update_agent', client => client.updateAgent(UPDATE)],
    [
      'update_agent in mode commit',
      'update_agent',
      client => client.commitUpdateAgent(UPDATE),
    ],
    [
      'the dry run of update_agent in mode commit',
      'update_agent',
      client => client.dryRunCommitUpdateAgent(UPDATE),
    ],
    [
      'delete_agent',
      'delete_agent',
      client => client.deleteAgent('agents-payments', 'helper'),
    ],
    [
      'delete_agent in mode commit',
      'delete_agent',
      client => client.commitDeleteAgent('agents-payments', 'helper'),
    ],
    [
      'get_agent_status',
      'get_agent_status',
      client => client.getAgentStatus('agents-payments', 'helper'),
    ],
    [
      'list_model_configs',
      'list_model_configs',
      client => client.listModelConfigs('agents-payments'),
    ],
    [
      'list_egress_policies',
      'list_egress_policies',
      client => client.listEgressPolicies('agents-payments'),
    ],
  ])(
    '%s names the organization, never its namespace',
    async (_case, tool, call) => {
      const { client, argsOf } = withPayments();
      await call(client);
      const [args] = argsOf(tool);
      expect(args).toMatchObject({ organization: 'payments' });
      expect(args).not.toHaveProperty('namespace');
    },
  );

  it('fails an agent tool with the reason the organizations could not be read', async () => {
    const callTool = jest.fn(async (name: string) => {
      if (name === 'x_agent-manager_get_info') {
        throw new Error('backend_error: the API server did not answer in time');
      }
      return {};
    });
    const client = new AgentManagerClient(
      { callTool } as unknown as MusterApi,
      'inst-1',
    );
    await expect(client.getAgent('agents-payments', 'helper')).rejects.toThrow(
      'the API server did not answer in time',
    );
    expect(callTool).not.toHaveBeenCalledWith(
      'x_agent-manager_get_agent',
      expect.anything(),
      expect.anything(),
    );
  });

  it('a model tool names the organization, or none for the installation, and refuses any other namespace', async () => {
    const { client, argsOf } = withPayments();
    await client.deleteModel('agents-payments', 'claude', { dryRun: true });
    await client.deleteModel('kagent', 'claude', { dryRun: true });
    await expect(client.deleteModel('team-x', 'claude')).rejects.toThrow(
      /team-x is neither/,
    );
    expect(argsOf('delete_organization_object')).toEqual([
      { organization: 'payments', name: 'claude', kind: 'model', dryRun: true },
      { name: 'claude', kind: 'model', dryRun: true },
    ]);
  });

  it("takes the installation's models in the platform namespace get_info names, and refuses kagent there", async () => {
    const { client, argsOf } = withPayments('platform-ai');
    await client.deleteModel('platform-ai', 'sonnet', { dryRun: true });
    // Without an organization agent-manager would delete platform-ai/sonnet.
    await expect(
      client.deleteModel('kagent', 'sonnet', { dryRun: true }),
    ).rejects.toThrow(/kagent is neither/);
    expect(argsOf('delete_organization_object')).toEqual([
      { name: 'sonnet', kind: 'model', dryRun: true },
    ]);
  });

  it('the member and connector tools take the organization only', async () => {
    const { client, argsOf } = withPayments();
    await client.listOrganizationMembers('payments');
    await client.addOrganizationMember({
      organization: 'payments',
      group: 'reviewers',
      role: 'user',
    });
    await client.listOrganizationConnectors('payments');
    expect(argsOf('list_organization_members')).toEqual([
      { organization: 'payments' },
    ]);
    expect(argsOf('add_organization_member')).toEqual([
      { organization: 'payments', group: 'reviewers', role: 'user' },
    ]);
    expect(argsOf('list_organization_connectors')).toEqual([
      { organization: 'payments' },
    ]);
  });
});
