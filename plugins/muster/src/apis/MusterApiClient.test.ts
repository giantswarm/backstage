import { mockApis } from '@backstage/test-utils';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import {
  __resetSignedInConfigForTests,
  setSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';
import {
  ClusterTokenError,
  SESSION_EXPIRED_MESSAGE,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { MusterApiClient, toolErrorDetails } from './MusterApiClient';
import { MusterAuthProviders } from './MusterAuthProviders';
import { MusterTokenMintError } from './installationToken';
import {
  isMusterAuthFailure,
  musterSignInRequiredOf,
  MusterUnauthorizedError,
} from './musterUnauthorized';
import { MusterAnswerCutError, MusterAuthProvidersApi } from './types';

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

/** The public config: the main provider alone. */
function configData(mainProvider: string | undefined) {
  return mainProvider ? { gs: { authProvider: mainProvider } } : {};
}

/**
 * The signed-in config the client resolves auth providers from:
 * `muster.installations[]` and, with `legacy`, the single-installation
 * `aiChat.mcp` entry `resolveAuthProvider` falls back to when no installation
 * is named (or the named one has no authProvider).
 */
function signedInConfigData(legacy: boolean) {
  return {
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

beforeEach(() => {
  __resetSignedInConfigForTests();
});

/** An unsigned JWT that expires at `exp` (seconds since the epoch). */
function idToken(exp: number): string {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url({ exp: Math.floor(exp) })}.sig`;
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

describe('MusterApiClient tool errors', () => {
  it('keeps the further text blocks of a refused tool with the thrown error', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValue(
      errorResponse(500, {
        error: {
          name: 'MusterToolError',
          message: 'node pool gpu-l4 still runs 1 node(s)',
          details: ['{"refused":{"nodes":["i-0abc"]}}'],
        },
      }),
    );

    const error: unknown = await client
      .callTool('x_cluster-manager_delete_node_pool', {}, 'open')
      .catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'node pool gpu-l4 still runs 1 node(s)',
    );
    expect(toolErrorDetails(error)).toEqual([
      '{"refused":{"nodes":["i-0abc"]}}',
    ]);
  });
});

describe('MusterApiClient response status', () => {
  it("keeps the status of an answer that is not muster-backend's own", async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => {
        throw new SyntaxError('upstream request timeout');
      },
    } as unknown as Response);

    const error: unknown = await client
      .callTool('x_marge_sweep', {}, 'open')
      .catch(e => e);
    expect((error as Error).message).toBe(
      'Muster request failed with status 504',
    );
    expect((error as Error & { status?: number }).status).toBe(504);
  });
});

/** A streamed answer whose body yields `chunks` as they would arrive. */
function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const pending = chunks.map(chunk => encoder.encode(chunk));
  const reader = {
    read: async () =>
      pending.length > 0
        ? { done: false, value: pending.shift() }
        : { done: true, value: undefined },
    cancel: jest.fn(async () => undefined),
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
  } as unknown as Response;
}

/** `/call/progress` answers `response`; every other read its default. */
function answerCall(fetchMock: jest.Mock, response: Response) {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('/call/progress')
      ? response
      : okResponse({ total: 1, tools: [] }),
  );
}

describe('MusterApiClient.callToolWithProgress', () => {
  it('hands each progress line on as it arrives, then answers the result', async () => {
    const { client, fetchMock } = setup();
    answerCall(
      fetchMock,
      streamResponse([
        '{"type":"progress","progress":1,"message":"0 of 2 PRs done"}\n{"type":"pro',
        'gress","progress":2,"message":"2 of 2 PRs done"}\n',
        '{"type":"result","result":{"swept":2}}\n',
      ]),
    );
    const onProgress = jest.fn();

    const result = await client.callToolWithProgress(
      'x_marge_sweep',
      { team: 'honeybadger' },
      { installation: 'open', onProgress },
    );

    expect(result).toEqual({ swept: 2 });
    expect(onProgress.mock.calls.map(([p]) => p.message)).toEqual([
      '0 of 2 PRs done',
      '2 of 2 PRs done',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend/api/muster/call/progress?installation=open',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws an error line as the error it names, with its details', async () => {
    const { client, fetchMock } = setup();
    answerCall(
      fetchMock,
      streamResponse([
        '{"type":"progress","progress":1}\n',
        '{"type":"error","error":{"name":"MusterToolError","message":"refused","details":["{}"]}}\n',
      ]),
    );

    const error: unknown = await client
      .callToolWithProgress(
        'x_marge_sweep',
        {},
        {
          installation: 'open',
          onProgress: () => {},
        },
      )
      .catch(e => e);

    expect((error as Error).name).toBe('MusterToolError');
    expect((error as Error).message).toBe('refused');
    expect(toolErrorDetails(error)).toEqual(['{}']);
  });

  it('reports an answer that ended before its result as cut', async () => {
    const { client, fetchMock } = setup();
    answerCall(
      fetchMock,
      streamResponse(['{"type":"progress","progress":1}\n']),
    );

    await expect(
      client.callToolWithProgress(
        'x_marge_sweep',
        {},
        {
          installation: 'open',
          onProgress: () => {},
        },
      ),
    ).rejects.toBeInstanceOf(MusterAnswerCutError);
  });

  it('throws a failure before the stream as callTool does', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValue(
      errorResponse(401, { error: { message: 'sign in' } }),
    );

    const error: unknown = await client
      .callToolWithProgress(
        'x_marge_sweep',
        {},
        {
          installation: 'open',
          onProgress: () => {},
        },
      )
      .catch(e => e);

    expect((error as Error).name).toBe('UnauthorizedError');
  });
});

describe('toolErrorDetails', () => {
  it('reads the further text blocks a tool error carries, else none', () => {
    expect(
      toolErrorDetails(
        Object.assign(new Error('refused'), { details: ['{"refused":{}}'] }),
      ),
    ).toEqual(['{"refused":{}}']);
    expect(toolErrorDetails(new Error('plain'))).toEqual([]);
    expect(toolErrorDetails(undefined)).toEqual([]);
    expect(
      toolErrorDetails(Object.assign(new Error('x'), { details: [1] })),
    ).toEqual([]);
  });
});

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

  setSignedInConfig(
    mockApis.config({ data: signedInConfigData(options.legacy ?? false) }),
  );
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
          new ClusterTokenError(
            'golem',
            'session-expired',
            'Main session expired and re-login did not complete',
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

  it('sends a main-login ID token that is still valid', async () => {
    const valid = idToken(Date.now() / 1000 + 600);
    const t = setup({ main: { token: valid } });

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });

    expect(t.sentHeaders()?.[HEADER]).toBe(valid);
  });

  it('never sends a main-login ID token past its exp', async () => {
    const t = setup({ main: { token: idToken(Date.now() / 1000 - 1) } });

    await expect(
      t.client.filterTools({ installation: 'gazelle', limit: 1 }),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
      installation: 'gazelle',
      message: SESSION_EXPIRED_MESSAGE,
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('reports a main-login token that is expired after the auth API answered as a gone session to signIn', async () => {
    const t = setup({ main: { token: idToken(Date.now() / 1000 - 1) } });

    await expect(t.client.signIn('gazelle')).resolves.toBe(false);
  });

  it("turns muster's expired-token answer into the sign-in prompt, never its raw text", async () => {
    const t = setup();
    t.fetchMock.mockResolvedValue(
      errorResponse(500, {
        error: {
          name: 'MusterToolError',
          message:
            'token has expired for workspace-manager, re-authenticate to refresh: token is expired',
        },
      }),
    );

    await expect(
      t.client.callTool('x_workspace-manager_list_workspaces', {}, 'gazelle'),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
      installation: 'gazelle',
      message: SESSION_EXPIRED_MESSAGE,
    });
  });

  it("turns muster's expired-token error line into the sign-in prompt", async () => {
    const t = setup();
    answerCall(
      t.fetchMock,
      streamResponse([
        '{"type":"error","error":{"name":"MusterToolError","message":"ID token has expired for agent-manager, re-authenticate to refresh: token is expired"}}\n',
      ]),
    );

    await expect(
      t.client.callToolWithProgress(
        'x_agent-manager_create_agent',
        {},
        { installation: 'gazelle', onProgress: () => {} },
      ),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
      message: SESSION_EXPIRED_MESSAGE,
    });
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

describe('MusterApiClient.getAuthStatus', () => {
  const status = { servers: [] };

  it('reads the status with the session the person has, never asking for a sign-in', async () => {
    const t = setup();
    t.fetchMock.mockResolvedValue(okResponse(status));

    await expect(t.client.getAuthStatus('gazelle')).resolves.toEqual(status);
    expect(t.getMainCredentials).toHaveBeenCalledWith('mcp-muster', {
      optional: true,
    });
    expect(t.sentHeaders()?.[HEADER]).toBe('main-id-token');
  });

  it('fails as a gone session, before any request, once the portal session has expired', async () => {
    const t = setup({ main: {} });

    await expect(t.client.getAuthStatus('gazelle')).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
      installation: 'gazelle',
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
    // Only the optional read: a plain one is what opens the login dialog.
    expect(t.getMainCredentials).toHaveBeenCalledTimes(1);
    expect(t.getMainCredentials).toHaveBeenCalledWith('mcp-muster', {
      optional: true,
    });
  });

  it('treats a main-login token past its exp as a gone session', async () => {
    const t = setup({ main: { token: idToken(Date.now() / 1000 - 1) } });

    await expect(t.client.getAuthStatus('gazelle')).rejects.toMatchObject({
      reason: 'session-expired',
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('does not mint a brokered token for another installation without a session', async () => {
    const t = setup({ main: {} });

    await expect(t.client.getAuthStatus('golem')).rejects.toMatchObject({
      reason: 'session-expired',
      installation: 'golem',
    });
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('asks the main auth API only for its optional token while the session is gone', async () => {
    // The app's providers over a main auth API whose session is gone: the
    // optional read answers no token, a plain one would open the dialog.
    const getIdToken = jest.fn(async (options?: { optional?: boolean }) => {
      if (options?.optional) {
        return '';
      }
      throw new Error('the Login Required dialog opened');
    });
    const fetchMock = jest.fn();
    setSignedInConfig(mockApis.config({ data: signedInConfigData(false) }));
    const client = new MusterApiClient({
      discoveryApi: {
        getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/muster'),
      },
      fetchApi: { fetch: fetchMock },
      configApi: mockApis.config({ data: configData('oidc-gazelle') }),
      authProvidersApi: new MusterAuthProviders({}, { getIdToken }),
    });

    await expect(client.getAuthStatus('gazelle')).rejects.toMatchObject({
      reason: 'session-expired',
    });
    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledWith({ optional: true });
    expect(fetchMock).not.toHaveBeenCalled();
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

describe('MusterApiClient token selection for derived installations', () => {
  // snail and home2 are known to the backend only: derived from their base
  // domain, no `muster.installations` entry. snail has its own Dex; home2's
  // cluster entry mints through the main provider, so it is a home installation.
  const BACKEND = {
    installations: [
      { name: 'snail', requiresAuth: true },
      { name: 'home2', requiresAuth: true },
      { name: 'ungated', requiresAuth: false },
    ],
  };

  function derivedSetup(options: SetupOptions = {}) {
    const t = setup(options);
    t.fetchMock.mockImplementation(async (url: string) =>
      url.includes('/installations')
        ? okResponse(BACKEND)
        : okResponse({ total: 1, tools: [] }),
    );
    t.getCluster.mockImplementation(async (name: string) => {
      if (name === 'snail') {
        return { name, authProvider: 'oidc', oidcTokenProvider: 'oidc-snail' };
      }
      if (name === 'home2') {
        return {
          name,
          authProvider: 'oidc',
          oidcTokenProvider: 'oidc-gazelle',
        };
      }
      return CLUSTERS[name];
    });
    const callsTo = (path: string) =>
      t.fetchMock.mock.calls.filter(([url]) => String(url).includes(path));
    const headersOf = (path: string): Record<string, string> | undefined =>
      (callsTo(path)[0]?.[1] as RequestInit | undefined)?.headers as
        Record<string, string> | undefined;
    return { ...t, callsTo, headersOf };
  }

  it('mints the brokered token for a derived installation once the backend says it requires one', async () => {
    const t = derivedSetup();

    await t.client.filterTools({ installation: 'snail', limit: 1 });

    expect(t.headersOf('/tools/filter')?.[HEADER]).toBe('brokered-token');
    expect(t.getBrokeredCredentials).toHaveBeenCalledWith('oidc.oidc-snail');
    expect(t.getMainCredentials).not.toHaveBeenCalled();
    // The backend's list was consulted, without a token of its own.
    expect(t.callsTo('/installations')).toHaveLength(1);
    expect(t.headersOf('/installations')?.[HEADER]).toBeUndefined();
  });

  it('sends the main-login token to a derived home installation under gs.authProvider', async () => {
    const t = derivedSetup();

    await t.client.listServers('home2');

    expect(t.headersOf('/servers')?.[HEADER]).toBe('main-id-token');
    expect(t.getMainCredentials).toHaveBeenCalledWith('oidc-gazelle');
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it('sends no token to a derived installation the backend reports as needing none', async () => {
    const t = derivedSetup();

    await t.client.listServers('ungated');

    expect(t.headersOf('/servers')?.[HEADER]).toBeUndefined();
    expect(t.getMainCredentials).not.toHaveBeenCalled();
    expect(t.getBrokeredCredentials).not.toHaveBeenCalled();
  });

  it("reads the backend's list once for any number of requests", async () => {
    const t = derivedSetup();

    await t.client.listServers('snail');
    await t.client.listServers('home2');
    await t.client.filterTools({ installation: 'snail', limit: 1 });

    expect(t.callsTo('/installations')).toHaveLength(1);
  });

  it('does not keep a failed read of the list', async () => {
    const t = derivedSetup();
    t.fetchMock.mockImplementationOnce(async () =>
      errorResponse(503, { error: { name: 'ServiceUnavailableError' } }),
    );

    await expect(t.client.listServers('snail')).rejects.toBeDefined();
    await t.client.listServers('snail');

    expect(t.callsTo('/installations')).toHaveLength(2);
    expect(t.headersOf('/servers')?.[HEADER]).toBe('brokered-token');
  });

  it('signIn mints the brokered token for a derived installation', async () => {
    const t = derivedSetup();

    await expect(t.client.signIn('snail')).resolves.toBe(true);
    expect(t.getBrokeredCredentials).toHaveBeenCalledWith('oidc.oidc-snail');
    expect(t.getMainCredentials).not.toHaveBeenCalled();
  });

  it('still trusts the configured authProvider first', async () => {
    // golem is listed in muster.installations with an authProvider; the
    // backend's list is not needed to decide.
    const t = derivedSetup();

    await t.client.listServers('golem');

    expect(t.headersOf('/servers')?.[HEADER]).toBe('brokered-token');
    expect(t.callsTo('/installations')).toHaveLength(0);
  });
});

describe('MusterApiClient.filterTools toolset arguments', () => {
  it('sends one toolset= entry per selector, in order, plus include_presets', async () => {
    const t = setup();

    await t.client.filterTools({
      installation: 'gazelle',
      toolset: ['preset:read-only', 'workflow:incident-triage'],
      includePresets: true,
      limit: 1000,
    });

    const url = new URL(String(t.fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/muster/tools/filter');
    expect(url.searchParams.getAll('toolset')).toEqual([
      'preset:read-only',
      'workflow:incident-triage',
    ]);
    expect(url.searchParams.get('include_presets')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('1000');
  });

  it('sends neither parameter when the caller gives no toolset', async () => {
    const t = setup();

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });

    const url = new URL(String(t.fetchMock.mock.calls[0][0]));
    expect(url.searchParams.has('toolset')).toBe(false);
    expect(url.searchParams.has('include_presets')).toBe(false);
  });
});

/**
 * An unsigned JWT issued at `iat` that expires at `exp` (seconds since the
 * epoch), to `sub` by one issuer.
 */
function lifetimeToken(
  iat: number,
  exp: number,
  jti = 'a',
  sub = 'person',
): string {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url({
    iss: 'https://dex.gazelle.example.io',
    sub,
    iat: Math.floor(iat),
    exp: Math.floor(exp),
    jti,
  })}.sig`;
}

/** The token each request carried, in order. */
function sentTokens(fetchMock: jest.Mock): (string | undefined)[] {
  return fetchMock.mock.calls
    .map(([, init]) => (init as RequestInit).headers as Record<string, string>)
    .map(headers => headers[HEADER]);
}

/**
 * giantswarm/giantswarm#38779: a 401 from muster-backend says why. A token a
 * refresh can fix is refreshed and the call sent once more; a server's
 * sign-in goes back to the page; nothing is retried twice.
 */
describe('MusterApiClient 401 answers', () => {
  const now = () => Date.now() / 1000;

  it('hands a sign-in a server needs back to the page, without retrying', async () => {
    const t = setup();
    t.fetchMock.mockResolvedValue(
      errorResponse(401, {
        error: {
          name: 'MusterUnauthorizedError',
          message:
            "auth_required: server 'cluster-manager' requires authentication; sign in to it to use its tools.",
          reason: 'server_sign_in_required',
          server: 'cluster-manager',
        },
      }),
    );

    const error: unknown = await t.client
      .callTool('x_cluster-manager_list_clusters', {}, 'gazelle')
      .catch(e => e);

    expect(error).toBeInstanceOf(MusterUnauthorizedError);
    expect(error).toMatchObject({
      name: 'UnauthorizedError',
      reason: 'server_sign_in_required',
      server: 'cluster-manager',
      installation: 'gazelle',
    });
    expect(musterSignInRequiredOf(error)).toEqual({
      server: 'cluster-manager',
      installation: 'gazelle',
    });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired token and sends the call once more with the new one', async () => {
    const old = lifetimeToken(now() - 1700, now() + 100, 'old');
    const fresh = lifetimeToken(now(), now() + 1800, 'fresh');
    const t = setup();
    t.getMainCredentials.mockImplementation(
      async (_provider: string, options?: { minLifetimeLeft?: number }) => ({
        token: options?.minLifetimeLeft === 1 ? fresh : old,
      }),
    );
    t.fetchMock
      .mockResolvedValueOnce(
        errorResponse(401, {
          error: { message: 'expired', reason: 'token_expired' },
        }),
      )
      .mockResolvedValueOnce(okResponse({ clusters: [] }));

    await expect(
      t.client.callTool('x_cluster-manager_list_clusters', {}, 'gazelle'),
    ).resolves.toEqual({ clusters: [] });

    expect(sentTokens(t.fetchMock)).toEqual([old, fresh]);
    expect(t.getMainCredentials).toHaveBeenCalledWith('mcp-muster', {
      minLifetimeLeft: 1,
    });
  });

  it('refreshes a token muster rejected through the broker for another installation', async () => {
    const t = setup({
      broker: async () => ({ token: 'brokered-token' }),
    });
    t.getBrokeredCredentials
      .mockResolvedValueOnce({ token: 'brokered-token' })
      .mockResolvedValueOnce({ token: 'brokered-token-2' });
    t.fetchMock
      .mockResolvedValueOnce(
        errorResponse(401, {
          error: { message: 'rejected', reason: 'token_rejected' },
        }),
      )
      .mockResolvedValueOnce(okResponse({ tools: [] }));

    await t.client.filterTools({ installation: 'golem', limit: 1 });

    expect(sentTokens(t.fetchMock)).toEqual([
      'brokered-token',
      'brokered-token-2',
    ]);
    expect(t.getBrokeredCredentials).toHaveBeenLastCalledWith(
      'oidc.oidc-golem',
      {
        minLifetimeLeft: 1,
      },
    );
  });

  it('sends the call once more at most', async () => {
    const t = setup();
    let issued = 0;
    t.getMainCredentials.mockImplementation(async () => ({
      token: `main-id-token-${issued++}`,
    }));
    t.fetchMock.mockResolvedValue(
      errorResponse(401, {
        error: { message: 'rejected', reason: 'token_rejected' },
      }),
    );

    const error: unknown = await t.client
      .callTool('x_cluster-manager_list_clusters', {}, 'gazelle')
      .catch(e => e);

    expect(error).toMatchObject({
      name: 'UnauthorizedError',
      reason: 'token_rejected',
    });
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send the refused token again: the session is gone', async () => {
    const t = setup();
    t.fetchMock.mockResolvedValue(
      errorResponse(401, {
        error: { message: 'expired', reason: 'token_expired' },
      }),
    );

    await expect(
      t.client.callTool('x_cluster-manager_list_clusters', {}, 'gazelle'),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
    });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes a token close to its expiry before sending it', async () => {
    const closing = lifetimeToken(now() - 1600, now() + 200, 'closing');
    const fresh = lifetimeToken(now(), now() + 1800, 'fresh');
    const t = setup();
    t.getMainCredentials.mockImplementation(
      async (_provider: string, options?: { minLifetimeLeft?: number }) => ({
        token: options?.minLifetimeLeft === undefined ? closing : fresh,
      }),
    );

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });

    expect(sentTokens(t.fetchMock)).toEqual([fresh]);
    expect(t.getMainCredentials).toHaveBeenCalledWith('mcp-muster', {
      minLifetimeLeft: 0.5,
    });
  });

  it('sends the refreshed token with every call while it lasts, asking once', async () => {
    const closing = lifetimeToken(now() - 1600, now() + 200, 'closing');
    const fresh = lifetimeToken(now(), now() + 1800, 'fresh');
    const t = setup();
    // The session keeps handing out its own token; the refresh is kept apart.
    t.getMainCredentials.mockImplementation(
      async (_provider: string, options?: { minLifetimeLeft?: number }) => ({
        token: options?.minLifetimeLeft === undefined ? closing : fresh,
      }),
    );

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });
    await t.client.filterTools({ installation: 'gazelle', limit: 1 });
    await t.client.listServers('gazelle');

    expect(sentTokens(t.fetchMock)).toEqual([fresh, fresh, fresh]);
    const refreshes = t.getMainCredentials.mock.calls.filter(
      ([, options]) => options?.minLifetimeLeft !== undefined,
    );
    expect(refreshes).toHaveLength(1);
  });

  it('does not ask again for 30 seconds after a refresh that came back no better', async () => {
    // A broker that keeps handing out the token it cached.
    const closing = lifetimeToken(now() - 1600, now() + 200, 'closing');
    const t = setup({ main: { token: closing } });

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });
    await t.client.filterTools({ installation: 'gazelle', limit: 1 });

    expect(sentTokens(t.fetchMock)).toEqual([closing, closing]);
    const refreshes = t.getMainCredentials.mock.calls.filter(
      ([, options]) => options?.minLifetimeLeft !== undefined,
    );
    expect(refreshes).toHaveLength(1);
  });

  it("never sends one person's kept token for another's", async () => {
    const fresh = lifetimeToken(now(), now() + 1800, 'fresh', 'first');
    const other = lifetimeToken(now() - 1600, now() + 200, 'other', 'second');
    const otherFresh = lifetimeToken(
      now(),
      now() + 1800,
      'other-fresh',
      'second',
    );
    const t = setup();
    t.getMainCredentials
      // The first person's closing token, then its refresh.
      .mockResolvedValueOnce({
        token: lifetimeToken(now() - 1600, now() + 200, 'closing', 'first'),
      })
      .mockResolvedValueOnce({ token: fresh })
      // Signed in as someone else, whose token is closing too.
      .mockResolvedValueOnce({ token: other })
      .mockResolvedValueOnce({ token: otherFresh });

    await t.client.filterTools({ installation: 'gazelle', limit: 1 });
    await t.client.filterTools({ installation: 'gazelle', limit: 1 });

    expect(sentTokens(t.fetchMock)).toEqual([fresh, otherFresh]);
  });

  it('never sends a brokered token past its exp', async () => {
    const t = setup({
      broker: async () => ({
        token: lifetimeToken(now() - 1900, now() - 100),
      }),
    });

    await expect(
      t.client.filterTools({ installation: 'golem', limit: 1 }),
    ).rejects.toMatchObject({
      name: 'MusterTokenMintError',
      reason: 'session-expired',
    });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });
});

describe('isMusterAuthFailure', () => {
  it('finds a 401 or a missing token through the errors that wrap it', () => {
    const unauthorized = new MusterUnauthorizedError(
      'sign in',
      'server_sign_in_required',
      'cluster-manager',
    );
    const wrapped = new Error('cluster-manager refused', {
      cause: unauthorized,
    });

    expect(isMusterAuthFailure(wrapped)).toBe(true);
    expect(musterSignInRequiredOf(wrapped)).toEqual({
      server: 'cluster-manager',
      installation: undefined,
    });
    expect(
      isMusterAuthFailure(
        new MusterTokenMintError('gazelle', 'session-expired', 'expired'),
      ),
    ).toBe(true);
    // A broker hiccup may well pass the next time.
    expect(
      isMusterAuthFailure(
        new MusterTokenMintError('golem', 'mint-failed', 'unreachable'),
      ),
    ).toBe(false);
    expect(isMusterAuthFailure(new Error('node pool not found'))).toBe(false);
    expect(
      musterSignInRequiredOf(new MusterUnauthorizedError('x', 'token_expired')),
    ).toBeUndefined();
  });
});
