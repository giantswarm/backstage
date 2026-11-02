import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { ToolchainManagerError } from '../lib/toolchainManager';
import { ToolchainManagerClient } from './ToolchainManagerClient';

function makeMusterApi(answer: unknown = {}) {
  const callTool = jest.fn(
    async (
      _name: string,
      _args: Record<string, unknown>,
      _installation?: string,
    ): Promise<unknown> => answer,
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

const GO = {
  name: 'go',
  source: 'agent-toolchains',
  repository: 'giantswarm/agent-toolchains',
  version: 'v0.2.0',
  image: 'gsoci.azurecr.io/giantswarm/agent-toolchains/go:0.2.0',
  versions: ['v0.2.0', 'v0.1.0'],
};

describe('ToolchainManagerClient', () => {
  it('lists the toolchains through muster on the installation, as the person', async () => {
    const { api, callTool } = makeMusterApi({
      toolchains: [GO],
      message: '1 toolchains from 1 sources',
    });
    const list = await new ToolchainManagerClient(
      api,
      'gazelle',
    ).listToolchains();

    expect(callTool).toHaveBeenCalledWith(
      'x_toolchain-manager_list_toolchains',
      {},
      'gazelle',
    );
    expect(list.toolchains).toEqual([GO]);
  });

  it('answers grant_required as data, with no toolchains', async () => {
    const { api } = makeMusterApi({
      status: 'grant_required',
      apps: ['toolchain-manager'],
      message: 'grant the App',
    });
    const list = await new ToolchainManagerClient(
      api,
      'gazelle',
    ).listToolchains();
    expect(list.status).toBe('grant_required');
    expect(list.toolchains).toEqual([]);
  });

  it('describes one version, parsing a JSON text the proxy left alone', async () => {
    const { api, callTool } = makeMusterApi(
      JSON.stringify({ toolchain: { ...GO, tools: [], harnesses: [] } }),
    );
    const result = await new ToolchainManagerClient(
      api,
      'gazelle',
    ).describeToolchain({ name: 'go', version: 'v0.1.0' });

    expect(callTool).toHaveBeenCalledWith(
      'x_toolchain-manager_describe_toolchain',
      { name: 'go', version: 'v0.1.0' },
      'gazelle',
    );
    expect(result.toolchain?.name).toBe('go');
  });

  it('passes the writes on as they were given', async () => {
    const { api, callTool } = makeMusterApi({ sources: [] });
    const client = new ToolchainManagerClient(api, 'gazelle');

    await client.addSource({
      repository: 'acme/toolchains',
      registry: 'registry.example.com/acme',
      slackChannel: '#team',
    });
    await client.addPackages({ name: 'helm-tools', packages: ['helm'] });
    await client.createToolchain({
      name: 'helm-tools',
      dockerfile: 'FROM scratch',
      source: 'acme',
    });
    await client.buildStatus({ name: 'helm-tools', source: 'acme', pull: 3 });

    expect(callTool.mock.calls.map(([name, args]) => [name, args])).toEqual([
      [
        'x_toolchain-manager_add_source',
        {
          repository: 'acme/toolchains',
          registry: 'registry.example.com/acme',
          slackChannel: '#team',
        },
      ],
      [
        'x_toolchain-manager_add_packages',
        { name: 'helm-tools', packages: ['helm'] },
      ],
      [
        'x_toolchain-manager_create_toolchain',
        { name: 'helm-tools', dockerfile: 'FROM scratch', source: 'acme' },
      ],
      [
        'x_toolchain-manager_toolchain_build_status',
        { name: 'helm-tools', source: 'acme', pull: 3 },
      ],
    ]);
  });

  it('fails as a ToolchainManagerError, prose included', async () => {
    const { api } = makeMusterApi('not json');
    await expect(
      new ToolchainManagerClient(api, 'gazelle').listSources(),
    ).rejects.toBeInstanceOf(ToolchainManagerError);

    const failing = {
      callTool: jest.fn().mockRejectedValue(new Error('upstream down')),
    } as unknown as MusterApi;
    await expect(
      new ToolchainManagerClient(failing, 'gazelle').listToolchains(),
    ).rejects.toThrow('upstream down');
  });
});
