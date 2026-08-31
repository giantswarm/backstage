import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import realV0_9_9 from '../lib/__fixtures__/sessions.real-v0-9-9.json';
import v0_9_9 from '../lib/__fixtures__/sessions.v0-9-9.json';
import detailV0_9_9 from '../lib/__fixtures__/session-detail.v0-9-9.json';
import tasksV0_9_9 from '../lib/__fixtures__/tasks.v0-9-9.json';
import tasksMalformed from '../lib/__fixtures__/tasks.malformed.json';
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

  describe('getSessionDetail', () => {
    it('targets the session and forwards the minted token', async () => {
      fetchMock.mockResolvedValue(jsonResponse(detailV0_9_9));

      await buildClient().getSessionDetail('gazelle', 'abc');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://backend/api/agent-platform/kagent/sessions/abc?installation=gazelle',
      );
      expect(init.headers[KAGENT_AUTH_HEADER]).toBe('dex-token');
    });

    it('escapes a session id that is not URL-safe', async () => {
      // Ids are opaque, so one must never be interpolated raw — a `/` or `?`
      // would otherwise retarget the request.
      fetchMock.mockResolvedValue(jsonResponse(detailV0_9_9));

      await buildClient().getSessionDetail('gazelle', 'a/b?c=d');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://backend/api/agent-platform/kagent/sessions/a%2Fb%3Fc%3Dd?installation=gazelle',
      );
    });

    it('returns the session', async () => {
      fetchMock.mockResolvedValue(jsonResponse(detailV0_9_9));

      const detail = await buildClient().getSessionDetail('gazelle', 'abc');

      expect(detail?.session.installation).toBe('gazelle');
      expect(detail?.session.title).toBe('Which GitHub issues...');
    });

    it('resolves undefined when the body carried no session', async () => {
      // Same condition as a 404, and the page shows one "not found" state for
      // both — so this must not throw.
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      fetchMock.mockResolvedValue(
        jsonResponse({ error: false, data: { events: [] } }),
      );

      await expect(
        buildClient().getSessionDetail('gazelle', 'abc'),
      ).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });

    it('throws on an in-band error rather than looking like a missing session', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      fetchMock.mockResolvedValue(
        jsonResponse({ error: true, message: 'boom' }),
      );

      await expect(
        buildClient().getSessionDetail('gazelle', 'abc'),
      ).rejects.toMatchObject({ name: 'UpstreamError', message: 'boom' });
      warnSpy.mockRestore();
    });
  });

  describe('listSessionTasks', () => {
    it('targets the tasks path', async () => {
      fetchMock.mockResolvedValue(jsonResponse(tasksV0_9_9));

      await buildClient().listSessionTasks('gazelle', 'abc');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://backend/api/agent-platform/kagent/sessions/abc/tasks?installation=gazelle',
      );
    });

    it('returns tasks in wire form, in kagent’s order', async () => {
      fetchMock.mockResolvedValue(jsonResponse(tasksV0_9_9));

      const tasks = await buildClient().listSessionTasks('gazelle', 'abc');

      expect(tasks.map(task => task.id)).toEqual(['task-1', 'task-2']);
    });

    it('resolves empty for a session that was never run', async () => {
      // Go's omitempty drops a zero-length slice, so there is no `data` key. That
      // is ordinary, not a failure.
      fetchMock.mockResolvedValue(
        jsonResponse({ error: false, message: 'Successfully retrieved' }),
      );

      await expect(
        buildClient().listSessionTasks('gazelle', 'abc'),
      ).resolves.toEqual([]);
    });

    it('throws when the contract moved', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      fetchMock.mockResolvedValue(
        jsonResponse({ error: false, data: { tasks: [] } }),
      );

      await expect(
        buildClient().listSessionTasks('gazelle', 'abc'),
      ).rejects.toMatchObject({ name: 'UpstreamError' });
      warnSpy.mockRestore();
    });

    it('still resolves when only some tasks were unreadable', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      fetchMock.mockResolvedValue(jsonResponse(tasksMalformed));

      const tasks = await buildClient().listSessionTasks('golem', 'abc');

      expect(tasks).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('skipped 3 unreadable task rows'),
      );
      warnSpy.mockRestore();
    });

    it('reports its own drift even after the sessions list burned the same kind', async () => {
      // The dedupe key includes the endpoint. Without it, one dropped row in the
      // sessions list would permanently silence a task list that later dropped
      // thirty — rendering half a conversation with nothing logged anywhere. This
      // test previously had to use a *different* installation to see its warning,
      // which was the symptom.
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      fetchMock.mockResolvedValue(
        jsonResponse({ error: false, data: [{ id: 'good' }, null] }),
      );
      await buildClient().listSessions('graveler');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('kagent sessions response drift'),
      );

      warnSpy.mockClear();
      fetchMock.mockResolvedValue(jsonResponse(tasksMalformed));
      await buildClient().listSessionTasks('graveler', 'abc');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('kagent session tasks response drift'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('deleteSession', () => {
    /** kagent's actual success response: a 200 carrying its usual envelope. */
    function deleted() {
      return jsonResponse({
        error: false,
        data: {},
        message: 'Session deleted successfully',
      });
    }

    it('sends a DELETE for the session, with the minted token', async () => {
      fetchMock.mockResolvedValue(deleted());

      await buildClient().deleteSession('gazelle', 'abc123');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://backend/api/agent-platform/kagent/sessions/abc123?installation=gazelle',
      );
      expect(init.method).toBe('DELETE');
      expect(init.headers[KAGENT_AUTH_HEADER]).toBe('dex-token');
    });

    it('escapes a session id that is not URL-safe', async () => {
      fetchMock.mockResolvedValue(deleted());

      await buildClient().deleteSession('gazelle', 'a/b?c=d');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://backend/api/agent-platform/kagent/sessions/a%2Fb%3Fc%3Dd?installation=gazelle',
      );
    });

    it('leaves the reads on GET', async () => {
      // The transport now takes a method. Nothing else would catch a change that
      // sent every read as a DELETE.
      fetchMock.mockImplementation(async () => jsonResponse({ error: false }));
      const client = buildClient();

      await client.listSessions('gazelle');
      await client.getIdentity('gazelle');

      for (const [, init] of fetchMock.mock.calls) {
        expect(init.method).toBeUndefined();
      }
    });

    it('succeeds on a 2xx with no body', async () => {
      // kagent answers 200 with an envelope today, but nothing here needs it. A
      // version answering 204 (or an empty body) has still done the delete, and
      // demanding JSON would report that as a failure.
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      } as unknown as Response);

      await expect(
        buildClient().deleteSession('gazelle', 'abc123'),
      ).resolves.toBeUndefined();
    });

    it('throws on an error reported in-band on a 200', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          error: true,
          message: 'failed to delete session: database connection lost',
        }),
      );

      await expect(
        buildClient().deleteSession('gazelle', 'abc123'),
      ).rejects.toMatchObject({
        name: 'UpstreamError',
        message: 'failed to delete session: database connection lost',
      });
    });

    it('still throws when an in-band error says nothing', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: true }));

      await expect(
        buildClient().deleteSession('gazelle', 'abc123'),
      ).rejects.toMatchObject({ name: 'UpstreamError' });
    });

    it.each([
      [403, 'ForbiddenError'],
      [404, 'NotFoundError'],
      [500, 'Error'],
    ])('maps a %s to %s', async (status, expectedName) => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'nope' } }, status),
      );

      await expect(
        buildClient().deleteSession('gazelle', 'abc123'),
      ).rejects.toMatchObject({ name: expectedName, message: 'nope' });
    });
  });

  describe('renameSession', () => {
    it('PUTs the new name as JSON, with the installation and the token', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: false }));

      await buildClient().renameSession('gazelle', 'abc123', 'New name');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://backend/api/agent-platform/kagent/sessions/abc123?installation=gazelle',
      );
      expect(init.method).toBe('PUT');
      // Without this the backend's `express.json()` never parses the body, and the
      // route rejects a perfectly good name as missing.
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers[KAGENT_AUTH_HEADER]).toBe('dex-token');
      expect(JSON.parse(init.body)).toEqual({ name: 'New name' });
    });

    it('sends only the name', async () => {
      // agentRef/source used to ride along for the backend's kagent v0.9.x
      // workaround. The backend now reads them from kagent itself, so a stale
      // value from here can no longer blank a column.
      fetchMock.mockResolvedValue(jsonResponse({ error: false }));

      await buildClient().renameSession('gazelle', 'abc123', 'New name');

      expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body))).toEqual([
        'name',
      ]);
    });

    it('does not label a rejected name as a missing kagent', async () => {
      // `throwIfNotOk` renames a 400 to `NotFoundError` for the reads, where the
      // only 400 the proxy produces means "this installation has no kagent
      // endpoint" and is meant to be silent. This route also answers 400 for a
      // name it refuses, which is nothing like that — and the plugin's retry
      // predicate and the sessions provider both branch on the name.
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'name must not be empty' } }, 400),
      );

      await expect(
        buildClient().renameSession('gazelle', 'abc123', ' '),
      ).rejects.toMatchObject({
        name: 'Error',
        message: 'name must not be empty',
      });
    });

    it('still labels a read’s 400 as a missing kagent', async () => {
      // The other half of the same guard: the reads must keep the old mapping.
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'unknown installation' } }, 400),
      );

      await expect(buildClient().listSessions('gazelle')).rejects.toMatchObject(
        { name: 'NotFoundError' },
      );
    });

    it('encodes an awkward session id into the path', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: false }));

      await buildClient().renameSession('gazelle', 'a/b?c=d', 'New name');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://backend/api/agent-platform/kagent/sessions/a%2Fb%3Fc%3Dd?installation=gazelle',
      );
    });

    it('succeeds on a 2xx with no body', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      } as unknown as Response);

      await expect(
        buildClient().renameSession('gazelle', 'abc123', 'New name'),
      ).resolves.toBeUndefined();
    });

    it('throws on an error reported in-band on a 200', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: true, message: 'failed to update session' }),
      );

      await expect(
        buildClient().renameSession('gazelle', 'abc123', 'New name'),
      ).rejects.toMatchObject({
        name: 'UpstreamError',
        message: 'failed to update session',
      });
    });

    it.each([
      [403, 'ForbiddenError'],
      [404, 'NotFoundError'],
      [500, 'Error'],
    ])('maps a %s to %s', async (status, expectedName) => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'nope' } }, status),
      );

      await expect(
        buildClient().renameSession('gazelle', 'abc123', 'New name'),
      ).rejects.toMatchObject({ name: expectedName, message: 'nope' });
    });
  });

  describe('sendMessage', () => {
    const AGENT = { namespace: 'kagent', name: 'issue-tracker' };
    const MESSAGE = { messageId: 'msg-1', text: 'why is the ingress failing?' };

    it('POSTs the message as JSON, with the installation and the token', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: false }));

      await buildClient().sendMessage('gazelle', 'abc123', AGENT, MESSAGE);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://backend/api/agent-platform/kagent/sessions/abc123/messages?installation=gazelle',
      );
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers[KAGENT_AUTH_HEADER]).toBe('dex-token');
      expect(JSON.parse(init.body)).toEqual({
        agentNamespace: 'kagent',
        agentName: 'issue-tracker',
        messageId: 'msg-1',
        text: 'why is the ingress failing?',
      });
    });

    it('sends the agent’s real names rather than anything decoded', async () => {
      // kagent's stored `agent_id` rewrites every `-` to `_`, so a name containing
      // an underscore cannot be recovered from it. These come from the Agent
      // resource and must travel untouched.
      fetchMock.mockResolvedValue(jsonResponse({ error: false }));

      await buildClient().sendMessage(
        'gazelle',
        'abc123',
        { namespace: 'my_ns', name: 'my_agent-1' },
        MESSAGE,
      );

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        agentNamespace: 'my_ns',
        agentName: 'my_agent-1',
      });
    });

    it('does not label a rejected message as a missing kagent', async () => {
      // Same guard as the rename: this route answers 400 for a message it
      // refuses, which must not be renamed to `NotFoundError` and silenced.
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'text must not be empty' } }, 400),
      );

      await expect(
        buildClient().sendMessage('gazelle', 'abc123', AGENT, MESSAGE),
      ).rejects.toMatchObject({
        name: 'Error',
        message: 'text must not be empty',
      });
    });

    it('treats a 202 as a success', async () => {
      // The turn outlived the backend's turn timeout and is still running. There
      // is nothing for the caller to do differently: the conversation poll is
      // what reports how it ends.
      fetchMock.mockResolvedValue(jsonResponse({ status: 'pending' }, 202));

      await expect(
        buildClient().sendMessage('gazelle', 'abc123', AGENT, MESSAGE),
      ).resolves.toBeUndefined();
    });

    it('encodes an awkward session id into the path', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: false }));

      await buildClient().sendMessage('gazelle', 'a/b?c=d', AGENT, MESSAGE);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://backend/api/agent-platform/kagent/sessions/a%2Fb%3Fc%3Dd/messages?installation=gazelle',
      );
    });

    it('throws on an error reported in-band on a 200', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: true, message: 'agent unreachable' }),
      );

      await expect(
        buildClient().sendMessage('gazelle', 'abc123', AGENT, MESSAGE),
      ).rejects.toMatchObject({
        name: 'UpstreamError',
        message: 'agent unreachable',
      });
    });

    it.each([
      [401, 'UnauthorizedError'],
      [403, 'ForbiddenError'],
      [404, 'NotFoundError'],
      [503, 'ServiceUnavailableError'],
    ])('maps %i to %s', async (status, expectedName) => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'nope' } }, status),
      );

      await expect(
        buildClient().sendMessage('gazelle', 'abc123', AGENT, MESSAGE),
      ).rejects.toMatchObject({ name: expectedName, message: 'nope' });
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
