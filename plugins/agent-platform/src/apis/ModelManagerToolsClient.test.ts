import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { ModelManagerNotConnectedError } from '../lib/modelManagerBackends';
import { ModelManagerToolsClient } from './ModelManagerToolsClient';

function makeMusterApi(answer: unknown = {}) {
  const callTool = jest.fn(
    async (_name: string, _args: Record<string, unknown>) => answer,
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

describe('ModelManagerToolsClient', () => {
  it('dry-runs add_backend as the person on the installation and answers the document', async () => {
    const { api, callTool } = makeMusterApi({
      dryRun: true,
      document: 'apiVersion: agent-platform.giantswarm.io/v1alpha1\n',
      configMap: { namespace: 'agent-platform', name: 'model-backend-ollama' },
    });
    const client = new ModelManagerToolsClient(api, 'inst-1');
    const result = await client.addBackend(
      { kind: 'ollama', endpoint: 'http://ollama.lab:11434' },
      { dryRun: true },
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_model-manager_add_backend',
      { kind: 'ollama', endpoint: 'http://ollama.lab:11434', dryRun: true },
      'inst-1',
    );
    expect(result.document).toMatch(/^apiVersion/);
    expect(result.configMap.name).toBe('model-backend-ollama');
  });

  it('deploys with mode apply and commits with mode commit', async () => {
    const { api, callTool } = makeMusterApi();
    const client = new ModelManagerToolsClient(api, 'inst-1');
    await client.addBackend(
      { kind: 'ollama', endpoint: 'http://x' },
      { mode: 'apply' },
    );
    await client.addBackend(
      { kind: 'ollama', endpoint: 'http://x' },
      { mode: 'commit' },
    );
    expect(
      callTool.mock.calls.map(
        call => (call[1] as Record<string, unknown>).mode,
      ),
    ).toEqual(['apply', 'commit']);
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('dryRun');
  });

  it('calls remove_backend with the kind, dry or real', async () => {
    const { api, callTool } = makeMusterApi({
      modelConfigs: ['kagent/llama3'],
    });
    const client = new ModelManagerToolsClient(api, 'inst-1');
    const plan = await client.removeBackend('ollama', { dryRun: true });
    await client.removeBackend('ollama', { mode: 'apply' });
    expect(callTool.mock.calls[0]).toEqual([
      'x_model-manager_remove_backend',
      { kind: 'ollama', dryRun: true },
      'inst-1',
    ]);
    expect(callTool.mock.calls[1][1]).toEqual({
      kind: 'ollama',
      mode: 'apply',
    });
    expect(plan.modelConfigs).toEqual(['kagent/llama3']);
  });

  it('parses a text answer and classifies a not-connected muster', async () => {
    const text = new ModelManagerToolsClient(
      { callTool: async () => '{"dryRun":true}' } as unknown as MusterApi,
      'inst-1',
    );
    await expect(
      text.removeBackend('kserve', { dryRun: true }),
    ).resolves.toEqual({ dryRun: true });
    const gone = new ModelManagerToolsClient(
      {
        callTool: async () => {
          throw new Error('tool not found: x_model-manager_remove_backend');
        },
      } as unknown as MusterApi,
      'inst-1',
    );
    await expect(gone.removeBackend('kserve')).rejects.toBeInstanceOf(
      ModelManagerNotConnectedError,
    );
  });
});
