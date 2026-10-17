import { describeCostBasis, type CostBasis } from './costBasis';

const base: CostBasis = {
  tier: 'model',
  model: 'claude-opus-5',
  installation: 'gazelle',
  window: '7d',
  inputTokens: 63_402,
  outputTokens: 481,
};

describe('describeCostBasis', () => {
  it('names the model when the rate is the model’s own', () => {
    const text = describeCostBasis(base);

    expect(text).toContain('claude-opus-5');
    expect(text).toContain('gazelle');
    expect(text).toContain('7d');
    expect(text).toContain('63.4k input and 481 output tokens');
  });

  it('names the counts the stats beside it show, the way they show them', () => {
    // The reported case: a total of 48,478 in exact digits beside an input
    // stat reading 48.0k looked like a rounding error. It was another figure.
    const text = describeCostBasis({
      ...base,
      inputTokens: 48_012,
      outputTokens: 466,
    });

    expect(text).toContain('applied to the 48.0k input and 466 output tokens.');
    expect(text).not.toContain('48,478');
    expect(text).not.toContain('beside it');
  });

  it('says a blend is a blend, per tier', () => {
    expect(
      describeCostBasis({ ...base, tier: 'agent', model: undefined }),
    ).toContain('blend across whatever models it ran');
    expect(
      describeCostBasis({ ...base, tier: 'installation', model: undefined }),
    ).toContain('fleet-wide blend');
  });

  it('explains an em dash by naming the unpriced model', () => {
    // The reason is both actionable and not guessable from a blank cell, which
    // is the whole point of the tooltip.
    const text = describeCostBasis({ ...base, tier: 'none' });

    expect(text).toContain('No estimate');
    expect(text).toContain('claude-opus-5');
    expect(text).toContain('no rate to apply');
  });

  it('explains an em dash with no model to name', () => {
    const text = describeCostBasis({
      ...base,
      tier: 'none',
      model: undefined,
    });

    expect(text).toContain('No estimate');
    expect(text).toContain('could be priced');
    // Must not imply the token counts are affected — they are not.
    expect(text).toContain('token counts are unaffected');
  });

  it('states neither a figure nor a diagnosis while loading', () => {
    // `none` names a cause the reader may act on; saying it before anything is
    // measured is specific and wrong.
    const text = describeCostBasis({ ...base, tier: 'loading' });

    expect(text).not.toContain('No estimate');
    expect(text).not.toContain('claude-opus-5');
    expect(text).toMatch(/Working out the rate/);
  });

  it.each(['unavailable', 'error'] as const)(
    'does not blame the price catalogue for tier %s',
    tier => {
      // Both mean nothing was measured, so neither may borrow `none`'s cause.
      const text = describeCostBasis({ ...base, tier });

      expect(text).toContain('No estimate');
      expect(text).not.toContain('has not priced');
      expect(text).not.toContain('claude-opus-5');
      expect(text).toContain('gazelle');
    },
  );

  it('distinguishes no-metrics-here from could-not-read', () => {
    expect(describeCostBasis({ ...base, tier: 'unavailable' })).toContain(
      'no observability stack',
    );
    expect(describeCostBasis({ ...base, tier: 'error' })).toContain(
      'could not be read',
    );
  });

  it('stays to one sentence per tier', () => {
    // The label's own "Est." prefix carries the not-a-bill caveat, so the
    // tooltip's job is only to name which rate was applied.
    for (const tier of [
      'model',
      'agent',
      'installation',
      'loading',
      'unavailable',
      'error',
      'none',
    ] as const) {
      const text = describeCostBasis({ ...base, tier });
      expect(text).not.toContain('Not a billed figure');
      expect(text.length).toBeLessThan(230);
    }
  });
});
