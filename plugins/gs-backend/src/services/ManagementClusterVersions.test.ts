import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { ManagementClusterVersionsService } from './ManagementClusterVersions';

const CAPI = 'cluster.x-k8s.io';

type Cluster = {
  /** `/version` of the API server; a number is an HTTP error status, 'hang' runs into the timeout. */
  version: string | number | 'hang';
  /** The release label of the management cluster's own Cluster. */
  release?: string;
  /** The installation serves no CAPI. */
  noCapi?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The auth plugin's cluster-token route and the Kubernetes proxy for a fleet. */
function backend(fleet: Record<string, Cluster>, mintStatus = 200) {
  return jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string>;
    const mint = url.match(/^http:\/\/auth\/cluster-token\/(.+)$/);
    if (mint) {
      return mintStatus === 200
        ? json({ token: `token-${mint[1]}`, expiresInSeconds: 600 })
        : json({ error: { message: 'no' } }, mintStatus);
    }
    const name = headers['Backstage-Kubernetes-Cluster'];
    const cluster = fleet[name];
    const path = url.replace('http://kubernetes/proxy', '');
    if (path === '/version') {
      if (cluster.version === 'hang') {
        // What fetch rejects with once `AbortSignal.timeout` fires.
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }
      return typeof cluster.version === 'number'
        ? json({}, cluster.version)
        : json({ gitVersion: cluster.version });
    }
    if (path === `/apis/${CAPI}`) {
      return cluster.noCapi
        ? json({}, 404)
        : json({ preferredVersion: { groupVersion: `${CAPI}/v1beta2` } });
    }
    if (
      path ===
      `/apis/${CAPI}/v1beta2/namespaces/org-giantswarm/clusters/${name}`
    ) {
      return json({
        metadata: {
          name,
          labels: cluster.release
            ? { 'release.giantswarm.io/version': cluster.release }
            : {},
        },
      });
    }
    return json({}, 404);
  });
}

function service(installations: string[]) {
  const config = mockServices.rootConfig({
    data: {
      gs: {
        authProvider: 'oidc-main',
        installations: Object.fromEntries(
          installations.map(name => [
            name,
            { authProvider: 'oidc', oidcTokenProvider: `oidc-${name}` },
          ]),
        ),
      },
    },
  });
  return new ManagementClusterVersionsService({
    config,
    auth: mockServices.auth(),
    discovery: {
      getBaseUrl: async (pluginId: string) => `http://${pluginId}`,
      getExternalBaseUrl: async (pluginId: string) => `http://${pluginId}`,
    },
  });
}

const user = mockCredentials.user('user:default/someone');

describe('ManagementClusterVersionsService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reads every installation’s Kubernetes version and release as the person', async () => {
    const fetch = backend({
      main: { version: 'v1.35.8', release: '35.1.1' },
      other: { version: 'v1.34.7', release: '34.4.0' },
    });
    global.fetch = fetch as typeof global.fetch;

    const versions = await service(['main', 'other']).read(user, 'subject');

    expect(versions).toEqual({
      main: {
        kubernetes: { state: 'known', version: 'v1.35.8' },
        release: { state: 'known', version: '35.1.1' },
      },
      other: {
        kubernetes: { state: 'known', version: 'v1.34.7' },
        release: { state: 'known', version: '34.4.0' },
      },
    });

    // The main installation is read with the main session itself, every
    // other one with the token exchanged for it.
    const versionCall = (name: string) =>
      fetch.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/proxy/version') &&
          (init?.headers as Record<string, string>)[
            'Backstage-Kubernetes-Cluster'
          ] === name,
      )![1]!.headers as Record<string, string>;
    expect(
      versionCall('main')['Backstage-Kubernetes-Authorization-oidc-oidc-main'],
    ).toBe('subject');
    expect(
      versionCall('other')[
        'Backstage-Kubernetes-Authorization-oidc-oidc-other'
      ],
    ).toBe('token-other');
    const mints = fetch.mock.calls.filter(([url]) =>
      String(url).includes('/cluster-token/'),
    );
    expect(mints.map(([url]) => String(url))).toEqual([
      'http://auth/cluster-token/other',
    ]);
    expect(
      (mints[0][1]!.headers as Record<string, string>)['gs-subject-token'],
    ).toBe('subject');
  });

  it('reads no CAPI, no Cluster and no label as no release', async () => {
    global.fetch = backend({
      plain: { version: 'v1.34.0', noCapi: true },
      bare: { version: 'v1.33.2' },
    }) as typeof global.fetch;

    const versions = await service(['plain', 'bare']).read(user, 'subject');

    const noRelease = {
      state: 'absent',
      reason: 'The management cluster carries no Giant Swarm release',
    };
    expect(versions.plain.release).toEqual(noRelease);
    expect(versions.bare.release).toEqual(noRelease);
    expect(versions.bare.kubernetes).toEqual({
      state: 'known',
      version: 'v1.33.2',
    });
  });

  it('says once, in both cells, why an installation could not be read', async () => {
    global.fetch = backend({
      locked: { version: 403 },
      main: { version: 'hang' },
    }) as typeof global.fetch;

    const versions = await service(['locked', 'main']).read(user, 'subject');

    const forbidden = { state: 'failed', reason: 'Access forbidden' };
    expect(versions.locked).toEqual({
      kubernetes: forbidden,
      release: forbidden,
    });
    const timeout = { state: 'failed', reason: 'API unreachable (timeout)' };
    expect(versions.main).toEqual({ kubernetes: timeout, release: timeout });
  });

  it('says the person is not signed in when the token exchange refuses them', async () => {
    global.fetch = backend(
      { other: { version: 'v1.35.8' } },
      401,
    ) as typeof global.fetch;

    const versions = await service(['other']).read(user, 'subject');

    const notSignedIn = {
      state: 'failed',
      reason: 'Not signed in to the installation',
    };
    expect(versions.other).toEqual({
      kubernetes: notSignedIn,
      release: notSignedIn,
    });
  });

  it('serves a person’s answer again without asking the installation, but not another person’s', async () => {
    const fetch = backend({ main: { version: 'v1.35.8', release: '35.1.1' } });
    global.fetch = fetch as typeof global.fetch;
    const versionsService = service(['main']);

    await versionsService.read(user, 'subject');
    const calls = fetch.mock.calls.length;
    await versionsService.read(user, 'subject');
    expect(fetch.mock.calls.length).toBe(calls);

    await versionsService.read(
      mockCredentials.user('user:default/another'),
      'subject',
    );
    expect(fetch.mock.calls.length).toBeGreaterThan(calls);
  });
});
