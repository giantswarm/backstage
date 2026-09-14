import { columnMax } from './columnMax';

describe('columnMax', () => {
  it('returns the largest value in the column', () => {
    expect(columnMax([{ n: 3 }, { n: 42 }, { n: 7 }], row => row.n)).toBe(42);
  });

  it('ignores null and undefined, so a partly-empty column still scales', () => {
    // `p95_seconds` is nullable on the wire, which is why this matters here.
    expect(
      columnMax(
        [{ n: null }, { n: 1.5 }, { n: undefined }],
        row => row.n ?? undefined,
      ),
    ).toBe(1.5);
  });

  it('is zero for an all-empty column, which draws empty tracks', () => {
    // Not `-Infinity` from a bare Math.max, and not a full bar per row.
    expect(
      columnMax([{ n: null }, { n: null }], row => row.n ?? undefined),
    ).toBe(0);
    expect(columnMax([], (row: { n: number }) => row.n)).toBe(0);
  });

  it('ignores non-finite and negative values rather than inverting the scale', () => {
    expect(
      columnMax([{ n: Number.NaN }, { n: -5 }, { n: 2 }], row => row.n),
    ).toBe(2);
    expect(columnMax([{ n: -5 }], row => row.n)).toBe(0);
  });
});
