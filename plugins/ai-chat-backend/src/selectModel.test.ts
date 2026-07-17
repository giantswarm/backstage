import { streamText, type LanguageModel } from 'ai';
import {
  selectModel,
  type ProviderName,
  type SelectModelOptions,
} from './selectModel';

/**
 * Identify `AI_UnsupportedModelVersionError` by its stable public name.
 *
 * NB: the SDK's `UnsupportedModelVersionError.isInstance()` cannot be used here
 * -- on ai@7 it matches *any* `AISDKError` (it checks the shared base-class
 * marker), so it would flag the benign offline errors (empty-body
 * `NoOutputGeneratedError`, a stub's `doStream` throw) as version mismatches.
 * The `AI_`-prefixed `name` is the specific, documented identifier for this
 * error (see #37199) and is what the runtime failure in #1926 reported.
 */
function isUnsupportedModelVersionError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'AI_UnsupportedModelVersionError'
  );
}

/**
 * A `fetch` that never touches the network. The compatibility check below only
 * needs model *resolution* (which happens before any HTTP request), so the
 * response body is irrelevant -- any real request would be a bug in the test.
 */
const fakeFetch: typeof globalThis.fetch = async () =>
  new Response('', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

/**
 * Stub google-auth `AuthClient`. `@ai-sdk/google-vertex` mints an OAuth2 token
 * via google-auth-library before every request; injecting a client that returns
 * a static token keeps the Vertex branch fully offline (no service-account file,
 * no metadata-server lookup, no token exchange).
 */
const vertexAuthStub = {
  getAccessToken: async () => ({ token: 'test-token' }),
  getRequestHeaders: async () => ({ Authorization: 'Bearer test-token' }),
  request: async () => ({ data: {} }),
};

/** Baseline options; each test overrides only what it needs. */
function baseOptions(): SelectModelOptions {
  return {
    modelName: 'gpt-4o-mini',
    openai: { api: 'responses' },
    anthropic: {},
    azure: {},
    google: {},
    fetch: fakeFetch,
    googleAuthOptions: { authClient: vertexAuthStub },
  };
}

/**
 * Drive real model resolution through `streamText` and return the
 * `AI_UnsupportedModelVersionError` it produced, if any -- this is the error the
 * `ai` core raises when it and the `@ai-sdk/*` provider disagree on the
 * language-model spec version (the #1926 regression).
 *
 * The error is collected from *every* channel, not just a synchronous throw:
 * `streamText` today validates the spec version synchronously, but that's an
 * implementation detail -- a future SDK could surface it asynchronously through
 * the stream's `onError` instead. We record errors from the synchronous throw
 * and from both `onError` callbacks, then look for the version error among them,
 * so the guard can't silently pass if resolution ever moves off the sync path.
 *
 * Other errors (the fake fetch's empty body producing no finish chunk, a stub's
 * unreachable `doStream`, ...) are expected offline noise and ignored.
 */
async function collectVersionError(
  model: LanguageModel,
): Promise<unknown | undefined> {
  const errors: unknown[] = [];
  try {
    const result = streamText({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      onError: ({ error }) => {
        errors.push(error);
      },
    });
    // Consume so resolution is driven end-to-end.
    await result.consumeStream({
      onError: error => {
        errors.push(error);
      },
    });
  } catch (error) {
    errors.push(error);
  }
  return errors.find(isUnsupportedModelVersionError);
}

async function expectResolvesWithoutVersionError(model: LanguageModel) {
  const error = await collectVersionError(model);
  if (error) {
    // Surface the SDK's own message -- it names the offending provider, model
    // and spec version, which is exactly what a bad bump needs to report.
    throw new Error(
      `streamText rejected the model on a spec-version mismatch: ${
        (error as Error).message
      }`,
    );
  }
}

describe('selectModel provider precedence', () => {
  const cases: Array<{
    name: string;
    options: Partial<SelectModelOptions> & { modelName: string };
    expected: ProviderName;
  }> = [
    {
      name: 'routes claude- models to Anthropic',
      options: { modelName: 'claude-sonnet-4-5', anthropic: { apiKey: 'k' } },
      expected: 'anthropic',
    },
    {
      name: 'routes claude- models to Anthropic even when Azure is configured',
      options: {
        modelName: 'claude-sonnet-4-5',
        anthropic: { apiKey: 'k' },
        azure: { apiKey: 'k', resourceName: 'r' },
      },
      expected: 'anthropic',
    },
    {
      name: 'routes gemini- models to Vertex ahead of the Azure branch',
      options: {
        modelName: 'gemini-2.5-flash',
        google: { project: 'p', location: 'l' },
        // Azure fully configured: gemini must NOT be swallowed by it.
        azure: { apiKey: 'k', resourceName: 'r' },
      },
      expected: 'google-vertex',
    },
    {
      name: 'routes non-claude/gemini models to Azure when Azure is configured',
      options: {
        modelName: 'gpt-4o',
        azure: { apiKey: 'k', resourceName: 'r' },
      },
      expected: 'azure',
    },
    {
      name: 'routes to openai-compatible when openai.api is chat',
      options: {
        modelName: 'some-open-model',
        openai: { api: 'chat', baseUrl: 'http://localhost:8000/v1' },
      },
      expected: 'openai-compatible',
    },
    {
      name: 'falls back to OpenAI by default',
      options: { modelName: 'gpt-4o-mini', openai: { api: 'responses' } },
      expected: 'openai',
    },
  ];

  it.each(cases)('$name', ({ options, expected }) => {
    const { providerName } = selectModel({ ...baseOptions(), ...options });
    expect(providerName).toBe(expected);
  });
});

describe('selectModel core/provider spec-version compatibility', () => {
  // These exercise the exact `ai` + `@ai-sdk/*` resolution path that threw
  // `AI_UnsupportedModelVersionError` for every request in #1926. They are
  // hermetic (injected fetch, stubbed Vertex auth) so they run in normal CI,
  // and intentionally couple to the installed AI-SDK generation: a provider
  // major bump that outpaces the `ai` core will fail these loudly.
  const providerCases: Array<{
    name: ProviderName;
    options: Partial<SelectModelOptions> & { modelName: string };
  }> = [
    {
      name: 'anthropic',
      options: { modelName: 'claude-sonnet-4-5', anthropic: { apiKey: 'k' } },
    },
    {
      name: 'openai',
      options: { modelName: 'gpt-4o-mini', openai: { api: 'responses' } },
    },
    {
      name: 'openai-compatible',
      options: {
        modelName: 'some-open-model',
        openai: { api: 'chat', baseUrl: 'http://localhost:8000/v1' },
      },
    },
    {
      name: 'azure',
      options: {
        modelName: 'gpt-4o',
        azure: { apiKey: 'k', resourceName: 'r' },
      },
    },
    {
      name: 'google-vertex',
      options: {
        modelName: 'gemini-2.5-flash',
        google: { project: 'p', location: 'europe-west1' },
      },
    },
  ];

  it.each(providerCases)(
    'resolves the $name model through streamText without a version error',
    async ({ name, options }) => {
      const merged = { ...baseOptions(), ...options };
      const { model, providerName } = selectModel(merged);
      // Sanity-check the case actually selects the provider under test, so a
      // future precedence change can't silently skip a branch here.
      expect(providerName).toBe(name);
      await expectResolvesWithoutVersionError(model);
    },
  );

  it('detects a provider that outruns the core (the guard is not vacuous)', async () => {
    // Guard against the guard silently passing: reproduce the #1926 shape by
    // handing `streamText` a model whose spec version is one generation *ahead*
    // of what the installed core accepts, and assert `collectVersionError`
    // actually surfaces the `AI_UnsupportedModelVersionError`. Deriving the
    // "ahead" version from a real provider's current spec keeps this correct
    // across the next `ai` major bump instead of hardcoding a spec string.
    const { model } = selectModel({
      ...baseOptions(),
      modelName: 'claude-sonnet-4-5',
      anthropic: { apiKey: 'k' },
    });
    const currentSpec = (model as { specificationVersion: string })
      .specificationVersion;
    const aheadSpec = `v${Number(currentSpec.replace(/^v/, '')) + 1}`;
    const aheadModel = {
      specificationVersion: aheadSpec,
      provider: 'simulated',
      modelId: 'simulated-ahead-model',
      supportedUrls: {},
      doStream: async () => {
        throw new Error('resolution should reject before doStream');
      },
      doGenerate: async () => {
        throw new Error('resolution should reject before doGenerate');
      },
    } as unknown as LanguageModel;

    const error = await collectVersionError(aheadModel);
    expect(error).toBeDefined();
    expect(isUnsupportedModelVersionError(error)).toBe(true);
  });
});
