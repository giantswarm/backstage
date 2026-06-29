import { formatUpdatedAgo } from './freshness';

describe('formatUpdatedAgo', () => {
  const now = 1_000_000_000_000;

  it('returns empty string when there is no timestamp yet', () => {
    expect(formatUpdatedAgo(undefined, now)).toBe('');
    expect(formatUpdatedAgo(0, now)).toBe('');
  });

  it('reports "just now" within the first few seconds', () => {
    expect(formatUpdatedAgo(now, now)).toBe('updated just now');
    expect(formatUpdatedAgo(now - 4_000, now)).toBe('updated just now');
  });

  it('reports seconds under a minute', () => {
    expect(formatUpdatedAgo(now - 12_000, now)).toBe('updated 12s ago');
    expect(formatUpdatedAgo(now - 59_000, now)).toBe('updated 59s ago');
  });

  it('reports minutes under an hour', () => {
    expect(formatUpdatedAgo(now - 60_000, now)).toBe('updated 1m ago');
    expect(formatUpdatedAgo(now - 59 * 60_000, now)).toBe('updated 59m ago');
  });

  it('reports hours beyond an hour', () => {
    expect(formatUpdatedAgo(now - 3 * 60 * 60_000, now)).toBe('updated 3h ago');
  });

  it('never reports a negative duration for a future timestamp', () => {
    expect(formatUpdatedAgo(now + 5_000, now)).toBe('updated just now');
  });
});
