/**
 * A seeded source of random numbers: the same seed gives the same sequence,
 * so a data set built from it is the same on every run and in every test.
 */
export type FixtureRandom = {
  /** A number in [0, 1). */
  next(): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  /** One of `items`, which must not be empty. */
  pick<T>(items: readonly T[]): T;
};

/** mulberry32: small, fast and good enough for made-up data. */
export function createRandom(seed: number): FixtureRandom {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: items => items[Math.floor(next() * items.length)],
  };
}
