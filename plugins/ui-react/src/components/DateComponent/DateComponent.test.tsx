import { render, screen } from '@testing-library/react';
import { DateComponent } from './DateComponent';
import { DateTimeZoneProvider } from './DateTimeZone';
import { formatLocalDate, formatLocalDateFull } from './utils';

const VALUE = '2026-10-11T15:50:12Z';

describe('DateComponent', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows UTC without a provider, as classic pages always have', () => {
    render(<DateComponent value={VALUE} />);
    expect(screen.getByText('11 Oct 2026, 15:50 UTC')).toBeInTheDocument();
  });

  it('does not pass `tooltip` on to the DOM', () => {
    const { container } = render(
      <DateComponent value={VALUE} relative tooltip />,
    );
    expect(container.querySelector('[tooltip]')).toBeNull();
    const warnings = consoleError.mock.calls.map(args => args.join(' '));
    expect(warnings.filter(text => text.includes('tooltip'))).toEqual([]);
  });

  it('shows local time below a local provider, the full stamp on hover', () => {
    render(
      <DateTimeZoneProvider timeZone="local">
        <DateComponent value={VALUE} />
      </DateTimeZoneProvider>,
    );
    const time = screen.getByText(formatLocalDate(VALUE));
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-10-11T15:50:12.000Z');
    expect(time).toHaveAttribute('title', formatLocalDateFull(VALUE));
    expect(time.textContent).not.toMatch(/UTC/);
  });

  it('keeps a relative date relative in local mode, the full stamp on hover', () => {
    render(
      <DateTimeZoneProvider timeZone="local">
        <DateComponent value={VALUE} relative />
      </DateTimeZoneProvider>,
    );
    const time = screen.getByTitle(formatLocalDateFull(VALUE));
    expect(time.textContent).toMatch(/ago|in /);
  });
});

describe('formatLocalDateFull', () => {
  it('carries seconds and a zone', () => {
    expect(formatLocalDateFull(VALUE)).toMatch(
      /^\d{1,2} Oct 2026, \d{2}:\d{2}:12( \S+)?$/,
    );
  });
});
