import {
  buildAnthropicProviderOptions,
  usesAdaptiveThinking,
  LEGACY_THINKING_BUDGET_TOKENS,
} from './anthropicProviderOptions';

describe('usesAdaptiveThinking', () => {
  it.each([
    'claude-opus-4-5',
    'claude-opus-4-6',
    'claude-opus-4-7',
    'claude-opus-4-8',
    'claude-sonnet-4-6',
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-fable-5',
    'claude-fable-5-1',
  ])('returns true for adaptive-thinking model %s', model => {
    expect(usesAdaptiveThinking(model)).toBe(true);
  });

  it('matches date-suffixed IDs via the family prefix', () => {
    expect(usesAdaptiveThinking('claude-opus-4-8-20260101')).toBe(true);
  });

  it.each([
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-1',
    'claude-3-5-sonnet',
    'claude-3-haiku',
  ])('returns false for legacy Claude model %s', model => {
    expect(usesAdaptiveThinking(model)).toBe(false);
  });
});

describe('buildAnthropicProviderOptions', () => {
  it('returns undefined for non-Anthropic models', () => {
    expect(
      buildAnthropicProviderOptions({
        modelName: 'gpt-4o-mini',
        isAnthropicModel: false,
      }),
    ).toBeUndefined();
  });

  it('uses adaptive thinking with the default effort for Opus 4.8', () => {
    expect(
      buildAnthropicProviderOptions({
        modelName: 'claude-opus-4-8',
        isAnthropicModel: true,
      }),
    ).toEqual({ thinking: { type: 'adaptive' }, effort: 'high' });
  });

  it('honors an explicit effort for adaptive-thinking models', () => {
    expect(
      buildAnthropicProviderOptions({
        modelName: 'claude-opus-4-8',
        isAnthropicModel: true,
        effort: 'max',
      }),
    ).toEqual({ thinking: { type: 'adaptive' }, effort: 'max' });
  });

  it.each([
    'claude-opus-4-5',
    'claude-sonnet-4-6',
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-fable-5-1',
  ])('uses adaptive thinking for %s', model => {
    expect(
      buildAnthropicProviderOptions({
        modelName: model,
        isAnthropicModel: true,
      }),
    ).toEqual({ thinking: { type: 'adaptive' }, effort: 'high' });
  });

  it('never sends a thinking budget for Sonnet 5, which rejects it with a 400', () => {
    const options = buildAnthropicProviderOptions({
      modelName: 'claude-sonnet-5',
      isAnthropicModel: true,
    });

    expect(options).toEqual({ thinking: { type: 'adaptive' }, effort: 'high' });
    expect(options).not.toHaveProperty('thinking.budgetTokens');
  });

  // `claude-sonnet-4-5` ends in -5 but is not a Claude 5 model: it must keep
  // the legacy budget shape.
  it.each([
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-1',
    'claude-3-5-sonnet',
  ])('uses the legacy thinking budget for %s', model => {
    expect(
      buildAnthropicProviderOptions({
        modelName: model,
        isAnthropicModel: true,
        // An effort value is ignored for legacy models.
        effort: 'max',
      }),
    ).toEqual({
      thinking: {
        type: 'enabled',
        budgetTokens: LEGACY_THINKING_BUDGET_TOKENS,
      },
    });
  });
});
