import { ApiBlueprint, createExtension } from '@backstage/frontend-plugin-api';
import { createExtensionTester } from '@backstage/frontend-test-utils';
import { mockApis } from '@backstage/test-utils';

import { FIXTURE_MCP_SERVERS } from '@giantswarm/backstage-plugin-gs-common';

import { fixtureMcpServersDataRef, MusterApi, MusterApiClient } from './apis';
import { musterPlugin } from './plugin';

const fixtureServers = createExtension({
  kind: 'muster-fixture-servers',
  name: 'test',
  attachTo: FIXTURE_MCP_SERVERS.attachTo,
  output: [fixtureMcpServersDataRef],
  factory: () => [
    fixtureMcpServersDataRef(async () => [
      { server: 'example', tools: { hello: () => 'hi' } },
    ]),
  ],
});

function createMusterApi(fixtures: boolean): MusterApi {
  const { factory } = createExtensionTester(
    musterPlugin.getExtension('api:muster/muster'),
  )
    .add(fixtureServers)
    .get(ApiBlueprint.dataRefs.factory);
  return factory({
    configApi: mockApis.config({ data: { muster: { fixtures } } }),
    discoveryApi: mockApis.discovery(),
    fetchApi: { fetch: jest.fn() },
    authProvidersApi: {},
    kubernetesApi: {},
    kubernetesAuthProvidersApi: {},
    externalUrlConsentApi: {},
  }) as MusterApi;
}

describe('api:muster/muster', () => {
  const nodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
  });

  it('serves the fixtures with muster.fixtures outside production', async () => {
    const api = createMusterApi(true);

    expect(api).not.toBeInstanceOf(MusterApiClient);
    await expect(api.callTool('x_example_hello', {})).resolves.toBe('hi');
  });

  it('ignores muster.fixtures in production', () => {
    process.env.NODE_ENV = 'production';

    expect(createMusterApi(true)).toBeInstanceOf(MusterApiClient);
  });

  it('calls the backend without muster.fixtures', () => {
    expect(createMusterApi(false)).toBeInstanceOf(MusterApiClient);
  });
});
