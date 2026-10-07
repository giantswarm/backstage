import { ReactNode, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import {
  ALERT_MESSAGE_STYLE,
  useOnDialogOpen,
} from '@giantswarm/backstage-plugin-ui-react';
import { useApi } from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { musterApiRef } from '../../../apis';
import { mutationErrorMessage } from '../../../lib/authError';
import { useMusterMutationRefresh } from '../../MusterInstanceProvider';

export type DefinitionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Whether the dialog currently shows an error. */
  invalid: boolean;
};

export type DefinitionEditorDialogProps = {
  open: boolean;
  onClose: () => void;
  /** The installation whose muster both tools run against. */
  installation?: string;
  title: ReactNode;
  /** Shown above the editor; the installation sentence follows it. */
  description: ReactNode;
  /** The editor's text each time the dialog opens. */
  seed: () => string;
  /**
   * Turns the editor's text into the tool arguments. Throws an `Error` whose
   * message is shown as the dialog's error.
   */
  parse: (value: string) => Record<string, unknown>;
  renderEditor: (props: DefinitionEditorProps) => ReactNode;
  /** The muster tool that checks a definition and writes nothing. */
  validateTool: string;
  /** The muster tool that writes the definition. */
  saveTool: string;
  /** Why the save is not a tracked portal action. */
  saveUntrackedReason: string;
  /** The success message once the save went through. */
  savedMessage: string;
};

/**
 * A live muster definition in an editor: Validate runs `validateTool`, Save
 * runs `saveTool`, both through the `/call` proxy against `installation`.
 *
 * The dialog cannot be dismissed while either call is in flight, so a stray
 * click cannot orphan a write; the editor is seeded on open only, so a polled
 * resource does not overwrite what the user is typing.
 */
export function DefinitionEditorDialog({
  open,
  onClose,
  installation,
  title,
  description,
  seed,
  parse,
  renderEditor,
  validateTool,
  saveTool,
  saveUntrackedReason,
  savedMessage,
}: DefinitionEditorDialogProps) {
  const musterApi = useApi(musterApiRef);
  const refresh = useMusterMutationRefresh(installation);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  const onError = (e: Error) => setError(mutationErrorMessage(e));
  const validation = useTrackedMutation({
    event: null,
    untrackedReason: 'A validation that writes nothing.',
    mutationFn: (def: Record<string, unknown>) =>
      musterApi.callTool(validateTool, def, installation),
    onSuccess: () => setMessage('Definition is valid.'),
    onError,
  });
  const save = useTrackedMutation({
    event: null,
    untrackedReason: saveUntrackedReason,
    mutationFn: (def: Record<string, unknown>) =>
      musterApi.callTool(saveTool, def, installation),
    onSuccess: () => {
      // muster writes the CR synchronously, so refetching now shows the
      // change instead of waiting for the next 30s poll.
      refresh();
      setMessage(savedMessage);
    },
    onError,
  });
  let busy: 'validate' | 'save' | undefined;
  if (validation.isPending) {
    busy = 'validate';
  } else if (save.isPending) {
    busy = 'save';
  }

  useOnDialogOpen(open, () => {
    setValue(seed());
    setError(undefined);
    setMessage(undefined);
  });

  const submit = (mutation: typeof validation) => {
    let def: Record<string, unknown>;
    try {
      def = parse(value);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError(undefined);
    setMessage(undefined);
    mutation.mutate(def);
  };

  return (
    <Dialog
      isOpen={open}
      // Gated here as well: DialogHeader's close button ignores isDismissable.
      onOpenChange={next => {
        if (!next && !busy) {
          onClose();
        }
      }}
      isDismissable={!busy}
      isKeyboardDismissDisabled={Boolean(busy)}
      width="min(90vw, 860px)"
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-medium">
            {description} Validate before saving; both run as live mutations
            against installation <code>{installation}</code>.
          </Text>
          {renderEditor({ value, onChange: setValue, invalid: Boolean(error) })}
          {error && (
            <Alert
              status="danger"
              description={<span style={ALERT_MESSAGE_STYLE}>{error}</span>}
            />
          )}
          {message && <Alert status="success" description={message} />}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={Boolean(busy)}
          onPress={onClose}
        >
          Close
        </Button>
        <Button
          variant="secondary"
          isDisabled={Boolean(busy)}
          isPending={busy === 'validate'}
          onPress={() => submit(validation)}
        >
          Validate
        </Button>
        <Button
          variant="primary"
          isDisabled={Boolean(busy)}
          isPending={busy === 'save'}
          onPress={() => submit(save)}
        >
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
