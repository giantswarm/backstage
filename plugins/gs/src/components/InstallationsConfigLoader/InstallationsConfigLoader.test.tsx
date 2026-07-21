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
import { InstallationsConfigLoader } from './InstallationsConfigLoader';
import {
  __resetInstallationsConfigForTests,
  getInstallationsConfig,
} from '../../apis/installations';

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
  return { apis: apis as any, errorApi };
}

describe('InstallationsConfigLoader', () => {
  beforeEach(() => {
    __resetInstallationsConfigForTests();
  });

  afterEach(() => {
    __resetInstallationsConfigForTests();
  });

  it('publishes an empty set (unblocking awaiters) and reports when getCredentials rejects', async () => {
    const { apis, errorApi } = fakeApis({
      getCredentials: jest.fn().mockRejectedValue(new Error('not signed in')),
    });

    await renderInTestApp(
      <TestApiProvider apis={apis}>
        <InstallationsConfigLoader />
      </TestApiProvider>,
    );

    // A boot-time API awaiting the source must unblock rather than deadlock.
    await expect(getInstallationsConfig()).resolves.toEqual([]);
    expect(errorApi.post).toHaveBeenCalled();
  });

  it('publishes an empty set and reports when getBaseUrl rejects', async () => {
    const { apis, errorApi } = fakeApis({
      getBaseUrl: jest.fn().mockRejectedValue(new Error('discovery failed')),
    });

    await renderInTestApp(
      <TestApiProvider apis={apis}>
        <InstallationsConfigLoader />
      </TestApiProvider>,
    );

    await expect(getInstallationsConfig()).resolves.toEqual([]);
    expect(errorApi.post).toHaveBeenCalled();
  });

  it('publishes the normalized config on a successful fetch', async () => {
    const { apis, errorApi } = fakeApis({
      fetch: jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ golem: { authProvider: 'oidc' } }), {
          status: 200,
        }),
      ),
    });

    await renderInTestApp(
      <TestApiProvider apis={apis}>
        <InstallationsConfigLoader />
      </TestApiProvider>,
    );

    await expect(getInstallationsConfig()).resolves.toEqual([
      { name: 'golem', authProvider: 'oidc' },
    ]);
    expect(errorApi.post).not.toHaveBeenCalled();
  });
});
