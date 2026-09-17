import { InputError } from '@backstage/errors';
import { completionsUrl, TRY_PROMPT, tryServedModel } from './tryServedModel';

describe('completionsUrl', () => {
  it('posts to the served model’s endpoint under the installation’s domain', () => {
    expect(
      completionsUrl(
        'https://models.gazelle.example/model-serving/qwen3-4b-instruct/',
        'gazelle.example',
      ),
    ).toBe(
      'https://models.gazelle.example/model-serving/qwen3-4b-instruct/v1/chat/completions',
    );
    expect(
      completionsUrl(
        'https://Models.Gazelle.Example/x?y=1#z',
        'gazelle.example',
      ),
    ).toBe('https://models.gazelle.example/x/v1/chat/completions');
    expect(completionsUrl('https://gazelle.example/', 'gazelle.example')).toBe(
      'https://gazelle.example/v1/chat/completions',
    );
  });

  it('refuses another host, a look-alike domain, plain http, a non-URL and an installation without a base domain', () => {
    expect(() =>
      completionsUrl('https://models.other.example/x', 'gazelle.example'),
    ).toThrow(InputError);
    expect(() =>
      completionsUrl('https://notgazelle.example/x', 'gazelle.example'),
    ).toThrow(/not under the installation's domain/);
    expect(() =>
      completionsUrl('http://models.gazelle.example/x', 'gazelle.example'),
    ).toThrow(/https/);
    expect(() => completionsUrl('not a url', 'gazelle.example')).toThrow(
      /not a URL/,
    );
    expect(() =>
      completionsUrl('https://models.gazelle.example/x', undefined),
    ).toThrow(/no base domain/);
  });
});

describe('tryServedModel', () => {
  const url =
    'https://models.gazelle.example/model-serving/qwen3-4b-instruct/v1/chat/completions';

  it('sends one completion without a token and one as the person, and reports both', async () => {
    const calls: { url: string; headers: Record<string, string>; body: any }[] =
      [];
    const fetchFn = jest.fn(async (target: any, init: any) => {
      const headers = init.headers as Record<string, string>;
      calls.push({
        url: String(target),
        headers,
        body: JSON.parse(init.body),
      });
      if (!headers.Authorization) {
        return new Response('authentication failure: no bearer token found', {
          status: 401,
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: ' pong\n' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const result = await tryServedModel({
      url,
      model: 'qwen3-4b-instruct',
      userToken: 'id-token',
      fetchFn,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[1].headers.Authorization).toBe('Bearer id-token');
    calls.forEach(call => {
      expect(call.url).toBe(url);
      expect(call.body).toEqual({
        model: 'qwen3-4b-instruct',
        messages: [{ role: 'user', content: TRY_PROMPT }],
        max_tokens: 16,
        temperature: 0,
      });
    });
    expect(result.url).toBe(url);
    expect(result.model).toBe('qwen3-4b-instruct');
    expect(result.without).toEqual({
      status: 401,
      error: 'authentication failure: no bearer token found',
    });
    expect(result.with.status).toBe(200);
    expect(result.with.content).toBe('pong');
    expect(result.with.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a gateway refusal of the person’s token with the body’s excerpt, and a dead endpoint as status 0', async () => {
    const refusing = jest.fn(
      async () =>
        new Response('token uses the unknown key "1b07"', { status: 401 }),
    ) as unknown as typeof fetch;
    const refused = await tryServedModel({
      url,
      model: 'qwen3-4b-instruct',
      userToken: 'stale',
      fetchFn: refusing,
    });
    expect(refused.with.status).toBe(401);
    expect(refused.with.error).toBe('token uses the unknown key "1b07"');

    const dead = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const unreachable = await tryServedModel({
      url,
      model: 'qwen3-4b-instruct',
      userToken: 't',
      fetchFn: dead,
    });
    expect(unreachable.without).toEqual({ status: 0, error: 'ECONNREFUSED' });
    expect(unreachable.with.status).toBe(0);
  });
});
