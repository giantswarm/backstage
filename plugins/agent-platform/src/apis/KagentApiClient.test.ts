import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import realV0_9_9 from '../lib/__fixtures__/sessions.real-v0-9-9.json';
import v0_9_9 from '../lib/__fixtures__/sessions.v0-9-9.json';
import { KagentApiClient } from './KagentApiClient';
import { KAGENT_AUTH_HEADER } from './types';

describe('KagentApiClient', () => {
  const fetchMock = jest.fn();
  const getCluster = jest.fn();
  const getCredentials = jest.fn();

  const discoveryApi: DiscoveryApi = {
    getBaseUrl: async () => 'http://backend/api/agent-platform',
  };
  const fetchApi = { fetch: fetchMock } as unknown as FetchApi;
  const kubernetesApi = { getCluster } as unknown as KubernetesApi;
  const kubernetesAuthProvidersApi = {
    getCredentials,
  } as unknown as KubernetesAuthProvidersApi;

  function buildClient() {
    return new KagentApiClient({
      discoveryApi,
      fetchApi,
      kubernetesApi,
      kubernetesAuthProvidersApi,
    });
  }

  function jsonResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    getCluster.mockReset();
    getCredentials.mockReset();
    getCluster.mockResolvedValue({
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-gazelle',
    });
    getCredentials.mockResolvedValue({ token: 'dex-token' });
  });

  describe('listSessions', () => {
    it('targets the installation and forwards the minted token', async () => {
      fetchMock.mockResolvedValue(jsonResponse(v0_9_9));

      await buildClient().listSessions('gazelle');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://backend/api/agent-platform/kagent/sessions?installation=gazelle',
      );
      expect(init.headers[KAGENT_AUTH_HEADER]).toBe('dex-token');
      expect(getCredentials).toHaveBeenCalledWith('oidc.oidc-gazelle');
    });

    it('returns normalized sessions', async () => {
      fetchMock.mockResolvedValue(jsonResponse(realV0_9_9));

      const sessions = await buildClient().listSessions('gazelle');

      expect(sessions).toHaveLength(10);
      expect(sessions[0].installation).toBe('gazelle');
      expect(sessions[0].id).toBe(`gazelle/${sessions[0].sessionId}`);
    });

    it('does not filter subagent sessions — that is the provider’s job', async () => {
      fetchMock.mockResolvedValue(jsonResponse(v0_9_9));

      const sessions = await buildClient().listSessions('gazelle');

      expect(sessions).toHaveLength(3);
      expect(sessions.map(session => session.source)).toContain('agent');
    });

    it('throws on an in-band error rather than resolving empty', async () => {
      // kagent can fail on a 200. Resolving with [] would put the installation
      // on the success path and show "no sessions" with nothing but a console
      // line — so this must reach the provider's failure path instead.
      fetchMock.mockResolvedValue(
        jsonResponse({
          error: true,
          data: null,
          message: 'failed to list sessions: database connection lost',
        }),
      );

      await expect(buildClient().listSessions('gazelle')).rejects.toThrow(
        'failed to list sessions: database connection lost',
      );
    });

    it('throws when the contract moved and dropped every row', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: false, data: { unexpected: 'object' } }),
      );

      await expect(buildClient().listSessions('gazelle')).rejects.toThrow(
        /not an array/,
      );
    });

    it('still resolves when only some rows were unreadable', async () => {
      // Partial data is worth showing; the warning records what was dropped.
      fetchMock.mockResolvedValue(
        jsonResponse({
          error: false,
          data: [{ id: 'good', name: 'Kept' }, {}, null],
        }),
      );

      const sessions = await buildClient().listSessions('gazelle');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('good');
    });

    it('returns an empty list when kagent omits the data key', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: false, message: 'Successfully listed sessions' }),
      );

      await expect(buildClient().listSessions('gazelle')).resolves.toEqual([]);
    });

    it('fails without calling the backend when the token cannot be minted', async () => {
      // The per-installation degradation path: one installation the user is not
      // signed in to must not take the others down with it.
      getCredentials.mockResolvedValue({ token: undefined });

      await expect(buildClient().listSessions('golem')).rejects.toThrow(
        /log in to that installation first/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('error mapping', () => {
    // These names are load-bearing twice: QueryClientProvider's retry predicate
    // short-circuits on them, and the sessions provider classifies on them.
    it.each([
      // 400 = the backend has no kagent endpoint configured for the requested
      // installation. Its allowlist is not the same set as the installations the
      // frontend considers reachable, so this occurs in ordinary operation and
      // belongs on the silent "not available here" path rather than being
      // retried with backoff and surfaced as a read failure.
      [400, 'NotFoundError'],
      [401, 'UnauthorizedError'],
      [403, 'ForbiddenError'],
      [404, 'NotFoundError'],
      [503, 'ServiceUnavailableError'],
    ])('maps status %s to %s', async (status, expectedName) => {
      fetchMock.mockResolvedValue(jsonResponse({}, status));

      await expect(buildClient().listSessions('gazelle')).rejects.toMatchObject(
        { name: expectedName },
      );
    });

    it('surfaces the backend’s error message', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'kagent is not available' } }, 404),
      );

      await expect(buildClient().listSessions('gazelle')).rejects.toThrow(
        'kagent is not available',
      );
    });

    it('falls back to a status message when the body has none', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));

      await expect(buildClient().listSessions('gazelle')).rejects.toThrow(
        /status 500/,
      );
    });
  });

  describe('listInstallations', () => {
    it('maps the names-only response to strings without a token', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          installations: [{ name: 'gazelle' }, { name: 'golem' }],
        }),
      );

      const installations = await buildClient().listInstallations();

      expect(installations).toEqual(['gazelle', 'golem']);
      // No installation means no token minting, and no popup risk.
      expect(getCredentials).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://backend/api/agent-platform/kagent/installations',
      );
    });

    it('tolerates a missing or malformed list', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      await expect(buildClient().listInstallations()).resolves.toEqual([]);

      fetchMock.mockResolvedValue(
        jsonResponse({
          installations: [{ name: 'gazelle' }, {}, { name: '' }],
        }),
      );
      await expect(buildClient().listInstallations()).resolves.toEqual([
        'gazelle',
      ]);
    });
  });

  describe('getIdentity', () => {
    it('reads the subject kagent resolved', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ sub: 'marian@giantswarm.io' }),
      );

      await expect(buildClient().getIdentity('gazelle')).resolves.toEqual({
        sub: 'marian@giantswarm.io',
      });
    });

    it('reports the shared default user of unsecure mode', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ sub: 'admin@kagent.dev' }));

      await expect(buildClient().getIdentity('gazelle')).resolves.toEqual({
        sub: 'admin@kagent.dev',
      });
    });

    it('still probes when the token cannot be minted', async () => {
      // The backend reads the token as optional here, so a broker or Dex-session
      // failure must not stop the probe: this is the diagnostic that catches an
      // unsecure-mode deployment presenting a shared list as the user's own, so
      // losing it to a mint failure would be exactly backwards.
      getCredentials.mockResolvedValue({ token: undefined });
      fetchMock.mockResolvedValue(jsonResponse({ sub: 'admin@kagent.dev' }));

      await expect(buildClient().getIdentity('gazelle')).resolves.toEqual({
        sub: 'admin@kagent.dev',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      // The request goes out without the auth header rather than not at all.
      expect(
        fetchMock.mock.calls[0][1].headers[KAGENT_AUTH_HEADER],
      ).toBeUndefined();
    });

    it('reports no subject when kagent’s claims omit one', async () => {
      // /api/me returns the token's claims verbatim, so an IdP that doesn't emit
      // `sub` lands here. Distinct from a confirmed shared user.
      fetchMock.mockResolvedValue(
        jsonResponse({ email: 'marian@example.com' }),
      );

      await expect(buildClient().getIdentity('gazelle')).resolves.toEqual({
        sub: undefined,
      });
    });
  });
});
