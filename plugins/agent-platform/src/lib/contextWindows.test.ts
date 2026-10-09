import { contextWindowFor, memoryUsage } from './contextWindows';

describe('contextWindowFor', () => {
  const table = {
    'claude-*': 200000,
    'claude-sonnet-4-5*': 1000000,
    'gpt-5': 400000,
  };

  it('matches an exact model name', () => {
    expect(contextWindowFor('gpt-5', table)).toBe(400000);
  });

  it('matches a wildcard pattern', () => {
    expect(contextWindowFor('claude-opus-5', table)).toBe(200000);
  });

  it('prefers the most specific matching pattern, whatever the order', () => {
    expect(contextWindowFor('claude-sonnet-4-5-20250929', table)).toBe(1000000);
  });

  it('matches case-insensitively', () => {
    expect(contextWindowFor('Claude-Opus-5', table)).toBe(200000);
  });

  it('yields nothing for a model the table does not name', () => {
    expect(contextWindowFor('gemini-2.5-pro', table)).toBeUndefined();
  });

  it('yields nothing without a model or a table', () => {
    expect(contextWindowFor(undefined, table)).toBeUndefined();
    expect(contextWindowFor('claude-opus-5', undefined)).toBeUndefined();
  });

  it('ignores entries whose value is not a positive finite number', () => {
    // The table is plain config; a typo must not produce a NaN percentage.
    expect(
      contextWindowFor('claude-opus-5', {
        'claude-*': '200k',
        '*': -1,
      }),
    ).toBeUndefined();
  });

  it('does not treat pattern characters as regex syntax', () => {
    // A dot in a pattern is a dot, not "any character".
    expect(contextWindowFor('gpt-4x1', { 'gpt-4.1': 1047576 })).toBeUndefined();
    expect(contextWindowFor('gpt-4.1', { 'gpt-4.1': 1047576 })).toBe(1047576);
  });
});

describe('memoryUsage', () => {
  it('computes the share of a known window', () => {
    expect(memoryUsage(24000, 200000)).toEqual({
      usedTokens: 24000,
      windowTokens: 200000,
      percent: 12,
    });
  });

  it('reports only the raw count when the window is unknown', () => {
    expect(memoryUsage(24000, undefined)).toEqual({ usedTokens: 24000 });
  });

  it('caps the share at 100%', () => {
    // The numerator is a per-turn sum over the turn's model calls, so it can
    // exceed the window without the context ever having done so.
    expect(memoryUsage(500000, 200000).percent).toBe(100);
  });

  it('treats a negative or non-finite count as zero', () => {
    expect(memoryUsage(-5, 200000)).toEqual({
      usedTokens: 0,
      windowTokens: 200000,
      percent: 0,
    });
    expect(memoryUsage(NaN, 200000).usedTokens).toBe(0);
  });

  it('ignores a nonsensical window', () => {
    expect(memoryUsage(100, 0)).toEqual({ usedTokens: 100 });
    expect(memoryUsage(100, -1)).toEqual({ usedTokens: 100 });
  });
});
