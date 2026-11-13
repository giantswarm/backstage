import { FixtureToolMissingError, MusterFixtureApi } from './MusterFixtureApi';

describe('MusterFixtureApi', () => {
  const getInfo = jest.fn(() => ({ version: '1' }));
  const api = new MusterFixtureApi([
    { server: 'agent-manager', tools: { get_info: getInfo } },
  ]);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves one reachable installation the person is signed in to', async () => {
    const { installations } = await api.listInstallations();

    expect(installations).toEqual([
      expect.objectContaining({ name: 'meadow', reachable: true }),
    ]);
    await expect(
      api.filterTools({ installation: 'meadow', limit: 1 }),
    ).resolves.toEqual(expect.objectContaining({ tools: expect.any(Array) }));
    await expect(api.signIn()).resolves.toBe(true);
  });

  it('dispatches a tool call to its server’s handler', async () => {
    await expect(
      api.callTool('x_agent-manager_get_info', { a: 1 }, 'meadow'),
    ).resolves.toEqual({ version: '1' });
    expect(getInfo).toHaveBeenCalledWith(
      { a: 1 },
      { installation: 'meadow', signal: undefined },
    );
  });

  it('fails a tool no server handles, loudly', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      api.callTool('x_agent-manager_list_agents', {}, 'meadow'),
    ).rejects.toBeInstanceOf(FixtureToolMissingError);
    await expect(
      api.callToolWithProgress('x_unknown_tool', {}, { onProgress: jest.fn() }),
    ).rejects.toThrow(
      'Fixture mode has no handler for the tool x_unknown_tool',
    );
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('lists the contributed servers as connected, with their tools', async () => {
    await expect(api.listServers()).resolves.toEqual({
      mcpServers: [
        expect.objectContaining({ name: 'agent-manager', toolsCount: 1 }),
      ],
    });
    await expect(api.getAuthStatus()).resolves.toEqual({
      servers: [{ name: 'agent-manager', status: 'connected' }],
    });
    await expect(
      api.filterTools({ pattern: 'x_agent-manager_*' }),
    ).resolves.toEqual(
      expect.objectContaining({
        tools: [{ name: 'x_agent-manager_get_info', server: 'agent-manager' }],
      }),
    );
    await expect(api.filterTools({ pattern: 'x_other_*' })).resolves.toEqual(
      expect.objectContaining({ tools: [], filtered_count: 0 }),
    );
  });

  it('fails a call for an installation it does not serve, loudly', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      api.callTool('x_agent-manager_get_info', {}, 'elsewhere'),
    ).rejects.toThrow('Fixture mode serves no installation elsewhere');
    await expect(api.listServers('elsewhere')).rejects.toThrow(
      'Fixture mode serves no installation elsewhere',
    );
    expect(getInfo).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ installation: 'elsewhere' }),
    );
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
