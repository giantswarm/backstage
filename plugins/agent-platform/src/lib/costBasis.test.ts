import {
  AVERAGE_RATE_CAVEAT,
  describeCostBasis,
  type CostBasis,
} from './costBasis';

const base: CostBasis = {
  tier: 'model',
  model: 'claude-opus-5',
  installation: 'gazelle',
  windowDays: 7,
  inputTokens: 63_402,
  outputTokens: 481,
};

describe('describeCostBasis', () => {
  it('names the window in words, never as a PromQL duration', () => {
    // `7d` leaked into the copy as "over the last 7d" while every other
    // window on the screen read "the last 30 days".
    for (const tier of ['model', 'agent', 'installation', 'none'] as const) {
      const text = describeCostBasis({ ...base, tier });
      expect(text).toContain('the last 7 days');
      expect(text).not.toMatch(/\b7d\b/);
    }
    expect(describeCostBasis({ ...base, windowDays: 1 })).toContain(
      'over the last day,',
    );
  });

  it('names the model when the rate is the model’s own', () => {
    const text = describeCostBasis(base);

    expect(text).toContain('claude-opus-5');
    expect(text).toContain('gazelle');
    expect(text).toContain('over the last 7 days,');
    expect(text).toContain('63.4k input and 481 output tokens');
  });

  it('says the rate is a weekly average that can be low, per priced tier', () => {
    // giantswarm/giantswarm#38457: a one-turn session came out at a fifth of
    // its bill, because the window it is averaged over is mostly cache reads.
    for (const tier of ['model', 'agent', 'installation'] as const) {
      const text = describeCostBasis({ ...base, tier });
      expect(text).toContain('average cost per token');
      expect(text).toContain('over the last 7 days');
      expect(text).toContain(
        'An average can be low for short sessions that read little from cache.',
      );
    }
  });

  it('says no average where there is no figure', () => {
    for (const tier of ['none', 'loading', 'unavailable', 'error'] as const) {
      expect(describeCostBasis({ ...base, tier })).not.toContain('average');
    }
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

  it('names the tokens the estimate does not price', () => {
    // A model that reports thinking separately counts it in kagent's total
    // and in neither part, so the estimate leaves it out and says so.
    const text = describeCostBasis({ ...base, unpricedTokens: 20_000 });

    expect(text).toContain('63.4k input and 481 output tokens.');
    expect(text).toContain(
      'kagent also counted 20.0k other tokens, such as thinking, which the estimate does not price.',
    );
    for (const tier of ['agent', 'installation'] as const) {
      expect(
        describeCostBasis({ ...base, tier, unpricedTokens: 20_000 }),
      ).toContain('20.0k other tokens');
    }
  });

  it('says nothing of unpriced tokens when there are none', () => {
    for (const unpricedTokens of [undefined, 0, -3]) {
      expect(describeCostBasis({ ...base, unpricedTokens })).not.toContain(
        'other tokens',
      );
    }
    // A diagnosis without a figure names no counts at all.
    expect(
      describeCostBasis({ ...base, tier: 'none', unpricedTokens: 20_000 }),
    ).not.toContain('other tokens');
  });

  it('names the counts as the estimate prices them', () => {
    // `estimateCost` prices a negative or non-finite count as none; the line
    // must not read "NaNM" or "-12" beside that price.
    const text = describeCostBasis({
      ...base,
      inputTokens: NaN,
      outputTokens: -12,
    });

    expect(text).toContain('applied to the 0 input and 0 output tokens.');
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

  it('stays to one sentence per tier, and the average caveat', () => {
    // The label's own "Est." prefix carries the not-a-bill caveat, so the
    // tooltip's job is to name which rate was applied — and, where it is a
    // weekly average, the one caveat that says which sessions it undercharges.
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
      expect(text.replace(` ${AVERAGE_RATE_CAVEAT}`, '').length).toBeLessThan(
        230,
      );
    }
  });
});
