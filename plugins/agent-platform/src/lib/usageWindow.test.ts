import { WINDOW_DAYS } from './llmUsageQueries';
import {
  DEFAULT_USAGE_WINDOW_DAYS,
  formatUsageWindowParam,
  parseUsageWindowParam,
} from './usageWindow';

it('defaults to the query layer’s own default window', () => {
  // Stated in both modules rather than imported — see the constant's doc
  // comment — so this is what keeps them from drifting apart.
  expect(DEFAULT_USAGE_WINDOW_DAYS).toBe(WINDOW_DAYS);
});

describe('parseUsageWindowParam', () => {
  it('reads the values the control writes', () => {
    expect(parseUsageWindowParam('7d')).toBe(7);
    expect(parseUsageWindowParam('30d')).toBe(30);
    expect(parseUsageWindowParam('90d')).toBe(90);
  });

  it('accepts a bare number of days', () => {
    expect(parseUsageWindowParam('7')).toBe(7);
    expect(parseUsageWindowParam('90')).toBe(90);
  });

  it('defaults when the parameter is absent', () => {
    expect(parseUsageWindowParam(null)).toBe(DEFAULT_USAGE_WINDOW_DAYS);
    expect(parseUsageWindowParam(undefined)).toBe(DEFAULT_USAGE_WINDOW_DAYS);
    expect(parseUsageWindowParam('')).toBe(DEFAULT_USAGE_WINDOW_DAYS);
  });

  it('defaults for a window the control does not offer, rather than erroring', () => {
    // A hand-edited URL must not leave the control claiming one window while
    // the page shows another.
    expect(parseUsageWindowParam('14d')).toBe(DEFAULT_USAGE_WINDOW_DAYS);
    expect(parseUsageWindowParam('-7d')).toBe(DEFAULT_USAGE_WINDOW_DAYS);
    expect(parseUsageWindowParam('7dd')).toBe(DEFAULT_USAGE_WINDOW_DAYS);
    expect(parseUsageWindowParam('forever')).toBe(DEFAULT_USAGE_WINDOW_DAYS);
  });
});

describe('formatUsageWindowParam', () => {
  it('keeps the default window out of the URL', () => {
    expect(formatUsageWindowParam(DEFAULT_USAGE_WINDOW_DAYS)).toBeUndefined();
  });

  it('writes what parse reads', () => {
    expect(parseUsageWindowParam(formatUsageWindowParam(7))).toBe(7);
    expect(parseUsageWindowParam(formatUsageWindowParam(90))).toBe(90);
  });
});
