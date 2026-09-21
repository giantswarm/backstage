import {
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  __resetSignedInConfigForTests,
  getSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';
import { SignedInConfigLoader } from './SignedInConfigLoader';
import { getInstallationsConfig } from '../../apis/installations';

function fakeApis({
  getCredentials = jest.fn().mockResolvedValue({ token: 'id-token' }),
  getBaseUrl = jest.fn().mockResolvedValue('http://backend/api/gs'),
  fetch = jest.fn(),
}: {
  getCredentials?: jest.Mock;
  getBaseUrl?: jest.Mock;
  fetch?: jest.Mock;
}) {
  const errorApi = { post: jest.fn(), error$: jest.fn() };
  const apis = [
    [identityApiRef, { getCredentials }],
    [discoveryApiRef, { getBaseUrl }],
    [fetchApiRef, { fetch }],
    [errorApiRef, errorApi],
  ] as const;
  return { apis: apis as any, errorApi, fetch };
}

describe('SignedInConfigLoader', () => {
  beforeEach(() => {
    __resetSignedInConfigForTests();
  });

  afterEach(() => {
    __resetSignedInConfigForTests();
  });

  it('publishes an empty config (unblocking awaiters) and reports when getCredentials rejects', async () => {
    const { apis, errorApi } = fakeApis({
      getCredentials: jest.fn().mockRejectedValue(new Error('not signed in')),
    });

    await renderInTestApp(
      <TestApiProvider apis={apis}>
        <SignedInConfigLoader />
      </TestApiProvider>,
    );

    // A boot-time API awaiting the source must unblock rather than deadlock.
    await expect(getInstallationsConfig()).resolves.toEqual([]);
    expect(errorApi.post).toHaveBeenCalled();
  });

  it('publishes an empty config and reports when getBaseUrl rejects', async () => {
    const { apis, errorApi } = fakeApis({
      getBaseUrl: jest.fn().mockRejectedValue(new Error('discovery failed')),
    });

    await renderInTestApp(
      <TestApiProvider apis={apis}>
        <SignedInConfigLoader />
      </TestApiProvider>,
    );

    await expect(getInstallationsConfig()).resolves.toEqual([]);
    expect(errorApi.post).toHaveBeenCalled();
  });

  it('publishes the fetched config from GET /api/gs/config', async () => {
    const { apis, errorApi, fetch } = fakeApis({
      fetch: jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            gs: {
              installations: { golem: { authProvider: 'oidc' } },
              adminGroups: ['admins'],
            },
          }),
          { status: 200 },
        ),
      ),
    });

    await renderInTestApp(
      <TestApiProvider apis={apis}>
        <SignedInConfigLoader />
      </TestApiProvider>,
    );

    const config = await getSignedInConfig();
    expect(fetch).toHaveBeenCalledWith('http://backend/api/gs/config');
    expect(config.getStringArray('gs.adminGroups')).toEqual(['admins']);
    await expect(getInstallationsConfig()).resolves.toEqual([
      { name: 'golem', authProvider: 'oidc' },
    ]);
    expect(errorApi.post).not.toHaveBeenCalled();
  });
});
