import { githubGraphql, isUnreadableRepoError } from './githubGraphql';
import { isTransientError } from './errors';

describe('githubGraphql', () => {
  it('posts the query and variables with the token', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } })));

    const body = await githubGraphql<{ ok: boolean }>({
      query: 'query { ok }',
      variables: { a: 1 },
      token: 't0ken',
      fetchImpl,
    });

    expect(body).toEqual({ data: { ok: true } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/graphql');
    expect(init.headers.Authorization).toBe('Bearer t0ken');
    expect(JSON.parse(init.body)).toEqual({
      query: 'query { ok }',
      variables: { a: 1 },
    });
  });

  it('throws on a non-2xx answer, recognisably transient for a 502', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response('', { status: 502, statusText: 'Bad Gateway' }),
      );

    const error = await githubGraphql({
      query: 'query { ok }',
      variables: {},
      token: 't',
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('502 Bad Gateway'),
      }),
    );
    expect(isTransientError(error)).toBe(true);
  });
});

describe('githubGraphql rate limits', () => {
  const call = (response: Response) =>
    githubGraphql({
      query: 'query { ok }',
      variables: {},
      token: 't',
      fetchImpl: jest.fn().mockResolvedValue(response),
    }).catch((e: unknown) => e);

  it.each([
    [
      'a RATE_LIMITED error in a 200 body',
      new Response(
        JSON.stringify({
          errors: [
            { type: 'RATE_LIMITED', message: 'API rate limit exceeded' },
          ],
        }),
      ),
    ],
    [
      'a primary limit 403',
      new Response('', {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    ],
    [
      'a secondary limit 403 with retry-after',
      new Response('', {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'retry-after': '60' },
      }),
    ],
    [
      'a secondary limit 403 by its message',
      new Response(
        JSON.stringify({
          message: 'You have exceeded a secondary rate limit.',
        }),
        { status: 403, statusText: 'Forbidden' },
      ),
    ],
  ])('treats %s as transient', async (_name, response) => {
    const error = await call(response);

    expect(error).toEqual(
      expect.objectContaining({ name: 'GithubRateLimitError' }),
    );
    expect(isTransientError(error)).toBe(true);
  });

  it('does not treat any other 403 as transient', async () => {
    const error = await call(
      new Response(JSON.stringify({ message: 'Resource not accessible' }), {
        status: 403,
        statusText: 'Forbidden',
      }),
    );

    expect(isTransientError(error)).toBe(false);
  });
});

describe('isUnreadableRepoError', () => {
  it.each([
    ['NOT_FOUND', true],
    ['FORBIDDEN', true],
    ['RATE_LIMITED', false],
    [undefined, false],
  ])('%p → %p', (type, expected) => {
    expect(isUnreadableRepoError({ message: 'm', type })).toBe(expected);
  });
});
