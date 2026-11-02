import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('shows whole milliseconds below a second', () => {
    expect(formatDuration(274.46153846153845)).toBe('274 ms');
    expect(formatDuration(0)).toBe('0 ms');
  });

  it('shows seconds from a second on, as every platform duration', () => {
    expect(formatDuration(1200)).toBe('1.2 s');
    // Rounds to a second, so it reads as one.
    expect(formatDuration(999.6)).toBe('1.0 s');
    expect(formatDuration(18_000)).toBe('18 s');
  });
});
