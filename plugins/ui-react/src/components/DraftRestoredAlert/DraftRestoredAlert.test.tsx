import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftRestoredAlert } from './DraftRestoredAlert';

function renderAlert() {
  const onStartOver = jest.fn();
  const onDismiss = jest.fn();
  render(
    <DraftRestoredAlert
      keptUntil="It is kept in this browser tab until you create the agent or discard it."
      onStartOver={onStartOver}
      onDismiss={onDismiss}
    />,
  );
  return { onStartOver, onDismiss };
}

describe('DraftRestoredAlert', () => {
  it('says the draft is back and what is kept', () => {
    renderAlert();

    expect(screen.getByText('Your draft is back')).toBeInTheDocument();
    expect(
      screen.getByText(
        /What you entered before is filled in again\. It is kept/,
      ),
    ).toBeInTheDocument();
  });

  it('starts over only once confirmed', async () => {
    const { onStartOver } = renderAlert();

    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Keep draft' }),
    );
    expect(onStartOver).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Discard draft',
      }),
    );
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('closes without discarding', async () => {
    const { onStartOver, onDismiss } = renderAlert();

    await userEvent.click(
      screen.getByRole('button', { name: 'Close draft note' }),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onStartOver).not.toHaveBeenCalled();
  });
});
