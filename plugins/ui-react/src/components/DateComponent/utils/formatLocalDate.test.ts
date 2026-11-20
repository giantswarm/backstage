import {
  formatLocalDate,
  formatLocalDateFull,
  formatLocalDay,
  formatLocalTime,
  formatLocalTimeWithSeconds,
} from './formatLocalDate';

const OriginalDateTimeFormat = Intl.DateTimeFormat;
const VALUE = '2026-10-25T01:30:12Z';

describe.each([
  ['en-US', 'America/Los_Angeles', '06:30 PM', '06:30:12 PM', 'Oct 24'],
  ['en-GB', 'Europe/Paris', '02:30', '02:30:12', '25 Oct'],
  ['fr-FR', 'Asia/Kolkata', '07:00', '07:00:12', '25 oct.'],
])('local dates in %s, %s', (locale, timeZone, clock, seconds, day) => {
  beforeEach(() => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      (locales, options) =>
        new OriginalDateTimeFormat(locales ?? locale, {
          timeZone,
          ...options,
        }),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the browser clock and calendar convention', () => {
    expect(formatLocalTime(VALUE)).toBe(clock);
    expect(formatLocalTimeWithSeconds(VALUE)).toBe(seconds);
    expect(formatLocalDay(VALUE, 2026)).toBe(day);
    expect(formatLocalDay(VALUE, 2027)).toContain('2026');
    expect(formatLocalDate(VALUE)).toContain('2026');
    expect(formatLocalDateFull(VALUE)).toContain(seconds);
  });

  it('returns invalid inputs without throwing', () => {
    for (const format of [
      formatLocalDate,
      formatLocalDateFull,
      formatLocalDay,
      formatLocalTime,
      formatLocalTimeWithSeconds,
    ]) {
      expect(format('not a date')).toBe('not a date');
    }
  });
});
