import { ReactNode, useMemo, useRef, useState } from 'react';
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
  ConfirmDialog,
  dialogDismissLock,
  useFieldValidation,
  useOnDialogOpen,
  type FieldBlurProps,
} from '@giantswarm/backstage-plugin-ui-react';
import { useApi } from '@backstage/core-plugin-api';
import {
  useTrackedMutation,
  type PortalEvent,
} from '@giantswarm/backstage-plugin-analytics-react';
import { musterApiRef } from '../../../apis';
import { mutationErrorMessage } from '../../../lib/authError';
import { useMusterMutationRefresh } from '../../MusterInstanceProvider';

export type DefinitionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Why the text does not parse, once the field shows it: the editor shows it
   * under itself (`fieldErrorProps`, `FieldErrorText`). A tool's refusal or a
   * failed call (an expired session, the network) is not this; the dialog
   * shows those above its buttons.
   */
  error?: string;
  /** Spread onto the editor, so leaving it checks the text. */
  blurProps: FieldBlurProps;
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
   * message is shown on the editor.
   */
  parse: (value: string) => Record<string, unknown>;
  renderEditor: (props: DefinitionEditorProps) => ReactNode;
  /** The muster tool that checks a definition and writes nothing. */
  validateTool: string;
  /** The muster tool that writes the definition. */
  saveTool: string;
  /**
   * What a save reports once it went through, or why it reports nothing (an
   * edit through a create flow, say).
   */
  saveTracking:
    | { event: PortalEvent; untrackedReason?: never }
    | { event: null; untrackedReason: string };
  /** The success message once the save went through. */
  savedMessage: string;
};

/**
 * A live muster definition in an editor: Validate runs `validateTool`, Save
 * runs `saveTool`, both through the `/call` proxy against `installation`.
 *
 * The dialog cannot be dismissed while either call is in flight, so a stray
 * click cannot orphan a write; the editor is seeded on open only, so a polled
 * resource does not overwrite what the user is typing. With unsaved edits the
 * footer's dismiss says "Discard changes", and Escape, a click outside or the
 * header's close ask first ("Discard changes" / "Keep editing", the wizard
 * frame's idiom).
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
  saveTracking,
  savedMessage,
}: DefinitionEditorDialogProps) {
  const musterApi = useApi(musterApiRef);
  const refresh = useMusterMutationRefresh(installation);
  const [value, setValue] = useState('');
  // What the editor held when it opened or last saved: edits past it are
  // unsaved, and closing would lose them.
  const [baseline, setBaseline] = useState('');
  const submitted = useRef('');
  const [isDiscardOpen, setDiscardOpen] = useState(false);
  const isDirty = value !== baseline;
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  // The text's own problem shows on the editor once the person leaves it or
  // presses Validate or Save, and follows each change from then on (the
  // `forms` skill).
  const scope = useRef<HTMLDivElement>(null);
  const fieldCheck = useFieldValidation(scope, { isOpen: open });
  const parsed = useMemo<
    { definition: Record<string, unknown> } | { problem: string }
  >(() => {
    try {
      return { definition: parse(value) };
    } catch (e) {
      return {
        problem:
          (e instanceof Error && e.message) ||
          'The definition could not be parsed.',
      };
    }
  }, [parse, value]);
  const parseProblem = 'problem' in parsed ? parsed.problem : undefined;

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
    ...(saveTracking.event
      ? { event: () => saveTracking.event }
      : { event: null, untrackedReason: saveTracking.untrackedReason }),
    mutationFn: (def: Record<string, unknown>) =>
      musterApi.callTool(saveTool, def, installation),
    onSuccess: () => {
      // muster writes the CR synchronously, so refetching now shows the
      // change instead of waiting for the next 30s poll.
      refresh();
      setBaseline(submitted.current);
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
    const seeded = seed();
    setValue(seeded);
    setBaseline(seeded);
    setDiscardOpen(false);
    setError(undefined);
    setMessage(undefined);
  });

  const submit = (mutation: typeof validation) => {
    setError(undefined);
    setMessage(undefined);
    // On the parse's verdict, not the value's truthiness: `null` or `0`
    // parse, and muster's own answer says what is wrong with them.
    if ('problem' in parsed) {
      fieldCheck.reveal();
      return;
    }
    submitted.current = value;
    mutation.mutate(parsed.definition);
  };

  return (
    <Dialog
      isOpen={open}
      {...dialogDismissLock(Boolean(busy), next => {
        if (!next) {
          if (isDirty) {
            setDiscardOpen(true);
          } else {
            onClose();
          }
        }
      })}
      width="min(90vw, 860px)"
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3" ref={scope}>
          <Text as="p" variant="body-medium">
            {description} Validate before saving; both run as live mutations
            against installation <code>{installation}</code>.
          </Text>
          {renderEditor({
            value,
            onChange: edited => {
              setValue(edited);
              // The last call's verdict was about the text before this edit.
              setMessage(undefined);
              setError(undefined);
            },
            error: fieldCheck.errorFor('definition', parseProblem),
            blurProps: fieldCheck.blurProps('definition', parseProblem),
          })}
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
          {isDirty ? 'Discard changes' : 'Close'}
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
      <ConfirmDialog
        isOpen={isDiscardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
      >
        <Text variant="body-medium">What you entered will not be saved.</Text>
      </ConfirmDialog>
    </Dialog>
  );
}
