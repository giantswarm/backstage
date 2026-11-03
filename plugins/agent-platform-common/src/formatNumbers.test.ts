import { formatMilliseconds, formatSeconds } from './formatNumbers';

describe('formatSeconds', () => {
  it('shows whole milliseconds below a second', () => {
    expect(formatSeconds(0)).toBe('0 ms');
    expect(formatSeconds(0.27446)).toBe('274 ms');
    expect(formatSeconds(0.42)).toBe('420 ms');
    expect(formatSeconds(0.9994)).toBe('999 ms');
  });

  it('shows one decimal from a second to 10 s, none for a whole second', () => {
    // Rounds to a second, so it reads as one.
    expect(formatSeconds(0.9996)).toBe('1 s');
    expect(formatSeconds(1)).toBe('1 s');
    expect(formatSeconds(1.04)).toBe('1 s');
    expect(formatSeconds(1.2)).toBe('1.2 s');
    expect(formatSeconds(3)).toBe('3 s');
    expect(formatSeconds(5.321)).toBe('5.3 s');
    expect(formatSeconds(9.94)).toBe('9.9 s');
  });

  it('shows whole seconds from 10 s to a minute', () => {
    // Rounds to 10 s, so it reads without a decimal.
    expect(formatSeconds(9.96)).toBe('10 s');
    expect(formatSeconds(10)).toBe('10 s');
    expect(formatSeconds(18.4)).toBe('18 s');
    expect(formatSeconds(59.4)).toBe('59 s');
  });

  it('shows minutes and seconds from a minute to an hour', () => {
    expect(formatSeconds(59.6)).toBe('1 min');
    expect(formatSeconds(60)).toBe('1 min');
    expect(formatSeconds(150)).toBe('2 min 30 s');
    expect(formatSeconds(300)).toBe('5 min');
    expect(formatSeconds(720)).toBe('12 min');
    expect(formatSeconds(3599.4)).toBe('59 min 59 s');
  });

  it('shows hours and minutes from an hour on, without the seconds', () => {
    expect(formatSeconds(3599.6)).toBe('1 h');
    expect(formatSeconds(3600)).toBe('1 h');
    expect(formatSeconds(3659)).toBe('1 h');
    expect(formatSeconds(3900)).toBe('1 h 5 min');
    expect(formatSeconds(3959)).toBe('1 h 5 min');
    expect(formatSeconds(30 * 3600)).toBe('30 h');
  });

  it('reads a negative span as zero', () => {
    expect(formatSeconds(-5)).toBe('0 ms');
  });

  it('is an em dash for an empty histogram', () => {
    // histogram_quantile over no observations is NaN, which is the normal
    // answer on an idle installation — not an error, and not 0 ms.
    expect(formatSeconds(Number.NaN)).toBe('—');
    expect(formatSeconds(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatSeconds(undefined)).toBe('—');
    expect(formatSeconds(null)).toBe('—');
  });
});

describe('formatMilliseconds', () => {
  it('formats milliseconds as formatSeconds formats seconds', () => {
    expect(formatMilliseconds(420)).toBe('420 ms');
    expect(formatMilliseconds(5321)).toBe('5.3 s');
    expect(formatMilliseconds(300_000)).toBe('5 min');
  });

  it('is an em dash for no value, not 0 ms', () => {
    expect(formatMilliseconds(null)).toBe('—');
    expect(formatMilliseconds(undefined)).toBe('—');
  });
});
