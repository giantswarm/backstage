import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
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
  return {
    getName: () => 'anthropic',
    getDisplayName: () =>
      chatGpt ? 'ChatGPT (your subscription)' : (displayName ?? 'anthropic'),
    getDisplayNameAnnotation: () => displayName,
    getModel: () => model,
    isPersonalChatGptLogin: () => chatGpt,
  } as unknown as ModelConfig;
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

  it('falls back to the resource name when the model is not set', () => {
    expect(modelLabel(fakeModelConfig({}))).toBe('anthropic');
  });

  it("names a person's own ChatGPT login as such", () => {
    expect(modelLabel(fakeModelConfig({ chatGpt: true, model: 'gpt-5' }))).toBe(
      'ChatGPT (your subscription)',
    );
  });

  it('is undefined without a ModelConfig', () => {
    expect(modelLabel(undefined)).toBeUndefined();
  });
});
