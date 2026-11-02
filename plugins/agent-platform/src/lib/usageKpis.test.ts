import { perSessionUsd, sessionSpend, spendChangePct } from './usageKpis';

describe('spendChangePct', () => {
  it('is the percentage change against the previous window', () => {
    expect(spendChangePct(120, 100)).toBeCloseTo(20);
    expect(spendChangePct(50, 100)).toBeCloseTo(-50);
    expect(spendChangePct(100, 100)).toBe(0);
  });

  it('is undefined without both figures', () => {
    // An unpriced window is "not knowable", never a 0% or a 100% claim.
    expect(spendChangePct(undefined, 100)).toBeUndefined();
    expect(spendChangePct(120, undefined)).toBeUndefined();
    expect(spendChangePct(undefined, undefined)).toBeUndefined();
  });

  it('is undefined against a zero or negative previous window', () => {
    // A delta against zero is not a percentage.
    expect(spendChangePct(120, 0)).toBeUndefined();
    expect(spendChangePct(120, -1)).toBeUndefined();
  });

  it('is undefined for non-finite inputs', () => {
    expect(spendChangePct(Number.NaN, 100)).toBeUndefined();
    expect(spendChangePct(120, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('perSessionUsd', () => {
  it('is the average cost of one session', () => {
    expect(perSessionUsd(10, 4)).toBeCloseTo(2.5);
  });

  it('is undefined without sessions or without a cost', () => {
    expect(perSessionUsd(10, 0)).toBeUndefined();
    expect(perSessionUsd(undefined, 4)).toBeUndefined();
    expect(perSessionUsd(Number.NaN, 4)).toBeUndefined();
  });
});

describe('sessionSpend', () => {
  const totals = {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    costUsd: 3.21,
  };

  it('carries the estimate and the reported figure side by side', () => {
    // Per-type rates: input at $1/M, output at $4/M.
    const spend = sessionSpend(totals, {
      input: 0.000001,
      output: 0.000004,
    });

    expect(spend.estimatedUsd).toBeCloseTo(1 + 2);
    expect(spend.reportedUsd).toBeCloseTo(3.21);
  });

  it('keeps "no rate" and "nothing reported" distinct from zero', () => {
    const spend = sessionSpend(
      { inputTokens: 1000, outputTokens: 100 },
      undefined,
    );

    // Neither figure is knowable — and neither may claim the work was free.
    expect(spend.estimatedUsd).toBeUndefined();
    expect(spend.reportedUsd).toBeUndefined();
  });

  it('reports a genuine zero as zero', () => {
    const spend = sessionSpend(
      { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      { blended: 0.000002 },
    );

    expect(spend.estimatedUsd).toBe(0);
    expect(spend.reportedUsd).toBe(0);
  });
});
