import { Dialog, DialogBody, DialogHeader } from '@backstage/ui';
import type { AgentRow } from '../AgentsDataProvider';
import { NewSessionComposer } from '../NewSessionComposer';

export type NewSessionDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  agents: AgentRow[];
  isLoadingAgents?: boolean;
  defaultAgent?: AgentRow;
  isStarting: boolean;
  error?: string;
  onStart: (agent: AgentRow, prompt: string) => void;
};

/**
 * The composer in a modal, for the places a permanently visible one would not
 * belong — today the agent detail page, where starting a session is one action
 * among several rather than the point of the screen.
 *
 * Deliberately thin: everything about composing lives in
 * {@link NewSessionComposer}, including its own `<form>` and Start button, so
 * there is no `DialogFooter` here. A footer would mean two submit buttons for one
 * form.
 *
 * Two conventions borrowed from `SessionRenameDialog`, both load-bearing. It does
 * **not** close on submit — the create can fail, and this is the only place left
 * to say so, as well as the only place the prompt still exists. And it cannot be
 * dismissed while a create is in flight, so a stray click outside cannot orphan a
 * write already on its way to kagent. The caller closes it by navigating away.
 */
export function NewSessionDialog({
  isOpen,
  onOpenChange,
  isStarting,
  ...composerProps
}: NewSessionDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      // Gated here rather than only through `isDismissable` /
      // `isKeyboardDismissDisabled`: those reach the outside click and Escape but
      // not `DialogHeader`'s own close button, which bui renders unconditionally
      // and routes through this callback.
      onOpenChange={next => {
        if (!isStarting) {
          onOpenChange(next);
        }
      }}
      isDismissable={!isStarting}
      isKeyboardDismissDisabled={isStarting}
      width="min(90vw, 560px)"
    >
      <DialogHeader>New session</DialogHeader>
      <DialogBody>
        <NewSessionComposer
          {...composerProps}
          isStarting={isStarting}
          // Deliberate here and only here: this is a modal the user opened in
          // order to type, and react-aria focuses the dialog container rather
          // than the field. See the composer, which carries the full reasoning.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </DialogBody>
    </Dialog>
  );
}
