import { ReactNode } from 'react';
import { Dialog, DialogProps } from '@backstage/ui';
import { dialogDismissLock } from '../../utils/dialogDismissLock';

export type BusyDialogProps = Omit<
  DialogProps,
  | 'children'
  | 'isOpen'
  | 'onOpenChange'
  | 'isDismissable'
  | 'isKeyboardDismissDisabled'
> & {
  isOpen: boolean;
  /**
   * Called with `false` when the dialog wants to close, and never while
   * `isBusy`: not for Escape, a click outside, the header's close button or the
   * `close` handed to the children.
   */
  onOpenChange: (isOpen: boolean) => void;
  /** A write is in flight: every way out of the dialog is shut until it settles. */
  isBusy: boolean;
  /**
   * The dialog's content. As a function it receives `close`, the gated close
   * for a footer's Cancel or Close, which does nothing while `isBusy`.
   */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/**
 * A controlled bui `Dialog` that stays open while `isBusy`: a stray click
 * outside, Escape, the header's close button or a footer's Cancel must not
 * orphan a request already on its way to a server.
 *
 * The gate lives here rather than at each call site, so a dialog cannot leave
 * one of its close paths ungated: there is no ungated `onOpenChange` to reach
 * for. A footer's Cancel takes `close` from the children function, and a
 * caller that only knows "closed" adapts in its `onOpenChange`.
 *
 * ```tsx
 * <BusyDialog isOpen={isOpen} onOpenChange={onOpenChange} isBusy={isSaving}>
 *   {close => (
 *     <>
 *       <DialogHeader>Rename</DialogHeader>
 *       <DialogFooter>
 *         <Button onPress={close} isDisabled={isSaving}>Cancel</Button>
 *       </DialogFooter>
 *     </>
 *   )}
 * </BusyDialog>
 * ```
 */
export function BusyDialog({
  isOpen,
  onOpenChange,
  isBusy,
  children,
  ...dialogProps
}: BusyDialogProps) {
  const lock = dialogDismissLock(isBusy, onOpenChange);
  const close = () => lock.onOpenChange(false);
  return (
    <Dialog {...dialogProps} isOpen={isOpen} {...lock}>
      {typeof children === 'function' ? children(close) : children}
    </Dialog>
  );
}
