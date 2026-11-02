import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { JsonObject } from '@backstage/types';
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

/** What the cluster-token route answers: a token, or its 502 with the reason. */
type Mint = { token: true } | { status: number; reason?: string } | 'down';

/** The auth plugin's cluster-token route and the Kubernetes proxy for a fleet. */
function backend(fleet: Record<string, Cluster>, mint: Mint = { token: true }) {
  return jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string>;
    const minted = url.match(/^http:\/\/auth\/cluster-token\/(.+)$/);
    if (minted) {
      if (mint === 'down') {
        throw new TypeError('fetch failed');
      }
      return 'token' in mint
        ? json({ token: `token-${minted[1]}`, expiresInSeconds: 600 })
        : json(
            { error: 'Token exchange failed', reason: mint.reason },
            mint.status,
          );
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

/**
 * The service for installations `main` (the main session's) and the given
 * others, each covered by the muster broker unless overridden.
 */
function service(
  installations: Record<string, Record<string, string>>,
  broker: JsonObject | null = { tokenUrl: 'http://muster/token' },
) {
  const config = mockServices.rootConfig({
    data: {
      gs: {
        authProvider: 'oidc-main',
        ...(broker ? { clusterTokenBroker: broker } : {}),
        installations: Object.fromEntries(
          Object.entries(installations).map(([name, overrides]) => [
            name,
            // An empty override drops the key.
            Object.fromEntries(
              Object.entries({
                authProvider: 'oidc',
                oidcTokenProvider: `oidc-${name}`,
                clusterTokenAudience: name,
                ...overrides,
              }).filter(([, value]) => value !== ''),
            ),
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
    logger: mockServices.logger.mock(),
  });
}

const user = mockCredentials.user('user:default/someone');

const both = (cell: unknown) => ({ kubernetes: cell, release: cell });

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

    const versions = await service({ main: {}, other: {} }).read(
      user,
      'subject',
    );

    expect(versions).toEqual({
      installations: {
        main: {
          kubernetes: { state: 'known', version: 'v1.35.8' },
          release: { state: 'known', version: '35.1.1' },
        },
        other: {
          kubernetes: { state: 'known', version: 'v1.34.7' },
          release: { state: 'known', version: '34.4.0' },
        },
      },
      readInBrowser: [],
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

  it('leaves to the browser what only the browser can read as the person', async () => {
    const fetch = backend({ main: { version: 'v1.35.8' } });
    global.fetch = fetch as typeof global.fetch;

    const versions = await service({
      main: {},
      // Its own OIDC sign-in: muster does not serve it.
      uncovered: { clusterTokenAudience: '' },
      // Its cluster is served by another backend.
      elsewhere: { backendUrl: 'https://elsewhere.example.com' },
    }).read(user, 'subject');

    expect(Object.keys(versions.installations)).toEqual(['main']);
    expect(versions.readInBrowser).toEqual(['uncovered', 'elsewhere']);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes('/cluster-token/')),
    ).toBe(false);
  });

  it('exchanges nothing without a cluster token broker, and reads a Dex target', async () => {
    global.fetch = backend({
      main: { version: 'v1.35.8' },
      dex: { version: 'v1.34.7' },
    }) as typeof global.fetch;

    expect(
      (await service({ main: {}, other: {} }, null).read(user, 'subject'))
        .readInBrowser,
    ).toEqual(['other']);

    const versions = await service(
      { main: {}, dex: { clusterTokenAudience: '' } },
      { targets: { dex: { tokenUrl: 'http://dex/token' } } },
    ).read(user, 'subject');
    expect(versions.installations.dex.kubernetes).toEqual({
      state: 'known',
      version: 'v1.34.7',
    });
  });

  it('reads no CAPI, no Cluster and no label as no release', async () => {
    global.fetch = backend({
      plain: { version: 'v1.34.0', noCapi: true },
      bare: { version: 'v1.33.2' },
    }) as typeof global.fetch;

    const { installations } = await service({ plain: {}, bare: {} }).read(
      user,
      'subject',
    );

    const noRelease = {
      state: 'absent',
      reason: 'The management cluster carries no Giant Swarm release',
    };
    expect(installations.plain.release).toEqual(noRelease);
    expect(installations.bare.release).toEqual(noRelease);
    expect(installations.bare.kubernetes).toEqual({
      state: 'known',
      version: 'v1.33.2',
    });
  });

  it('says once, in both cells and in short, why an installation could not be read', async () => {
    const fetch = backend({
      locked: { version: 403 },
      main: { version: 'hang' },
    });
    global.fetch = fetch as typeof global.fetch;

    const { installations } = await service({ locked: {}, main: {} }).read(
      user,
      'subject',
    );

    expect(installations.locked).toEqual(
      both(
        expect.objectContaining({
          state: 'failed',
          reason: 'Access forbidden',
        }),
      ),
    );
    expect(installations.main).toEqual(
      both(expect.objectContaining({ state: 'failed', reason: 'Timed out' })),
    );
    // The release is asked only of an installation whose API server answered.
    expect(
      fetch.mock.calls.filter(([url]) => String(url).includes('/apis/')),
    ).toEqual([]);
  });

  it.each([
    [{ status: 502, reason: 'subject_invalid' }, 'Not signed in'],
    [{ status: 502, reason: 'broker_unreachable' }, 'Token broker unavailable'],
    [{ status: 502, reason: 'broker_unavailable' }, 'Token broker unavailable'],
    [{ status: 502, reason: 'exchange_failed' }, 'Token exchange failed'],
    ['down' as const, 'Token broker unavailable'],
  ])('maps the cluster-token route’s %j to "%s"', async (mint, reason) => {
    global.fetch = backend(
      { main: { version: 'v1.35.8' }, other: { version: 'v1.35.8' } },
      mint,
    ) as typeof global.fetch;

    const { installations } = await service({ main: {}, other: {} }).read(
      user,
      'subject',
    );

    expect(installations.other).toEqual(
      both(expect.objectContaining({ state: 'failed', reason })),
    );
    expect(installations.main.kubernetes.state).toBe('known');
  });

  it('serves a person’s answer again without asking the installation, but not another person’s', async () => {
    const fetch = backend({ main: { version: 'v1.35.8', release: '35.1.1' } });
    global.fetch = fetch as typeof global.fetch;
    const versionsService = service({ main: {} });

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

  it('keeps no rejected read: the next read asks again', async () => {
    global.fetch = backend({
      main: { version: 'v1.35.8' },
    }) as typeof global.fetch;
    const auth = mockServices.auth();
    const versionsService = new ManagementClusterVersionsService({
      config: mockServices.rootConfig({
        data: {
          gs: {
            authProvider: 'oidc-main',
            installations: {
              main: { authProvider: 'oidc', oidcTokenProvider: 'oidc-main' },
            },
          },
        },
      }),
      auth: {
        ...auth,
        getPluginRequestToken: jest
          .fn()
          .mockRejectedValueOnce(new Error('auth down'))
          .mockImplementation(auth.getPluginRequestToken),
      },
      discovery: {
        getBaseUrl: async (pluginId: string) => `http://${pluginId}`,
        getExternalBaseUrl: async (pluginId: string) => `http://${pluginId}`,
      },
      logger: mockServices.logger.mock(),
    });

    const first = await versionsService.read(user, 'subject');
    expect(first.installations.main.kubernetes.state).toBe('failed');
    const second = await versionsService.read(user, 'subject');
    expect(second.installations.main.kubernetes).toEqual({
      state: 'known',
      version: 'v1.35.8',
    });
  });
});
