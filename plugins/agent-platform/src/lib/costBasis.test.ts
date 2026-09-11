import { describeCostBasis, type CostBasis } from './costBasis';

const base: CostBasis = {
  tier: 'model',
  model: 'claude-opus-5',
  installation: 'gazelle',
  window: '7d',
  tokens: 63883,
};

describe('describeCostBasis', () => {
  it('names the model when the rate is the model’s own', () => {
    const text = describeCostBasis(base);

    expect(text).toContain('claude-opus-5');
    expect(text).toContain('gazelle');
    expect(text).toContain('7d');
    expect(text).toContain('63,883 tokens');
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

  it('stays to one sentence per tier', () => {
    // The label's own "Est." prefix carries the not-a-bill caveat, so the
    // tooltip's job is only to name which rate was applied.
    for (const tier of [
      'model',
      'agent',
      'installation',
      'loading',
      'none',
    ] as const) {
      const text = describeCostBasis({ ...base, tier });
      expect(text).not.toContain('Not a billed figure');
      expect(text.length).toBeLessThan(230);
    }
  });
});
