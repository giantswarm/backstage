import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { createExtensionTester } from '@backstage/frontend-test-utils';
import { mockApis } from '@backstage/test-utils';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import { fixtureMcpServersDataRef } from '@giantswarm/backstage-plugin-muster';

import {
  AgentManagerCredentialsClient,
  KagentApiClient,
  ModelManagerApiClient,
  type KagentApi,
  type ModelManagerApi,
} from './apis';
import { agentPlatformPlugin } from './plugin';

type FixtureApiId =
  | 'api:agent-platform/kagent'
  | 'api:agent-platform/model-manager'
  | 'api:agent-platform/agent-manager-credentials';

function createApi(id: FixtureApiId, fixtures: boolean): unknown {
  const { factory } = createExtensionTester(
    agentPlatformPlugin.getExtension(id),
  ).get(ApiBlueprint.dataRefs.factory);
  return factory({
    configApi: mockApis.config({ data: { agentPlatform: { fixtures } } }),
    musterApi: {},
    discoveryApi: mockApis.discovery(),
    fetchApi: { fetch: jest.fn() },
    kubernetesApi: {},
    kubernetesAuthProvidersApi: {},
  });
}

describe('agent-platform fixture mode', () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it.each([
    ['api:agent-platform/kagent', KagentApiClient],
    ['api:agent-platform/model-manager', ModelManagerApiClient],
    [
      'api:agent-platform/agent-manager-credentials',
      AgentManagerCredentialsClient,
    ],
  ] as const)(
    '%s serves fixtures only with agentPlatform.fixtures outside production',
    (id, Client) => {
      expect(createApi(id, true)).not.toBeInstanceOf(Client);
      expect(createApi(id, false)).toBeInstanceOf(Client);
      process.env.NODE_ENV = 'production';
      expect(createApi(id, true)).toBeInstanceOf(Client);
    },
  );

  it('answers with the fixture installations and an empty list', async () => {
    const kagent = createApi('api:agent-platform/kagent', true) as KagentApi;
    const models = createApi(
      'api:agent-platform/model-manager',
      true,
    ) as ModelManagerApi;

    await expect(kagent.listInstallations()).resolves.toEqual([
      { name: 'meadow', reachable: true },
      { name: 'fennel', reachable: true },
      { name: 'tarragon', reachable: false, reason: 'timeout' },
    ]);
    await expect(kagent.listSessions('meadow')).resolves.toEqual([]);
    await expect(kagent.listSessions('tarragon')).resolves.toEqual([]);
    await expect(models.listBackends('meadow')).resolves.toEqual([]);
  });

  it('fails a call for an installation it does not serve, loudly', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const kagent = createApi('api:agent-platform/kagent', true) as KagentApi;

    await expect(kagent.listSessions('elsewhere')).rejects.toThrow(
      'Fixture mode serves no installation elsewhere',
    );
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("contributes the MCP servers its pages call to muster's fixtures", async () => {
    const load = createExtensionTester(
      agentPlatformPlugin.getExtension('muster-fixture-servers:agent-platform'),
    ).get(fixtureMcpServersDataRef);

    const servers = await load();

    expect(servers.map(server => server.server)).toEqual(
      expect.arrayContaining(['agent-manager', 'workspace-manager']),
    );
    process.env.NODE_ENV = 'production';
    await expect(load()).resolves.toEqual([]);
  });
});
