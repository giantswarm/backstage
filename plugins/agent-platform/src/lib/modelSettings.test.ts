import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentManagerError } from './agentManager';
import {
  changedModelSettingsArguments,
  INITIAL_MODEL_SETTINGS,
  modelSettingRefusal,
  modelSettingsSummary,
  newModelSettingsArguments,
  providerSettings,
  storedModelSettings,
  takesModelSettings,
} from './modelSettings';

function modelConfig(spec: Record<string, unknown>): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'm', namespace: 'agents-payments-x7k2q' },
      spec,
    } as unknown as ModelConfigInterface,
    'gazelle',
  );
}

describe('providerSettings', () => {
  // agent-manager's modelSettingsBlocks, not the issue's shorter list.
  it.each([
    ['Anthropic', { maxTokens: true, caching: true }],
    ['OpenAI', { maxTokens: true, caching: false }],
    ['AnthropicVertexAI', { maxTokens: true, caching: false }],
    ['Mistral', { maxTokens: true, caching: false }],
    ['Bedrock', { maxTokens: false, caching: true }],
    ['GeminiVertexAI', { maxTokens: false, caching: false }],
    ['Ollama', { maxTokens: false, caching: false }],
  ])('gives %s its settings', (provider, settings) => {
    expect(providerSettings(provider)).toEqual(settings);
  });
});

describe('takesModelSettings', () => {
  it('needs every setting in the schema', () => {
    expect(
      takesModelSettings({
        properties: { maxTokens: {}, promptCaching: {}, cacheTTL: {} },
      }),
    ).toBe(true);
    expect(takesModelSettings({ properties: { displayName: {} } })).toBe(false);
    expect(takesModelSettings(undefined)).toBe(false);
  });
});

describe('newModelSettingsArguments', () => {
  it('caches a new Anthropic model for 5 minutes by default, with no token limit', () => {
    expect(
      newModelSettingsArguments('Anthropic', INITIAL_MODEL_SETTINGS),
    ).toEqual({ promptCaching: true, cacheTTL: '5m' });
  });

  it('sends only the settings the provider has', () => {
    const values = { ...INITIAL_MODEL_SETTINGS, maxTokens: 1000 };
    expect(newModelSettingsArguments('OpenAI', values)).toEqual({
      maxTokens: 1000,
    });
    expect(newModelSettingsArguments('GeminiVertexAI', values)).toEqual({});
  });
});

describe('changedModelSettingsArguments', () => {
  const stored = {
    maxTokens: 4096,
    promptCaching: true,
    cacheTTL: '1h' as const,
  };

  it('sends nothing for an unchanged model', () => {
    expect(changedModelSettingsArguments('Anthropic', stored, stored)).toEqual(
      {},
    );
  });

  it('removes a cleared token limit with 0', () => {
    expect(
      changedModelSettingsArguments(
        'Anthropic',
        { ...stored, maxTokens: undefined },
        stored,
      ),
    ).toEqual({ maxTokens: 0 });
  });

  it('turns caching off without a cache time', () => {
    expect(
      changedModelSettingsArguments(
        'Anthropic',
        { ...stored, promptCaching: false, cacheTTL: '5m' },
        stored,
      ),
    ).toEqual({ promptCaching: false });
  });
});

describe('storedModelSettings', () => {
  it('reads the provider block', () => {
    expect(
      storedModelSettings(
        modelConfig({
          provider: 'Anthropic',
          anthropic: { maxTokens: 2048, promptCaching: true, cacheTTL: '1h' },
        }),
      ),
    ).toEqual({ maxTokens: 2048, promptCaching: true, cacheTTL: '1h' });
  });

  it('takes unset caching for off, as kagent does', () => {
    expect(storedModelSettings(modelConfig({ provider: 'Anthropic' }))).toEqual(
      { maxTokens: undefined, promptCaching: false, cacheTTL: '5m' },
    );
  });
});

describe('modelSettingsSummary', () => {
  it('says the token limit and the caching', () => {
    expect(
      modelSettingsSummary({
        provider: 'Anthropic',
        maxTokens: 8192,
        promptCaching: true,
        cacheTTL: '5m',
      }),
    ).toEqual({
      tokens: 'Token limit 8,192',
      caching: 'Prompt caching, 5 minutes',
    });
    expect(
      modelSettingsSummary({ provider: 'Anthropic', promptCaching: false }),
    ).toEqual({
      tokens: 'Provider’s token limit',
      caching: 'No prompt caching',
    });
  });

  it('has nothing to say for a provider without settings', () => {
    expect(
      modelSettingsSummary({ provider: 'GeminiVertexAI' }),
    ).toBeUndefined();
  });
});

describe('modelSettingRefusal', () => {
  it('names a setting the provider does not have, without the raw text', () => {
    const message = modelSettingRefusal(
      new AgentManagerError(
        'invalid_request',
        'dry run of create ModelConfig ns/m: strict decoding error: unknown field "spec.openAI.promptCaching"',
      ),
      'OpenAI',
    );
    expect(message).toBe(
      'OpenAI models have no prompt caching, so the setting was refused and nothing was saved. Leave the prompt caching out.',
    );
  });

  it('names a refused value with what to enter', () => {
    expect(
      modelSettingRefusal(
        new AgentManagerError(
          'invalid_request',
          'dry run of update ModelConfig ns/m: spec.anthropic.cacheTTL: Unsupported value: "2h"',
        ),
      ),
    ).toBe(
      'The cache time was refused, and nothing was saved. Choose 5 minutes or 1 hour.',
    );
  });

  it('leaves any other error alone', () => {
    expect(
      modelSettingRefusal(new AgentManagerError('invalid_request', 'location')),
    ).toBeUndefined();
    expect(
      modelSettingRefusal(new AgentManagerError('forbidden', 'maxTokens')),
    ).toBeUndefined();
  });
});
