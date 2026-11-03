import { bucketDay } from './bucketDay';

describe('bucketDay', () => {
  it('gives the UTC day a bucket starts on', () => {
    expect(bucketDay('2026-09-04T00:00:00.000Z')).toBe('2026-09-04');
  });

  it('reads a start written with an offset as its UTC day', () => {
    expect(bucketDay('2026-09-04T01:00:00+02:00')).toBe('2026-09-03');
  });

  it('returns anything that is not a time unchanged', () => {
    expect(bucketDay('soon')).toBe('soon');
  });
});
