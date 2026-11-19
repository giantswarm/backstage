import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelLabel } from './modelLabel';

function fakeModelConfig({
  displayName,
  model,
  chatGpt = false,
}: {
  displayName?: string;
  model?: string;
  chatGpt?: boolean;
}): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: 'anthropic',
        namespace: 'kagent',
        annotations:
          displayName === undefined
            ? undefined
            : { 'ui.giantswarm.io/display-name': displayName },
      },
      spec:
        model === undefined
          ? undefined
          : {
              provider: chatGpt ? 'OpenAI' : 'Anthropic',
              model,
              ...(chatGpt
                ? { openAI: { credentialType: 'chatgptOAuth' } }
                : {}),
            },
    } as unknown as ModelConfigInterface,
    'gazelle',
  );
}

describe('modelLabel', () => {
  it('keeps an admin-chosen display name', () => {
    expect(
      modelLabel(
        fakeModelConfig({
          displayName: 'The Cheap One',
          model: 'claude-haiku-4-5',
        }),
      ),
    ).toBe('The Cheap One');
  });

  it('names the model when there is no display name', () => {
    expect(modelLabel(fakeModelConfig({ model: 'claude-sonnet-4-6' }))).toBe(
      'claude-sonnet-4-6',
    );
  });

  it('falls back to the resource name for an incomplete resource without a spec', () => {
    expect(modelLabel(fakeModelConfig({}))).toBe('anthropic');
  });

  it.each(['', '   '])(
    'ignores a blank display-name annotation %j',
    displayName => {
      expect(
        modelLabel(
          fakeModelConfig({ displayName, model: 'claude-sonnet-4-6' }),
        ),
      ).toBe('claude-sonnet-4-6');
    },
  );

  it("names a person's own ChatGPT login as such", () => {
    expect(modelLabel(fakeModelConfig({ chatGpt: true, model: 'gpt-5' }))).toBe(
      'ChatGPT (your subscription)',
    );
  });

  it('keeps the personal ChatGPT label over an admin display name', () => {
    expect(
      modelLabel(
        fakeModelConfig({
          chatGpt: true,
          model: 'gpt-5',
          displayName: 'Custom name',
        }),
      ),
    ).toBe('ChatGPT (your subscription)');
  });

  it('is undefined without a ModelConfig', () => {
    expect(modelLabel(undefined)).toBeUndefined();
  });
});
