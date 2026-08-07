import { mockServices } from '@backstage/backend-test-utils';
import {
  deriveKagentApiBaseUrl,
  KagentClient,
  readKagentInstallationsFromConfig,
} from './KagentClient';

describe('deriveKagentApiBaseUrl', () => {
  it('derives the oauth2-proxy-fronted kagent host', () => {
    expect(deriveKagentApiBaseUrl('gazelle.awsprod.gigantic.io')).toBe(
      'https://kagent.gazelle.awsprod.gigantic.io/api',
    );
  });

  it('returns undefined without a base domain', () => {
    expect(deriveKagentApiBaseUrl(undefined)).toBeUndefined();
    expect(deriveKagentApiBaseUrl('')).toBeUndefined();
  });
});

describe('readKagentInstallationsFromConfig', () => {
  const logger = mockServices.logger.mock();

  function read(data: object) {
    return readKagentInstallationsFromConfig(
      mockServices.rootConfig({ data }),
      logger,
    );
  }

  it('derives every gs installation that has a base domain', () => {
    const result = read({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          golem: { baseDomain: 'golem.example.io' },
        },
      },
    });

    expect([...result.keys()]).toEqual(['gazelle', 'golem']);
    expect(result.get('gazelle')?.apiBaseUrl).toBe(
      'https://kagent.gazelle.example.io/api',
    );
  });

  it('skips installations without a base domain', () => {
    const result = read({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          nodomain: {},
        },
      },
    });

    expect([...result.keys()]).toEqual(['gazelle']);
  });

  it('treats an explicit block as the allowlist', () => {
    const result = read({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          golem: { baseDomain: 'golem.example.io' },
        },
      },
      agentPlatform: { kagent: { installations: { golem: {} } } },
    });

    expect([...result.keys()]).toEqual(['golem']);
    // An empty entry still derives from the base domain.
    expect(result.get('golem')?.apiBaseUrl).toBe(
      'https://kagent.golem.example.io/api',
    );
  });

  it('lets apiBaseUrl override the derived URL', () => {
    const result = read({
      gs: { installations: { golem: { baseDomain: 'golem.example.io' } } },
      agentPlatform: {
        kagent: {
          installations: {
            golem: {
              apiBaseUrl: 'https://agentgateway.golem.example.io/kagent/api',
            },
          },
        },
      },
    });

    expect(result.get('golem')?.apiBaseUrl).toBe(
      'https://agentgateway.golem.example.io/kagent/api',
    );
  });

  it('allows an override for an installation with no base domain', () => {
    const result = read({
      gs: { installations: { local: {} } },
      agentPlatform: {
        kagent: {
          installations: { local: { apiBaseUrl: 'http://localhost:8083/api' } },
        },
      },
    });

    expect(result.get('local')?.apiBaseUrl).toBe('http://localhost:8083/api');
  });

  it.each([
    ['a scheme-less host', 'kagent.example.io/api'],
    ['a protocol-relative URL', '//kagent.example.io/api'],
    ['a bare path', '/api'],
    ['a non-http scheme', 'ftp://kagent.example.io/api'],
    ['nonsense', 'not a url'],
  ])('skips an installation whose apiBaseUrl is %s', (_label, apiBaseUrl) => {
    // Caught at startup with one clear message rather than failing opaquely on
    // every request.
    const result = read({
      gs: { installations: { golem: {} } },
      agentPlatform: { kagent: { installations: { golem: { apiBaseUrl } } } },
    });

    expect(result.size).toBe(0);
  });

  it('strips trailing slashes', () => {
    const result = read({
      gs: { installations: { golem: {} } },
      agentPlatform: {
        kagent: {
          installations: { golem: { apiBaseUrl: 'https://kagent.x/api/' } },
        },
      },
    });

    expect(result.get('golem')?.apiBaseUrl).toBe('https://kagent.x/api');
  });

  it('returns an empty map when nothing is configured', () => {
    expect(read({}).size).toBe(0);
  });
});

