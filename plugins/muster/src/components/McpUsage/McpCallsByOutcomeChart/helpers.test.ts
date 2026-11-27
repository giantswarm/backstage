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
 * Format dates as a browser in `timeZone` with the `en-US` locale would: every
 * `toLocale*` call that names no zone gets this one, and no locale `en-US`, so
 * the labels can be compared as exact strings. Assigning `process.env.TZ`
 * would not do it, as each Jest test file gets its own copy of the
 * environment.
 */
function pinBrowser(timeZone: string) {
  const DateTimeFormat = Intl.DateTimeFormat;
  jest
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation(
      (locale, options) =>
        new DateTimeFormat(locale ?? 'en-US', { timeZone, ...options }),
    );
  for (const method of LOCALE_METHODS) {
    const original = Date.prototype[method];
    jest.spyOn(Date.prototype, method).mockImplementation(function format(
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      return original.call(this, locales ?? 'en-US', {
        timeZone,
        ...options,
      });
    });
  }
}

describe('bucket labels west of UTC', () => {
  beforeEach(() => {
    // Seven hours behind UTC in September: every UTC midnight is the
    // evening before here, the case a browser-zone day label gets wrong.
    pinBrowser('America/Los_Angeles');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('labels a daily bucket with its UTC day, as the Usage charts do', () => {
    expect(formatBucketTick(DAY_BUCKET, 24)).toBe('Sep 4');
    expect(formatBucketTooltip(DAY_BUCKET, 24)).toBe('Fri, Sep 4, 2026');
  });

  it('labels an hourly bucket with the browser time, as the rest of the page', () => {
    expect(formatBucketTick(HOUR_BUCKET, 1)).toBe('08:00 PM');
    expect(formatBucketTooltip(HOUR_BUCKET, 1)).toBe(
      'Sep 3, 2026, 08:00:00 PM PDT',
    );
  });
});
