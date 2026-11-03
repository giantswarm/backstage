import {
  formatDayTick,
  formatDayTooltip,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { formatBucketTick, formatBucketTooltip } from './helpers';

/** UTC midnight, the start of muster-backend's daily bucket for 4 Sep 2026. */
const DAY_BUCKET = '2026-09-04T00:00:00.000Z';
/** A UTC-hour start of an hourly bucket. */
const HOUR_BUCKET = '2026-09-04T03:00:00.000Z';

const LOCALE_METHODS = [
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
] as const;

/**
 * Format dates as a browser in `timeZone` would: every `toLocale*` call that
 * names no zone gets this one. Assigning `process.env.TZ` would not do it, as
 * each Jest test file gets its own copy of the environment.
 */
function pinBrowserZone(timeZone: string) {
  for (const method of LOCALE_METHODS) {
    const original = Date.prototype[method];
    jest.spyOn(Date.prototype, method).mockImplementation(function format(
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      return original.call(this, locales, { timeZone, ...options });
    });
  }
}

describe('bucket labels west of UTC', () => {
  beforeEach(() => {
    // Seven hours behind UTC in September: every UTC midnight is the
    // evening before here, the case a browser-zone label gets wrong.
    pinBrowserZone('America/Los_Angeles');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs in a zone where the bucket starts on the previous day', () => {
    expect(
      new Date(DAY_BUCKET).toLocaleDateString(undefined, { day: 'numeric' }),
    ).toBe('3');
  });

  it('labels a daily bucket with its UTC day, as the Usage charts do', () => {
    expect(formatBucketTick(DAY_BUCKET, 24)).toBe(formatDayTick('2026-09-04'));
    expect(formatBucketTooltip(DAY_BUCKET, 24)).toBe(
      formatDayTooltip('2026-09-04'),
    );
    expect(formatBucketTooltip(DAY_BUCKET, 24)).toMatch(/4/);
    expect(formatBucketTooltip(DAY_BUCKET, 24)).toMatch(/2026/);
  });

  it('labels an hourly bucket with its UTC hour and day', () => {
    expect(formatBucketTick(HOUR_BUCKET, 1)).toBe(
      new Date(HOUR_BUCKET).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    );
    expect(formatBucketTick(HOUR_BUCKET, 1)).toMatch(/03/);
    expect(formatBucketTooltip(HOUR_BUCKET, 1)).toMatch(/\b4\b/);
  });
});
