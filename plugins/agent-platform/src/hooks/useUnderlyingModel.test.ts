import { underlyingModelLine } from './useUnderlyingModel';

describe('underlyingModelLine', () => {
  it.each([
    ['The Cheap One', 'claude-haiku', 'Anthropic', 'claude-haiku · Anthropic'],
    ['claude-haiku', 'claude-haiku', 'Anthropic', 'Anthropic'],
    [undefined, 'claude-haiku', 'Anthropic', 'claude-haiku · Anthropic'],
    ['claude-haiku', 'claude-haiku', undefined, undefined],
    ['connection', undefined, 'OpenAI', 'OpenAI'],
    ['connection', undefined, undefined, undefined],
  ])(
    'shows details for label %s, model %s and provider %s',
    (label, model, provider, expected) => {
      expect(
        underlyingModelLine(
          { getModel: () => model, getProvider: () => provider },
          label,
        ),
      ).toBe(expected);
    },
  );

  it('has no details without a ModelConfig', () => {
    expect(underlyingModelLine(undefined)).toBeUndefined();
  });
});
