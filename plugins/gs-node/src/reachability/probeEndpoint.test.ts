import {
  classifyProbeFailure,
  errorCode,
  isTlsErrorCode,
  probeEndpoint,
} from './probeEndpoint';

// The hostname every fixture uses: the reason must never echo it (see the
// module note on messages vs codes), so the assertions below grep for it.
const HOST = 'kagent.golem.example.io';
const URL_UNDER_TEST = `https://${HOST}/api/sessions`;

/** A fetch that answers with the given status and an unread body. */
function answering(status: number): typeof fetch {
  return jest.fn(async () => new Response('ignored', { status }));
}

/** undici's shape for a connection failure: `fetch failed` wrapping the socket error. */
function fetchFailed(code: string, message: string): Error {
  const cause = Object.assign(new Error(message), { code });
  return Object.assign(new TypeError('fetch failed'), { cause });
}

/** A fetch that rejects with `error` without touching the network. */
function failingWith(error: unknown): typeof fetch {
  return jest.fn(async () => {
    throw error;
  });
}

describe('probeEndpoint', () => {
  const now = () => 1_700_000_000_000;

  it.each([200, 401, 403, 404, 500, 302])(
    'treats an HTTP %s as reachable',
    async status => {
      const result = await probeEndpoint(URL_UNDER_TEST, {
        fetchFn: answering(status),
        now,
      });

      expect(result).toEqual({ reachable: true, checkedAt: now() });
    },
  );

  it('sends a plain GET with no credentials and does not follow redirects', async () => {
    const fetchFn = answering(401);

    await probeEndpoint(URL_UNDER_TEST, { fetchFn, now });

    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe(URL_UNDER_TEST);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // The whole point: nothing identifying leaves the portal.
    expect(Object.keys(init.headers).map(h => h.toLowerCase())).toEqual([
      'accept',
    ]);
    expect(init.credentials).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('reports a DNS failure', async () => {
    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(
        fetchFailed('ENOTFOUND', `getaddrinfo ENOTFOUND ${HOST}`),
      ),
      now,
    });

    expect(result).toEqual({
      reachable: false,
      reason: 'DNS lookup failed (ENOTFOUND)',
      checkedAt: now(),
    });
  });

  it('reports a temporary DNS failure as DNS, too', async () => {
    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(
        fetchFailed('EAI_AGAIN', `getaddrinfo EAI_AGAIN ${HOST}`),
      ),
    });

    expect(result.reachable).toBe(false);
    expect(result.reason).toBe('DNS lookup failed (EAI_AGAIN)');
  });

  it('reports a refused connection', async () => {
    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(
        fetchFailed('ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.7:443'),
      ),
    });

    expect(result.reachable).toBe(false);
    expect(result.reason).toBe('connection refused (ECONNREFUSED)');
  });

  it('reports a reset connection', async () => {
    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(fetchFailed('ECONNRESET', 'socket hang up')),
    });

    expect(result.reachable).toBe(false);
    expect(result.reason).toBe('connection reset (ECONNRESET)');
  });

  it.each([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'EPROTO',
  ])('reports a TLS failure (%s) as unreachable, naming TLS', async code => {
    // An installation whose endpoint is an internal service URL presents a
    // certificate the portal may not trust: the route exists, but the portal
    // cannot use it, which is "not reachable from this portal" -- not an answer.
    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(
        fetchFailed(
          code,
          `Hostname/IP does not match certificate's altnames: Host: ${HOST}`,
        ),
      ),
    });

    expect(result.reachable).toBe(false);
    expect(result.reason).toBe(`TLS handshake failed (${code})`);
  });

  it('gives up after the timeout and says so', async () => {
    // A fetch that only ever settles when its signal aborts, as a black-holed
    // host would behave.
    const fetchFn: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(
            Object.assign(new Error('This operation was aborted'), {
              name: 'AbortError',
            }),
          ),
        );
      });

    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn,
      timeoutMs: 20,
      now,
    });

    expect(result).toEqual({
      reachable: false,
      reason: 'no answer within 20 ms',
      checkedAt: now(),
    });
  });

  it('rejects an unparseable URL without touching the network', async () => {
    const fetchFn = answering(200);

    const result = await probeEndpoint('not a url', { fetchFn, now });

    expect(result).toEqual({
      reachable: false,
      reason: 'invalid endpoint URL',
      checkedAt: now(),
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never quotes the host in a reason', async () => {
    const failures = [
      fetchFailed('ENOTFOUND', `getaddrinfo ENOTFOUND ${HOST}`),
      fetchFailed('ECONNREFUSED', `connect ECONNREFUSED ${HOST}:443`),
      fetchFailed(
        'ERR_TLS_CERT_ALTNAME_INVALID',
        `Hostname/IP does not match certificate's altnames: Host: ${HOST}`,
      ),
      Object.assign(new TypeError(`fetch failed for ${HOST}`), {
        cause: new Error(`something odd with ${HOST}`),
      }),
    ];

    for (const failure of failures) {
      const result = await probeEndpoint(URL_UNDER_TEST, {
        fetchFn: failingWith(failure),
      });
      expect(result.reachable).toBe(false);
      expect(result.reason).not.toContain(HOST);
      expect(result.reason).not.toContain('example');
    }
  });

  it('falls back to a generic reason for an unclassified failure', async () => {
    const result = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(new TypeError('fetch failed')),
    });

    expect(result.reason).toBe('connection failed');

    const withCode = await probeEndpoint(URL_UNDER_TEST, {
      fetchFn: failingWith(fetchFailed('EPIPE', 'broken pipe')),
    });

    expect(withCode.reason).toBe('connection failed (EPIPE)');
  });
});

describe('errorCode', () => {
  it('walks the cause chain to the first code', () => {
    const inner = Object.assign(new Error('inner'), { code: 'ECONNRESET' });
    const middle = Object.assign(new Error('middle'), { cause: inner });
    const outer = Object.assign(new TypeError('fetch failed'), {
      cause: middle,
    });

    expect(errorCode(outer)).toBe('ECONNRESET');
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
  });

  it('prefers the outermost code when several are present', () => {
    const inner = Object.assign(new Error('inner'), { code: 'INNER' });
    const outer = Object.assign(new Error('outer'), {
      code: 'OUTER',
      cause: inner,
    });

    expect(errorCode(outer)).toBe('OUTER');
  });
});

describe('classifyProbeFailure', () => {
  it('names a timeout by its budget', () => {
    expect(
      classifyProbeFailure(
        Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
        3000,
      ),
    ).toBe('no answer within 3000 ms');
  });
});

describe('isTlsErrorCode', () => {
  it.each([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'CERT_NOT_YET_VALID',
    'HOSTNAME_MISMATCH',
    'ERR_TLS_HANDSHAKE_TIMEOUT',
    'ERR_SSL_WRONG_VERSION_NUMBER',
    'ERR_OSSL_EVP_UNSUPPORTED',
    'EPROTO',
  ])('recognises %s', code => {
    expect(isTlsErrorCode(code)).toBe(true);
  });

  it.each(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'])(
    'leaves %s alone',
    code => {
      expect(isTlsErrorCode(code)).toBe(false);
    },
  );
});
