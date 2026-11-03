import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, DialogBody, DialogFooter, DialogHeader } from '@backstage/ui';
import { BusyDialog } from './BusyDialog';

function renderDialog(isBusy: boolean) {
  const onOpenChange = jest.fn();
  const view = render(
    <>
      <span>Outside</span>
      <BusyDialog isOpen onOpenChange={onOpenChange} isBusy={isBusy}>
        {close => (
          <>
            <DialogHeader>Rename</DialogHeader>
            <DialogBody>Body</DialogBody>
            <DialogFooter>
              <Button variant="secondary" onPress={close}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </BusyDialog>
    </>,
  );
  return { onOpenChange, view };
}

/** The modal's underlay: a press on it is the click outside. */
function underlay() {
  const dialog = screen.getByRole('dialog');
  let node: HTMLElement | null = dialog;
  while (node?.parentElement && node.parentElement !== document.body) {
    node = node.parentElement;
  }
  return node as HTMLElement;
}

const paths: Array<[string, () => Promise<unknown>]> = [
  ['Escape', () => userEvent.keyboard('{Escape}')],
  [
    'the header close button',
    () => userEvent.click(screen.getByRole('button', { name: 'Close' })),
  ],
  [
    "the children's close",
    () => userEvent.click(screen.getByRole('button', { name: 'Cancel' })),
  ],
  ['a click outside', () => userEvent.click(underlay())],
];

describe('BusyDialog', () => {
  it.each(paths)('closes on %s while idle', async (_, dismiss) => {
    const { onOpenChange } = renderDialog(false);

    await dismiss();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each(paths)('stays open on %s while busy', async (_, dismiss) => {
    // A stray dismissal must not orphan a request already on its way to a server.
    const { onOpenChange } = renderDialog(true);

    await dismiss();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lets go once the request settles', async () => {
    const { onOpenChange, view } = renderDialog(true);

    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();

    view.rerender(
      <BusyDialog isOpen onOpenChange={onOpenChange} isBusy={false}>
        <DialogHeader>Rename</DialogHeader>
      </BusyDialog>,
    );
    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('takes plain children', () => {
    render(
      <BusyDialog isOpen onOpenChange={jest.fn()} isBusy={false}>
        <DialogHeader>Plain</DialogHeader>
      </BusyDialog>,
    );

    expect(screen.getByText('Plain')).toBeInTheDocument();
  });
});
