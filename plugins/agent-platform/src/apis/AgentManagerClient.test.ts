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
      },
      'inst-1',
    );
    expect(result.sessionId).toBe('sess-1');
  });

  it('sends no workspaceGrant when there is none: the plain session', async () => {
    const { api, callTool } = makeMusterApi(async () => ({
      session: { id: 'sess-1' },
    }));
    await new AgentManagerClient(api, 'inst-1').startSession({
      ...REQUEST,
      sessionName: '',
    });
    const args = callTool.mock.calls[0][1];
    expect(args).not.toHaveProperty('workspaceGrant');
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
