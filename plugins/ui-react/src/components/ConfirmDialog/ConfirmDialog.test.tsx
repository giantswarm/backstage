import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(
  props: Partial<Parameters<typeof ConfirmDialog>[0]> = {},
) {
  const onConfirm = jest.fn();
  const onOpenChange = jest.fn();

  render(
    <ConfirmDialog
      isOpen
      onOpenChange={onOpenChange}
      title="Delete the thing?"
      onConfirm={onConfirm}
      {...props}
    >
      <span>It will not come back.</span>
    </ConfirmDialog>,
  );

  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('shows the title and the body', () => {
    renderDialog();

    expect(screen.getByText('Delete the thing?')).toBeInTheDocument();
    expect(screen.getByText('It will not come back.')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDialog({ isOpen: false });

    expect(screen.queryByText('Delete the thing?')).not.toBeInTheDocument();
  });

  it('asks to close on cancel', async () => {
    const { onOpenChange, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms without closing itself', async () => {
    // The caller closes it, once it knows the action succeeded. A dialog that
    // dismissed itself here would have thrown away the only place a failure
    // could be reported.
    const { onConfirm, onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('uses the given labels', () => {
    renderDialog({ confirmLabel: 'Delete agent', cancelLabel: 'Keep it' });

    expect(
      screen.getByRole('button', { name: 'Delete agent' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
  });

  it('locks both buttons while the action is in flight', async () => {
    const { onConfirm, onOpenChange } = renderDialog({
      isBusy: true,
      confirmLabel: 'Delete',
      busyLabel: 'Deleting…',
    });

    // The confirm button reports the progress rather than inviting a second press.
    const confirm = screen.getByRole('button', { name: 'Deleting…' });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();

    await userEvent.click(confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps the confirm label while busy when no busy label is given', () => {
    renderDialog({ isBusy: true, confirmLabel: 'Delete' });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('shows a failed attempt without closing', () => {
    renderDialog({ error: 'helmreleases is forbidden' });

    expect(screen.getByText('helmreleases is forbidden')).toBeInTheDocument();
    expect(screen.getByText('Delete the thing?')).toBeInTheDocument();
  });

  it('cannot be dismissed with Escape while busy', async () => {
    // A stray keypress must not orphan a request already on its way to a server.
    const { onOpenChange } = renderDialog({ isBusy: true });

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
