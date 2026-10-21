import { contextWindowFor, contextUsage } from './contextWindows';

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

describe('contextUsage', () => {
  const call = (tokens: number) => ({ tokens, perCall: true });

  it('computes the share of a known window', () => {
    expect(contextUsage(call(24000), 200000)).toEqual({
      kind: 'share',
      usedTokens: 24000,
      windowTokens: 200000,
      percent: 12,
    });
  });

  it('reports only the raw count when the window is unknown', () => {
    expect(contextUsage(call(24000), undefined)).toEqual({
      kind: 'tokens',
      usedTokens: 24000,
    });
  });

  it('claims no share of a window the count exceeds', () => {
    // A model cannot be sent more than its window, so the configured window
    // is wrong; a share of it, capped or not, would contradict the count.
    expect(contextUsage(call(969000), 200000)).toEqual({
      kind: 'over-window',
      usedTokens: 969000,
      windowTokens: 200000,
    });
  });

  it('shows a full window as a share', () => {
    expect(contextUsage(call(200000), 200000)).toMatchObject({
      kind: 'share',
      percent: 100,
    });
  });

  it('measures nothing from a turn total over several calls', () => {
    // The claude Harness's bag sums the turn's calls: no call's context.
    expect(contextUsage({ tokens: 71338, perCall: false }, 1000000)).toEqual({
      kind: 'unmeasured',
    });
  });

  it('reports nothing without a reading or with a nonsensical count', () => {
    expect(contextUsage(undefined, 200000)).toEqual({ kind: 'none' });
    expect(contextUsage(call(-5), 200000)).toEqual({ kind: 'none' });
    expect(contextUsage(call(NaN), 200000)).toEqual({ kind: 'none' });
  });

  it('ignores a nonsensical window', () => {
    expect(contextUsage(call(100), 0)).toEqual({
      kind: 'tokens',
      usedTokens: 100,
    });
    expect(contextUsage(call(100), -1)).toEqual({
      kind: 'tokens',
      usedTokens: 100,
    });
  });
});
