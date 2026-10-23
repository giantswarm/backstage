import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { LastDaysPicker, type LastDaysPickerProps } from './LastDaysPicker';

const OPTIONS = [7, 30, 90] as const;
type Days = (typeof OPTIONS)[number];

function Controlled({
  onChange,
  ...props
}: Partial<LastDaysPickerProps<Days>>) {
  const [days, setDays] = useState<Days>(props.value ?? 30);
  return (
    <LastDaysPicker
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

describe('LastDaysPicker', () => {
  it('is a radio group named by its visible label', async () => {
    await renderInTestApp(<Controlled />);

    const group = screen.getByRole('radiogroup', { name: 'Time range' });
    expect(group).toBeInTheDocument();
    expect(screen.getByText('Time range')).toBeVisible();
  });

  it('names each option in full, says "Last" and "days" once, and marks the selection', async () => {
    await renderInTestApp(<Controlled />);

    expect(
      screen.getByRole('radio', { name: 'Last 7 days' }),
    ).toHaveTextContent(/^7$/);
    expect(screen.getByRole('radio', { name: 'Last 30 days' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Last 90 days' }),
    ).not.toBeChecked();
    // The words are visible once, and hidden from screen readers, which hear
    // each option's own name instead.
    expect(screen.getByText('Last')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('days')).toHaveAttribute('aria-hidden', 'true');
  });

  it('reports the chosen window', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderInTestApp(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Last 7 days' }));

    expect(onChange).toHaveBeenCalledWith(7);
    expect(screen.getByRole('radio', { name: 'Last 7 days' })).toBeChecked();
  });

  it('moves focus to the selected option when its label is clicked, as a select label does', async () => {
    const user = userEvent.setup();
    await renderInTestApp(<Controlled />);

    await user.click(screen.getByText('Time range'));

    expect(screen.getByRole('radio', { name: 'Last 30 days' })).toHaveFocus();
  });

  it('moves focus to the first option on offer when the selected one is not', async () => {
    const user = userEvent.setup();
    await renderInTestApp(
      <Controlled
        value={90}
        unavailableReason={days => (days > 30 ? 'Not kept.' : undefined)}
      />,
    );

    await user.click(screen.getByText('Time range'));

    expect(screen.getByRole('radio', { name: 'Last 7 days' })).toHaveFocus();
  });

  it('takes a custom label', async () => {
    await renderInTestApp(<Controlled label="Period" />);

    expect(
      screen.getByRole('radiogroup', { name: 'Period' }),
    ).toBeInTheDocument();
  });

  it('disables a window with a reason, and says the reason on it', async () => {
    await renderInTestApp(
      <Controlled
        unavailableReason={days =>
          days > 30 ? 'Only 30 days are kept.' : undefined
        }
      />,
    );

    const ninety = screen.getByRole('radio', { name: 'Last 90 days' });
    expect(ninety).toBeDisabled();
    expect(ninety).toHaveAttribute('title', 'Only 30 days are kept.');
    const seven = screen.getByRole('radio', { name: 'Last 7 days' });
    expect(seven).toBeEnabled();
    expect(seven).not.toHaveAttribute('title');
  });
});