describe('KagentClient', () => {
  const logger = mockServices.logger.mock();
  const installation = {
    name: 'gazelle',
    apiBaseUrl: 'https://kagent.gazelle.example.io/api',
  };

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function build(fetchFn: jest.Mock) {
    return new KagentClient(
      installation,
      logger,
      fetchFn as unknown as typeof fetch,
      5_000,
    );
  }

  it('requests the sessions path with the expected headers', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ error: false }));

    await build(fetchFn).listSessions({ userToken: 'user-token' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://kagent.gazelle.example.io/api/sessions');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer user-token',
    });
    // An oauth2-proxy redirect into Dex must surface as an error, not be
    // followed into a 200 HTML sign-in page.
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
  });

  it('omits the Authorization header when no token is given', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

    await build(fetchFn).getMe({});

    expect(fetchFn.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('only ever requests paths under the configured API base URL', async () => {
    // Everything must stay under `/api`: that is the only prefix either door
    // proxies to the controller. The derived door's nginx sends `/` to the
    // kagent UI, and the agentgateway override only matches `/kagent` — so a
    // root-relative path (as a `/version` probe would need) never reaches
    // kagent at all.
    // A fresh Response per call: a body can only be read once.
    const fetchFn = jest.fn().mockImplementation(async () => jsonResponse({}));
    const client = build(fetchFn);

    await client.listSessions({ userToken: 't' });
    await client.getMe({ userToken: 't' });
    await client.getSession('abc', { userToken: 't' });
    await client.listSessionTasks('abc', { userToken: 't' });

    for (const [url] of fetchFn.mock.calls) {
      expect(url).toMatch(/^https:\/\/kagent\.gazelle\.example\.io\/api\//);
    }
  });

  describe('session detail', () => {
    it('requests one session under the sessions path, asking for no events', async () => {
      // kagent bundles the session's stored events into this response and they
      // dominate it — 591 KB of events against 261 bytes of session metadata on a
      // real 4-turn session. Nothing reads them, so `limit=1` trims the response by
      // ~99%. A version that ignored `limit` would just return everything, which
      // is today's behaviour, so this can only help.
      //
      // If this assertion fails because someone changed the value: `limit=0` does
      // NOT mean "no events". kagent gates its LIMIT clause on `opts.Limit > 0`, so
      // zero reads as *unlimited* and restores the full payload. `1` is the
      // smallest value that limits anything.
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

      await build(fetchFn).getSession('abc123', { userToken: 't' });

      expect(fetchFn.mock.calls[0][0]).toBe(
        'https://kagent.gazelle.example.io/api/sessions/abc123?limit=1',
      );
    });

    it('requests the session tasks path', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

      await build(fetchFn).listSessionTasks('abc123', { userToken: 't' });

      expect(fetchFn.mock.calls[0][0]).toBe(
        'https://kagent.gazelle.example.io/api/sessions/abc123/tasks',
      );
    });

    it('sends no A2A-Version header, so kagent answers on the legacy wire', async () => {
      // kagent's NegotiateA2AWireVersion treats a missing header as the legacy v0
      // wire on both v0.9.9 and v0.10 — the shape kagent's own UI consumes, and so
      // the best-tested one. Asserted so a header is not added casually.
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

      await build(fetchFn).listSessionTasks('abc123', { userToken: 't' });

      expect(fetchFn.mock.calls[0][1].headers).toEqual({
        Accept: 'application/json',
        Authorization: 'Bearer t',
      });
    });

    it('escapes a session id that is not URL-safe', async () => {
      // Session ids are opaque. Real ones are hex or UUIDs, but nothing in kagent
      // guarantees that, so the id must never be interpolated raw — a `/` or `?`
      // would otherwise retarget the request.
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

      await build(fetchFn).getSession('a/b?c=d', { userToken: 't' });

      expect(fetchFn.mock.calls[0][0]).toBe(
        'https://kagent.gazelle.example.io/api/sessions/a%2Fb%3Fc%3Dd?limit=1',
      );
    });

    it('returns the tasks body verbatim, including unknown fields', async () => {
      const body = {
        error: false,
        data: [
          {
            id: 'task-1',
            contextId: 'ctx-1',
            kind: 'task',
            status: { state: 'completed', timestamp: '2026-07-23T16:09:58Z' },
            history: [
              { kind: 'message', messageId: 'm1', role: 'user', parts: [] },
            ],
            some_future_field: 'kept',
          },
        ],
        message: 'Successfully retrieved session tasks',
      };
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse(body));

      const result = await build(fetchFn).listSessionTasks('abc123', {
        userToken: 't',
      });

      expect(result).toEqual(body);
    });
  });

  describe('session delete', () => {
    it('sends a DELETE to the session path, with the forwarded token', async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        jsonResponse({
          error: false,
          data: {},
          message: 'Session deleted successfully',
        }),
      );

      await build(fetchFn).deleteSession('abc123', {
        userToken: 'user-token',
      });

      const [url, init] = fetchFn.mock.calls[0];
      // No `limit` here: unlike the read, nothing comes back that needs trimming.
      expect(url).toBe('https://kagent.gazelle.example.io/api/sessions/abc123');
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({
        Accept: 'application/json',
        Authorization: 'Bearer user-token',
      });
      expect(init.redirect).toBe('manual');
    });

    it('leaves the reads on GET', async () => {
      // The method is now a parameter, so this pins the default: a typo that sent
      // every read as a DELETE would otherwise be caught by nothing here.
      const fetchFn = jest
        .fn()
        .mockImplementation(async () => jsonResponse({}));
      const client = build(fetchFn);

      await client.listSessions({ userToken: 't' });
      await client.getSession('abc', { userToken: 't' });
      await client.listSessionTasks('abc', { userToken: 't' });
      await client.getMe({ userToken: 't' });

      for (const [, init] of fetchFn.mock.calls) {
        expect(init.method).toBe('GET');
      }
    });

    it('escapes a session id that is not URL-safe', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

      await build(fetchFn).deleteSession('a/b?c=d', { userToken: 't' });

      expect(fetchFn.mock.calls[0][0]).toBe(
        'https://kagent.gazelle.example.io/api/sessions/a%2Fb%3Fc%3Dd',
      );
    });

    it('returns kagent’s envelope verbatim', async () => {
      const body = {
        error: false,
        data: {},
        message: 'Session deleted successfully',
      };
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse(body));

      const result = await build(fetchFn).deleteSession('abc123', {
        userToken: 't',
      });

      expect(result).toEqual(body);
    });

    it('treats a 204 as an empty success, not a sign-in page', async () => {
      // kagent returns 200 with its envelope today. If a version ever answered 204,
      // the deletion has *happened* — and without this the missing content-type
      // hits the sign-in-page guard, so the frontend would keep the confirmation
      // dialog open reporting an auth failure for a session that is already gone.
      const fetchFn = jest
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));

      await expect(
        build(fetchFn).deleteSession('abc', { userToken: 't' }),
      ).resolves.toBeUndefined();
    });

    it('reports an absent route as a version problem', async () => {
      // Defensive only — the route has existed since v0.9.x — but the plain-text
      // 404 must not read as "that session is gone", which is exactly the outcome a
      // user would then stop worrying about.
      const fetchFn = jest.fn().mockResolvedValue(
        new Response('404 page not found', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
      );

      await expect(
        build(fetchFn).deleteSession('abc', { userToken: 't' }),
      ).rejects.toMatchObject({
        name: 'NotFoundError',
        message: expect.stringContaining('has no session delete endpoint'),
      });
    });
  });

  describe('session rename', () => {
    it('PUTs the name to the session path, with the forwarded token', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: false }));

      await build(fetchFn).updateSessionName('abc123', 'New name', {
        userToken: 'user-token',
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe('https://kagent.gazelle.example.io/api/sessions/abc123');
      expect(init.method).toBe('PUT');
      expect(init.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer user-token',
      });
      expect(JSON.parse(init.body)).toEqual({ name: 'New name' });
    });

    it('escapes a session id that is not URL-safe', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

      await build(fetchFn).updateSessionName('a/b?c=d', 'New name', {
        userToken: 't',
      });

      expect(fetchFn.mock.calls[0][0]).toBe(
        'https://kagent.gazelle.example.io/api/sessions/a%2Fb%3Fc%3Dd',
      );
    });

    it('leaves the reads without a body or a content type', async () => {
      // The transport now sends bodies. A read that started sending one would be
      // caught by nothing else here.
      const fetchFn = jest
        .fn()
        .mockImplementation(async () => jsonResponse({}));
      const client = build(fetchFn);

      await client.listSessions({ userToken: 't' });
      await client.getSession('abc', { userToken: 't' });

      for (const [, init] of fetchFn.mock.calls) {
        expect(init.body).toBeUndefined();
        expect(init.headers['Content-Type']).toBeUndefined();
      }
    });

    // TODO(kagent-0.9): delete this block with the fallback it covers.
    describe('the kagent v0.9.x fallback', () => {
      /** A 400, which on v0.9.x means "this kagent cannot rename". */
      const rejected = () =>
        jsonResponse({ error: true, message: 'agent_ref is required' }, 400);

      /** The session read the fallback makes before it writes anything. */
      const readBack = (session: unknown) =>
        jsonResponse({ error: false, data: { session, events: [] } });

      const liveSession = {
        id: 'abc123',
        name: 'Old name',
        agent_id: 'kagent__NS__sre_agent',
      };

      it('reads the session back and upserts it under its own agent', async () => {
        // v0.9.x requires `agent_ref`, looks the session up by the *name* it was
        // given, and never writes the name — so the PUT is answered 400 and the
        // rename has to go through POST /sessions, whose upsert does write it.
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(readBack(liveSession))
          .mockResolvedValueOnce(jsonResponse({ error: false }));

        await build(fetchFn).updateSessionName('abc123', 'New name', {
          userToken: 'user-token',
        });

        expect(fetchFn).toHaveBeenCalledTimes(3);

        // The read is trimmed the same way `getSession` is: the events dominate
        // this payload and nothing here reads them.
        expect(fetchFn.mock.calls[1][0]).toBe(
          'https://kagent.gazelle.example.io/api/sessions/abc123?limit=1',
        );

        const [url, init] = fetchFn.mock.calls[2];
        expect(url).toBe('https://kagent.gazelle.example.io/api/sessions');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({
          id: 'abc123',
          name: 'New name',
          // Echoed from the read, not from the caller: kagent's
          // ConvertToPythonIdentifier is idempotent on an already-encoded id, so
          // this resolves to the same agent.
          agent_ref: 'kagent__NS__sre_agent',
        });
      });

      it('echoes the session own source, so the upsert cannot blank it', async () => {
        // The upsert overwrites `source` from what it is sent, so it has to come
        // from kagent rather than from whatever the caller happened to hold.
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(readBack({ ...liveSession, source: 'user' }))
          .mockResolvedValueOnce(jsonResponse({ error: false }));

        await build(fetchFn).updateSessionName('abc123', 'New name', {
          userToken: 't',
        });

        expect(JSON.parse(fetchFn.mock.calls[2][1].body)).toMatchObject({
          source: 'user',
        });
      });

      it('omits source when the session genuinely has none', async () => {
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(readBack(liveSession))
          .mockResolvedValueOnce(jsonResponse({ error: false }));

        await build(fetchFn).updateSessionName('abc123', 'New name', {
          userToken: 't',
        });

        expect(JSON.parse(fetchFn.mock.calls[2][1].body)).not.toHaveProperty(
          'source',
        );
      });

      it('never writes when the session is already gone', async () => {
        // The safety property of the whole design, and the reason the read-back
        // exists at all: on v0.9.x the PUT answers 400 whether or not the session
        // is there, so its status cannot be trusted to mean "it exists". The
        // upsert *inserts* when nothing conflicts, so without this the rename
        // would resurrect a session someone had just deleted, under its old id.
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(jsonResponse({ error: true }, 404));

        await expect(
          build(fetchFn).updateSessionName('abc123', 'New name', {
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });

        // Two calls: the PUT and the read. Emphatically not a third.
        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(
          fetchFn.mock.calls.some(([, init]) => init?.method === 'POST'),
        ).toBe(false);
      });

      it('never writes when the read comes back without a session', async () => {
        // A readable 200 carrying no session is the same condition as a 404, and
        // falling through would put us straight back to inserting one.
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(jsonResponse({ error: false, data: {} }));

        await expect(
          build(fetchFn).updateSessionName('abc123', 'New name', {
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });

        expect(fetchFn).toHaveBeenCalledTimes(2);
      });

      it('reports a session with no agent as a conflict, not a server error', async () => {
        // `agent_id` is nullable and kagent needs one to accept the upsert. A 5xx
        // here would be a standing Sentry issue on every installation, for
        // something nobody can act on.
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(readBack({ id: 'abc123', name: 'Old name' }));

        await expect(
          build(fetchFn).updateSessionName('abc123', 'New name', {
            userToken: 't',
          }),
        ).rejects.toMatchObject({
          name: 'ConflictError',
          message: expect.stringContaining('has none'),
        });

        expect(fetchFn).toHaveBeenCalledTimes(2);
      });

      it.each([
        ['an unresolvable agent (400)', 400],
        ['a sandbox agent that already has a session (409)', 409],
      ])('reports %s as a conflict, not a server error', async (_l, status) => {
        const fetchFn = jest
          .fn()
          .mockResolvedValueOnce(rejected())
          .mockResolvedValueOnce(readBack(liveSession))
          .mockResolvedValueOnce(jsonResponse({ error: true }, status));

        await expect(
          build(fetchFn).updateSessionName('abc123', 'New name', {
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name: 'ConflictError' });
      });

      it.each([
        [401, 'AuthenticationError'],
        [403, 'NotAllowedError'],
        [404, 'NotFoundError'],
        [500, 'UpstreamError'],
      ])('does not enter the fallback on a %s', async (status, name) => {
        const fetchFn = jest
          .fn()
          .mockResolvedValue(jsonResponse({ error: true }, status));

        await expect(
          build(fetchFn).updateSessionName('abc123', 'New name', {
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name });

        expect(fetchFn).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('requests /me under the API base URL', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ sub: 'a@b.c' }));

    await build(fetchFn).getMe({ userToken: 't' });

    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://kagent.gazelle.example.io/api/me',
    );
  });

  it('returns the body verbatim without unwrapping or filtering', async () => {
    const body = {
      error: false,
      data: [{ id: 'a', source: 'agent', unknown_field: 1 }, { id: 'b' }],
      message: 'Successfully listed sessions',
    };
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(body));

    const result = await build(fetchFn).listSessions({ userToken: 't' });

    expect(result).toEqual(body);
  });

  describe('error mapping', () => {
    it.each([
      [302, 'AuthenticationError'],
      [401, 'AuthenticationError'],
      [403, 'NotAllowedError'],
      [404, 'NotFoundError'],
      // A kagent that answers and fails is deployed but unwell. It must NOT share
      // ServiceUnavailableError with "host unreachable", which the frontend
      // silences as "no kagent here" — that would make a degraded kagent look
      // like an empty account.
      [429, 'UpstreamError'],
      [500, 'UpstreamError'],
      [502, 'UpstreamError'],
      [503, 'UpstreamError'],
      [504, 'UpstreamError'],
    ])('maps status %s to %s', async (status, expectedName) => {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(new Response('', { status } as ResponseInit));

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: expectedName });
    });

    describe('what a 404 actually means', () => {
      /** kagent's error middleware always answers JSON. */
      function kagentNotFound() {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }

      /** An unrouted path falls through to net/http's plain-text handler. */
      function routeNotFound() {
        return new Response('404 page not found', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      it('reports a session that does not exist, not an outage', async () => {
        // The message a user reads when they follow a bookmark to a deleted
        // session. "The kagent API is not available" would claim an outage on a
        // perfectly healthy installation.
        const fetchFn = jest.fn().mockResolvedValue(kagentNotFound());

        await expect(
          build(fetchFn).getSession('abc', { userToken: 't' }),
        ).rejects.toMatchObject({
          name: 'NotFoundError',
          message: expect.stringContaining('That session does not exist'),
        });
      });

      it('reports an absent route as a version problem, not a missing session', async () => {
        // Otherwise an installation running a kagent without this endpoint tells
        // every user "session not found" for every session, forever — and with no
        // version probe there is nothing else to go on.
        const fetchFn = jest.fn().mockResolvedValue(routeNotFound());

        await expect(
          build(fetchFn).listSessionTasks('abc', { userToken: 't' }),
        ).rejects.toMatchObject({
          name: 'NotFoundError',
          message: expect.stringContaining('has no session tasks endpoint'),
        });
      });

      it('does not forward kagent’s own message', async () => {
        // kagent's middleware appends the underlying error, so its session 404
        // reads "Session not found: no rows in result set". Database internals are
        // not something to put in front of a user.
        const fetchFn = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: 'Session not found: no rows in result set',
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          ),
        );

        await expect(
          build(fetchFn).getSession('abc', { userToken: 't' }),
        ).rejects.toMatchObject({
          message: expect.not.stringContaining('no rows in result set'),
        });
      });

      it('keeps the "not available" wording for the fleet-wide routes', async () => {
        // `/sessions` and `/me` are probed across the whole fleet, where a 404
        // genuinely does mean "no kagent here" — the wording the frontend's silent
        // classification is built around.
        const fetchFn = jest
          .fn()
          .mockImplementation(async () => kagentNotFound());
        const client = build(fetchFn);

        await expect(
          client.listSessions({ userToken: 't' }),
        ).rejects.toMatchObject({
          message: expect.stringContaining('is not available for installation'),
        });
        await expect(client.getMe({ userToken: 't' })).rejects.toMatchObject({
          message: expect.stringContaining('is not available for installation'),
        });
      });

      it('still maps every 404 to NotFoundError, whatever the wording', async () => {
        // The status is what keeps this out of Sentry; only the message varies.
        const fetchFn = jest
          .fn()
          .mockImplementation(async () => routeNotFound());
        const client = build(fetchFn);

        for (const call of [
          () => client.getSession('abc', { userToken: 't' }),
          () => client.listSessionTasks('abc', { userToken: 't' }),
          () => client.listSessions({ userToken: 't' }),
        ]) {
          await expect(call()).rejects.toMatchObject({
            name: 'NotFoundError',
          });
        }
      });
    });

    it('treats a 200 HTML body as a sign-in page', async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response('<html>Sign in</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'AuthenticationError' });
    });

    it.each([
      ['DNS failure', 'ENOTFOUND'],
      ['connection refused', 'ECONNREFUSED'],
    ])(
      'maps %s to NotFoundError (nothing is deployed there)',
      async (_label, message) => {
        // Genuinely "no kagent at that host" — the normal outcome across a fleet
        // where only a couple of installations run kagent, so the frontend
        // silences it.
        //
        // A 404 rather than a 503 is load-bearing beyond semantics:
        // MiddlewareFactory.error() logs at `error` for any status >= 500 and the
        // root logger forwards that to Sentry, so a 5xx here would raise an event
        // per kagent-less installation per page view. Never return a 5xx for an
        // expected outcome.
        const fetchFn = jest.fn().mockRejectedValue(new Error(message));

        await expect(
          build(fetchFn).listSessions({ userToken: 't' }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
      },
    );

    it('maps a timeout to UpstreamError, not "not deployed"', async () => {
      // Something answered slowly, so kagent exists and is unwell. Silencing this
      // would drop a slow installation's sessions without a word.
      const timeoutError = new Error(
        'The operation was aborted due to timeout',
      );
      timeoutError.name = 'TimeoutError';
      const fetchFn = jest.fn().mockRejectedValue(timeoutError);

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'UpstreamError' });
    });

    it('names the installation in the error message', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('nope'));

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toThrow(/gazelle/);
    });

    describe('failures while reading the body', () => {
      // The abort signal stays armed after the headers arrive, so the body read
      // is a second chance to fail. kagent answered in all of these cases, so
      // they are upstream failures the frontend surfaces — not the silent
      // "kagent isn't deployed here" path.
      function respondWithBodyError(error: Error) {
        return jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => {
            throw error;
          },
        } as unknown as Response);
      }

      it('maps a mid-stream abort to UpstreamError', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';

        await expect(
          build(respondWithBodyError(abortError)).listSessions({
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name: 'UpstreamError' });
      });

      it('maps invalid or truncated JSON to UpstreamError', async () => {
        const syntaxError = new SyntaxError('Unexpected end of JSON input');

        await expect(
          build(respondWithBodyError(syntaxError)).listSessions({
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name: 'UpstreamError' });
      });

      it('maps a connection reset mid-body to UpstreamError', async () => {
        await expect(
          build(respondWithBodyError(new Error('ECONNRESET'))).listSessions({
            userToken: 't',
          }),
        ).rejects.toMatchObject({ name: 'UpstreamError' });
      });
    });
  });
});
