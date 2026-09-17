import { NotFoundError } from '@backstage/errors';
import {
  completionsTarget,
  TRY_PROMPT,
  tryServedModel,
} from './tryServedModel';

const loaded = {
  loaded: [
    {
      name: 'Qwen/Qwen3-4B-Instruct-2507',
      backend: 'kserve',
      resource: 'qwen3-4b-instruct',
      kind: 'LLMInferenceService',
      status: 'Ready',
      phase: 'ready',
      endpoint:
        'https://models.gazelle.example/model-serving/qwen3-4b-instruct/',
    },
    { name: 'llama3.2', backend: 'ollama', endpoint: 'http://10.0.0.5:11434' },
  ],
};

describe('completionsTarget', () => {
  it('posts to the served model’s endpoint as model-manager reports it, with the serving object’s name as the model id', () => {
    expect(completionsTarget(loaded, 'qwen3-4b-instruct')).toEqual({
      url: 'https://models.gazelle.example/model-serving/qwen3-4b-instruct/v1/chat/completions',
      model: 'qwen3-4b-instruct',
    });
    expect(completionsTarget(loaded, 'Qwen/Qwen3-4B-Instruct-2507').model).toBe(
      'qwen3-4b-instruct',
    );
  });

  it('refuses a model that is not serving, and one without an endpoint yet', () => {
    expect(() => completionsTarget(loaded, 'nope')).toThrow(NotFoundError);
    expect(() =>
      completionsTarget(
        { loaded: [{ resource: 'pending-one', endpoint: '' }] },
        'pending-one',
      ),
    ).toThrow(/no endpoint/);
    expect(() => completionsTarget(undefined, 'x')).toThrow(NotFoundError);
  });
});

describe('tryServedModel', () => {
  it('sends one completion without a token and one as the person, and reports both', async () => {
    const calls: { url: string; headers: Record<string, string>; body: any }[] =
      [];
    const fetchFn = jest.fn(async (url: any, init: any) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url: String(url), headers, body: JSON.parse(init.body) });
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
      loaded,
      model: 'qwen3-4b-instruct',
      userToken: 'id-token',
      fetchFn,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[1].headers.Authorization).toBe('Bearer id-token');
    calls.forEach(call => {
      expect(call.url).toBe(
        'https://models.gazelle.example/model-serving/qwen3-4b-instruct/v1/chat/completions',
      );
      expect(call.body).toEqual({
        model: 'qwen3-4b-instruct',
        messages: [{ role: 'user', content: TRY_PROMPT }],
        max_tokens: 16,
        temperature: 0,
      });
    });
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
      loaded,
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
      loaded,
      model: 'qwen3-4b-instruct',
      userToken: 't',
      fetchFn: dead,
    });
    expect(unreachable.without).toEqual({ status: 0, error: 'ECONNREFUSED' });
    expect(unreachable.with.status).toBe(0);
  });
});
