import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('shows whole milliseconds below a second', () => {
    expect(formatDuration(274.46153846153845)).toBe('274ms');
    expect(formatDuration(0)).toBe('0ms');
  });

  it('shows seconds with one decimal from a second on', () => {
    expect(formatDuration(1200)).toBe('1.2s');
    // Rounds to a second, so it reads as one.
    expect(formatDuration(999.6)).toBe('1.0s');
  });
});
