import { mockApis } from '@backstage/test-utils';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { MusterApiClient } from './MusterApiClient';
import { MusterAuthProvidersApi } from './types';

const HEADER = 'backstage-muster-authorization';

// gazelle is the home installation: its cluster entry mints through the main
// provider. golem is another installation with its own Dex. wombat is
// configured for muster but unknown to the kubernetes API. `open` needs no
// token at all.
const CLUSTERS: Record<
  string,
  { name: string; authProvider: string; oidcTokenProvider?: string }
> = {
  gazelle: {
    name: 'gazelle',
    authProvider: 'oidc',
    oidcTokenProvider: 'oidc-gazelle',
  },
  golem: {
    name: 'golem',
    authProvider: 'oidc',
    oidcTokenProvider: 'oidc-golem',
  },
};

function configData(mainProvider: string | undefined, legacy: boolean) {
  return {
    ...(mainProvider ? { gs: { authProvider: mainProvider } } : {}),
    // The legacy single-installation entry `resolveAuthProvider` falls back to
    // when no installation is named (or the named one has no authProvider).
    ...(legacy
      ? { aiChat: { mcp: [{ name: 'muster', authProvider: 'mcp-muster' }] } }
      : {}),
    muster: {
      installations: [
        { name: 'gazelle', authProvider: 'mcp-muster' },
        { name: 'golem', authProvider: 'mcp-muster' },
        { name: 'wombat', authProvider: 'mcp-muster' },
        { name: 'open' },
      ],
    },
  };
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

type SetupOptions = {
  /** `gs.authProvider`; `null` leaves it unset. */
  mainProvider?: string | null;
  /** What the muster auth providers answer for the home path. */
  main?: { token?: string };
  /** What the kubernetes auth providers answer (the broker) for other installations. */
  broker?: () => Promise<{ token?: string }>;
  /** Construct without the kubernetes APIs (pre-brokered-token wiring). */
  withKubernetes?: boolean;
  /** Also configure the legacy `aiChat.mcp` muster entry. */
  legacy?: boolean;
};

function setup(options: SetupOptions = {}) {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(okResponse({ total: 1, tools: [] }));
  const getMainCredentials = jest
    .fn()
    .mockResolvedValue(options.main ?? { token: 'main-id-token' });
  const authProvidersApi: MusterAuthProvidersApi = {
    getCredentials: getMainCredentials,
  };
  const getCluster = jest.fn(async (name: string) => CLUSTERS[name]);
  const getBrokeredCredentials = jest.fn(
    options.broker ?? (async () => ({ token: 'brokered-token' })),
  );
  const kubernetesApi = { getCluster } as unknown as KubernetesApi;
  const kubernetesAuthProvidersApi = {
    getCredentials: getBrokeredCredentials,
  } as unknown as KubernetesAuthProvidersApi;

  const client = new MusterApiClient({
    discoveryApi: {
      getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/muster'),
    },
    fetchApi: { fetch: fetchMock },
    configApi: mockApis.config({
      data: configData(
        options.mainProvider === null
          ? undefined
          : (options.mainProvider ?? 'oidc-gazelle'),
        options.legacy ?? false,
      ),
    }),
    authProvidersApi,
    ...(options.withKubernetes === false
      ? {}
      : { kubernetesApi, kubernetesAuthProvidersApi }),
  });

  const sentHeaders = (): Record<string, string> | undefined =>
    (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as
      Record<string, string> | undefined;

  return {
    client,
    fetchMock,
    sentHeaders,
    getMainCredentials,
    getBrokeredCredentials,
    getCluster,
  };
}

describe('MusterApiClient token selection', () => {
  it('sends the main-login token when no installation is named', async () => {
    // Single-installation setup: the legacy `aiChat.mcp` entry names the provider.
    const t = setup({ legacy: true });

    await t.client.listWorkflows();

    expect(t.sentHeaders()?.[HEADER]).toBe('main-id-token');
    expect(t.getMainCredentials).toHaveBeenCalledWith('mcp-muster');
    expect(t.getCluster).not.toHaveBeenCalled();
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it('sends the main-login token to the home installation', async () => {
    const t = setup();

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });

    expect(t.sentHeaders()?.[HEADER]).toBe('main-id-token');
    expect(t.getCluster).toHaveBeenCalledWith('gazelle');
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
    expect(t.fetchMock.mock.calls[0][0]).toContain('installation=gazelle');
  });

  it("sends the installation's brokered token to any other installation", async () => {
    const t = setup();

    await t.client.filterTools({ installation: 'golem', limit: 1 });

    expect(t.sentHeaders()?.[HEADER]).toBe('brokered-token');
    // Minted the kagent/model-manager way: the cluster's own oidc provider.
    expect(t.getBrokeredCredentials).toHaveBeenCalledWith('oidc.oidc-golem');
    expect(t.getMainCredentials).not.toHaveBeenCalled();
  });

  it('keeps the main-login token for an installation the kubernetes API does not know', async () => {
    const t = setup();

    await t.client.listServers('wombat');

    expect(t.sentHeaders()?.[HEADER]).toBe('main-id-token');
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it('keeps the main-login token everywhere without a gs.authProvider', async () => {
    // No main provider means no broker; the pre-existing path is the only one.
    const t = setup({ mainProvider: null });

    await t.client.listServers('golem');

    expect(t.sentHeaders()?.[HEADER]).toBe('main-id-token');
    expect(t.getCluster).not.toHaveBeenCalled();
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it('behaves as before when constructed without the kubernetes APIs', async () => {
    const t = setup({ withKubernetes: false });

    await t.client.listServers('golem');

    expect(t.sentHeaders()?.[HEADER]).toBe('main-id-token');
  });

  it('sends no token to an installation configured without an authProvider', async () => {
    const t = setup();

    await t.client.listServers('open');

    expect(t.sentHeaders()?.[HEADER]).toBeUndefined();
    expect(t.getMainCredentials).not.toHaveBeenCalled();
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it('fails before the request when the broker says the main session expired', async () => {
    const t = setup({
      broker: () =>
        Promise.reject(
          Object.assign(
            new Error('Main session expired and re-login did not complete'),
            { name: 'ClusterTokenError', reason: 'session-expired' },
          ),
        ),
    });

    await expect(
      t.client.filterTools({ installation: 'golem', limit: 1 }),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
      installation: 'golem',
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('classifies any other mint failure as mint-failed, quoting the cause', async () => {
    const t = setup({
      broker: () => Promise.reject(new Error('Token broker is unreachable')),
    });

    await expect(
      t.client.filterTools({ installation: 'golem', limit: 1 }),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'mint-failed',
      message:
        'Could not mint a token for muster on golem: Token broker is unreachable',
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('reports a gone main session for the home installation instead of sending nothing', async () => {
    const t = setup({ main: {} });

    await expect(
      t.client.filterTools({ installation: 'gazelle', limit: 1 }),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
      installation: 'gazelle',
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it("relays muster's 401 as an UnauthorizedError carrying its message", async () => {
    const t = setup();
    t.fetchMock.mockResolvedValue(
      errorResponse(401, {
        error: {
          message:
            'MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): {"error":"invalid_token","error_description":"Token validation failed"}',
        },
      }),
    );

    await expect(
      t.client.filterTools({ installation: 'golem', limit: 1 }),
    ).rejects.toMatchObject({
      name: 'UnauthorizedError',
      message: expect.stringContaining('Token validation failed'),
    });
    expect(t.sentHeaders()?.[HEADER]).toBe('brokered-token');
  });
});

describe('MusterApiClient.signIn', () => {
  it('mints the main-login token for the home installation', async () => {
    const t = setup();

    await expect(t.client.signIn('gazelle')).resolves.toBe(true);
    expect(t.getMainCredentials).toHaveBeenCalledWith('mcp-muster');
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it('mints the brokered token for any other installation', async () => {
    const t = setup();

    await expect(t.client.signIn('golem')).resolves.toBe(true);
    expect(t.getBrokeredCredentials).toHaveBeenCalledWith('oidc.oidc-golem');
    expect(t.getMainCredentials).not.toHaveBeenCalled();
  });

  it('reports a failed mint as false instead of throwing', async () => {
    const t = setup({
      broker: () => Promise.reject(new Error('Token broker is unreachable')),
    });

    await expect(t.client.signIn('golem')).resolves.toBe(false);
  });

  it('reports a gone main session as false', async () => {
    const t = setup({ main: {} });

    await expect(t.client.signIn('gazelle')).resolves.toBe(false);
  });

  it('succeeds without minting when the installation needs no token', async () => {
    const t = setup();

    await expect(t.client.signIn('open')).resolves.toBe(true);
    expect(t.getMainCredentials).not.toHaveBeenCalled();
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });
});
