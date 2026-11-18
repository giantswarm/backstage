import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsageWindowSelect } from './UsageWindowSelect';

/** 2026-11-02T10:00:00Z. */
const NOW = Date.parse('2026-11-02T10:00:00Z');

function trigger() {
  return screen.getByRole('button', { name: /Time range/ });
}

describe('UsageWindowSelect', () => {
  it('offers the days windows, then this month so far and the two before it', async () => {
    const user = userEvent.setup();
    render(
      <UsageWindowSelect
        value={{ kind: 'days', days: 30 }}
        onChange={() => {}}
        now={NOW}
      />,
    );

    expect(trigger()).toHaveTextContent('Last 30 days');
    await user.click(trigger());

    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'November 2026 so far',
      'October 2026',
      'September 2026',
    ]);
  });

  it('answers a month with the month, and a days window with its days', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <UsageWindowSelect
        value={{ kind: 'days', days: 30 }}
        onChange={onChange}
        now={NOW}
      />,
    );

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'October 2026' }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'month',
      month: '2026-10',
    });

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'days', days: 7 });
  });

  it('shows a month as the selection', () => {
    render(
      <UsageWindowSelect
        value={{ kind: 'month', month: '2026-10' }}
        onChange={() => {}}
        now={NOW}
      />,
    );

    expect(trigger()).toHaveTextContent('October 2026');
  });

  it('disables a window with a reason, shown under its name', async () => {
    const user = userEvent.setup();
    render(
      <UsageWindowSelect
        value={{ kind: 'days', days: 30 }}
        onChange={() => {}}
        now={NOW}
        unavailableReason={window =>
          window.kind === 'month'
            ? 'kagent reports session usage over days back from today only'
            : undefined
        }
      />,
    );

    await user.click(trigger());
    const october = screen.getByRole('option', { name: 'October 2026' });
    expect(october).toHaveAttribute('aria-disabled', 'true');
    expect(october).toHaveAccessibleDescription(
      'kagent reports session usage over days back from today only',
    );
    expect(
      screen.getByRole('option', { name: 'Last 7 days' }),
    ).not.toHaveAttribute('aria-disabled');
  });
});
