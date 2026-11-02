import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { LastDaysSelect, type LastDaysSelectProps } from './LastDaysSelect';

const OPTIONS = [7, 30, 90] as const;
type Days = (typeof OPTIONS)[number];

function Controlled({
  onChange,
  ...props
}: Partial<LastDaysSelectProps<Days>>) {
  const [days, setDays] = useState<Days>(props.value ?? 30);
  return (
    <LastDaysSelect
      options={OPTIONS}
      {...props}
      value={days}
      onChange={next => {
        setDays(next);
        onChange?.(next);
      }}
    />
  );
}

const trigger = (name: RegExp = /Time range/) =>
  screen.getByRole('button', { name });

describe('LastDaysSelect', () => {
  it('is a select named by its visible label, showing the selected window', async () => {
    await renderInTestApp(<Controlled />);

    expect(screen.getByText('Time range')).toBeVisible();
    expect(trigger()).toHaveTextContent('Last 30 days');
  });

  it('offers each window in full and reports the chosen one', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderInTestApp(<Controlled onChange={onChange} />);

    await user.click(trigger());
    const listbox = screen.getByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['Last 7 days', 'Last 30 days', 'Last 90 days']);
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }));

    expect(onChange).toHaveBeenCalledWith(7);
    expect(trigger()).toHaveTextContent('Last 7 days');
  });

  it('takes a custom label', async () => {
    await renderInTestApp(<Controlled label="Period" />);

    expect(trigger(/Period/)).toBeInTheDocument();
  });

  it('disables a window with a reason, and says the reason on the option', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderInTestApp(
      <Controlled
        onChange={onChange}
        unavailableReason={days =>
          days > 30 ? 'Only 30 days are kept.' : undefined
        }
      />,
    );

    await user.click(trigger());
    const ninety = screen.getByRole('option', { name: 'Last 90 days' });
    expect(ninety).toHaveAttribute('aria-disabled', 'true');
    // Visible under the name and read with the option by screen readers.
    expect(ninety).toHaveTextContent('Only 30 days are kept.');
    expect(ninety).toHaveAccessibleDescription('Only 30 days are kept.');
    expect(
      screen.getByRole('option', { name: 'Last 7 days' }),
    ).not.toHaveAttribute('aria-disabled');

    await user.click(ninety);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps showing a selected window that is not on offer', async () => {
    // A deep link can select it; the select shows what the URL says.
    await renderInTestApp(
      <Controlled
        value={90}
        unavailableReason={days => (days > 30 ? 'Not kept.' : undefined)}
      />,
    );

    expect(trigger()).toHaveTextContent('Last 90 days');
  });
});
