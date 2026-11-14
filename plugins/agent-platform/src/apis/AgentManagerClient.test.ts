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
      parent: 'org-acme',
      harnesses: ['kagent'],
      workerReplicas: 1,
      erases: { namespace: 'agents-payments-x7k2q', kept: 'tombstones' },
    }));

    const details = await new AgentManagerClient(api, 'inst-1').getOrganization(
      'org-acme',
      'payments',
    );

    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_get_organization',
      { namespace: 'org-acme', name: 'payments' },
      'inst-1',
    );
    expect(details.organization).toEqual({
      name: 'payments',
      parent: 'org-acme',
      harnesses: ['kagent'],
      workerReplicas: 1,
    });
    expect(details.erases).toEqual({
      namespace: 'agents-payments-x7k2q',
      kept: 'tombstones',
    });
  });
});

describe('AgentManagerClient.deleteOrganization', () => {
  it('sends the typed name only when given, and mode commit only when asked', async () => {
    const { api, callTool } = makeMusterApi(async () => ({ deleted: false }));
    const client = new AgentManagerClient(api, 'inst-1');

    await client.deleteOrganization({
      parent: 'org-acme',
      name: 'payments',
      mode: 'commit',
    });
    await client.deleteOrganization({
      parent: 'org-acme',
      name: 'payments',
      confirm: 'org-acme/payments',
    });

    expect(callTool.mock.calls.map(([, args]) => args)).toEqual([
      { namespace: 'org-acme', name: 'payments', mode: 'commit' },
      { namespace: 'org-acme', name: 'payments', confirm: 'org-acme/payments' },
    ]);
  });
});
