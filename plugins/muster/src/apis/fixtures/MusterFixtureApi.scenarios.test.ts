import { setFixtureScenarioForTests } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { isMusterTokenMintError } from '../installationToken';
import {
  musterSignInRequiredOf,
  musterUnauthorizedInfoOf,
} from '../musterUnauthorized';
import { musterFixtureApi } from './MusterFixtureApi';

describe('musterFixtureApi in the fixture scenarios', () => {
  const servers = [
    { server: 'agent-manager', tools: { get_info: async () => ({}) } },
  ];

  afterEach(() => {
    setFixtureScenarioForTests(undefined);
  });

  it('fails every call in error, in muster’s own words', async () => {
    setFixtureScenarioForTests('error');
    const api = musterFixtureApi(servers);

    // muster-backend's own list answers, so the pages go on to the musters.
    await expect(api.listInstallations()).resolves.toEqual({
      installations: expect.arrayContaining([
        expect.objectContaining({ name: 'meadow' }),
      ]),
    });

    // meadow: muster's 401, a sign-in to the tool's server for a tool call.
    const toolCall = await api
      .callTool('x_agent-manager_get_info', {}, 'meadow')
      .catch(e => e);
    expect(musterSignInRequiredOf(toolCall)).toEqual({
      server: 'agent-manager',
      installation: 'meadow',
    });
    const read = await api.listServers('meadow').catch(e => e);
    expect(musterUnauthorizedInfoOf(read)).toEqual(
      expect.objectContaining({ reason: 'token_rejected' }),
    );
    await expect(api.getAuthStatus('meadow')).rejects.toMatchObject({
      status: 401,
    });

    // fennel: the person is signed out.
    const signedOut = await api
      .filterTools({ installation: 'fennel' })
      .catch(e => e);
    expect(isMusterTokenMintError(signedOut)).toBe(true);
    expect(signedOut.reason).toBe('session-expired');
    await expect(api.listConnectorNames('fennel')).rejects.toBeTruthy();

    // tarragon: not reachable, its background reads included.
    await expect(api.getServerInfo('tarragon')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('never answers in loading', async () => {
    setFixtureScenarioForTests('loading');
    const api = musterFixtureApi(servers);
    const settled = jest.fn();
    api.listInstallations().then(settled, settled);
    api.listServers('meadow').then(settled, settled);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(settled).not.toHaveBeenCalled();
  });

  it('serves the scenario’s data set', async () => {
    setFixtureScenarioForTests('empty');
    const empty = await musterFixtureApi(servers).listServers('meadow');
    // Only the contributed servers: the data set has no connectors.
    expect((empty.mcpServers ?? []).map(s => s.name)).toEqual([
      'agent-manager',
    ]);

    setFixtureScenarioForTests('many');
    const many = await musterFixtureApi(servers).listServers('meadow');
    expect(many.mcpServers?.length).toBeGreaterThan(100);
  });
});
