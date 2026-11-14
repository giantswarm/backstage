import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellScopeProvider } from '../ShellScope';
import { DateComponent } from './DateComponent';
import { DateTimeZoneProvider } from './DateTimeZone';
import { formatLocalDate, formatLocalDateFull, getRelativeDate } from './utils';

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

  it('shows an unparsable relative value as given, in either clock', () => {
    render(
      <>
        <DateComponent value="not a date" relative />
        <DateTimeZoneProvider timeZone="local">
          <DateComponent value="soon" relative />
        </DateTimeZoneProvider>
      </>,
    );
    expect(screen.getByText('not a date')).toBeInTheDocument();
    expect(screen.getByText('soon')).toHaveAttribute('title', 'soon');
  });
});

describe('getRelativeDate', () => {
  it('says how far a date is from another', () => {
    expect(getRelativeDate('2026-10-11T15:45:12Z', VALUE)).toBe(
      '5 minutes ago',
    );
    expect(getRelativeDate('2026-10-11T15:55:12Z', VALUE)).toBe('in 5 minutes');
  });

  it('returns a value that does not parse as given instead of throwing', () => {
    expect(getRelativeDate('not a date', VALUE)).toBe('not a date');
    expect(getRelativeDate(VALUE, 'not a date')).toBe(VALUE);
  });
});

describe('formatLocalDateFull', () => {
  it('carries seconds and a zone', () => {
    expect(formatLocalDateFull(VALUE)).toMatch(/2026.*\d{2}:\d{2}:12.*\S+/);
  });
});

describe('live dates', () => {
  beforeEach(() =>
    jest.useFakeTimers({ now: new Date('2026-10-11T17:00:00Z') }),
  );
  afterEach(() => jest.useRealTimers());

  it('updates old ages and cleans up when switching to an absolute date', () => {
    const { rerender } = render(<DateComponent value={VALUE} relative />);
    expect(screen.getByText('about 1 hour ago')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(60 * 60_000));
    expect(screen.getByText('about 2 hours ago')).toBeInTheDocument();
    rerender(<DateComponent value={VALUE} />);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not subscribe for invalid or absent timestamps or a list-owned clock', () => {
    const { rerender } = render(<DateComponent value="invalid" relative />);
    expect(jest.getTimerCount()).toBe(0);
    rerender(<DateComponent value={null} relative />);
    expect(jest.getTimerCount()).toBe(0);
    rerender(<DateComponent value={VALUE} relative now={Date.now()} />);
    expect(jest.getTimerCount()).toBe(0);
  });
});

it('reveals an exact timestamp by keyboard and restores focus on dismissal', async () => {
  const user = userEvent.setup();
  render(
    <ShellScopeProvider>
      <DateTimeZoneProvider timeZone="local">
        <DateComponent value={VALUE} disclosure />
      </DateTimeZoneProvider>
    </ShellScopeProvider>,
  );
  await user.tab();
  const trigger = screen.getByRole('button', { name: 'Exact date and time' });
  expect(trigger).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(
    screen.getByRole('dialog', { name: 'Exact date and time' }),
  ).toHaveTextContent(formatLocalDateFull(VALUE));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});
