import { ReactNode } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
} from '@backstage/ui';

export type ConfirmDialogProps = {
  isOpen: boolean;
  /**
   * Called with `false` when the dialog wants to close (Cancel, Escape, a click
   * outside). Never called as a result of confirming — see {@link onConfirm}.
   */
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  /** What is about to happen, and anything the user should weigh before saying yes. */
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm button label while `isBusy`. Defaults to `confirmLabel`. */
  busyLabel?: string;
  /** Renders the confirm button in the destructive (red) treatment. */
  destructive?: boolean;
  /** The confirmed action is in flight: both buttons lock and the dialog stays put. */
  isBusy?: boolean;
  /** Shown as a danger alert above the buttons. Typically a failed attempt's message. */
  error?: ReactNode;
  onConfirm: () => void;
  width?: number | string;
};

/**
 * A modal that asks before doing something the user cannot take back.
 *
 * Controlled rather than wrapping a `DialogTrigger`, for two reasons. It is the
 * only thing that works when the trigger is a `MenuItem` — react-aria unmounts
 * the menu on selection, taking any trigger inside it along. And it is what lets
 * the caller decide when the dialog goes away.
 *
 * Which matters, because confirming deliberately does *not* close it: an action
 * that can fail needs somewhere to say so, and a dialog that dismisses itself on
 * confirm has thrown away the only place the user was still looking. So the
 * caller runs the action, passes `isBusy` while it is in flight and `error` if it
 * fails, and closes the dialog when it succeeds. While busy the dialog is also
 * undismissable — a stray click outside must not orphan a request that is already
 * on its way to a server.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busyLabel,
  destructive,
  isBusy = false,
  error,
  onConfirm,
  width = 'min(90vw, 520px)',
}: ConfirmDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      width={width}
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          {children}
          {error ? <Alert status="danger" description={error} /> : null}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={isBusy}
          onClick={() => onOpenChange(false)}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          destructive={destructive}
          isPending={isBusy}
          onClick={onConfirm}
        >
          {isBusy ? (busyLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
