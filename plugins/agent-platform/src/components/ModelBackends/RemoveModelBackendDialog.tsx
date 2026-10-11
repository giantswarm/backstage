import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
  TextField,
} from '@backstage/ui';
import {
  dialogDismissLock,
  fieldErrorProps,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { useBackendWrite } from '../../hooks/useModelManagerBackends';
import { useOpenGeneration } from '../../hooks/useOpenGeneration';
import {
  BACKEND_KIND_LABEL,
  MODEL_MANAGER_SERVER,
  type BackendKind,
  type RemoveBackendResult,
} from '../../lib/modelManagerBackends';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { DIALOG_FORM_STYLE } from '../dialogForm';

export type RemoveModelBackendDialogProps = {
  installation: string;
  kind: BackendKind;
  /** The served models of the backend, by name — what goes with the group. */
  servedModels: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** After the remove: the document is gone and the ModelConfigs unwired. */
  onRemoved?: (result: RemoveBackendResult) => void;
};

/**
 * Remove backend — on a Serving group's header: `remove_backend` with
 * `dryRun` on open, so the confirm lists what the tool reports it would take
 * (the ConfigMap, the ModelConfigs model-manager wired for the backend), next
 * to the served models of the group; the person types the kind to confirm;
 * then the remove as the person. A refusal — a static backend from the
 * chart's values, no document — is model-manager's, shown verbatim, and the
 * confirm stays disabled. A Remove pressed before the kind is typed says so
 * on the field and moves the focus there (`useFieldValidation`), like the
 * app's other forms.
 */
export function RemoveModelBackendDialog({
  installation,
  kind,
  servedModels,
  isOpen,
  onOpenChange,
  onRemoved,
}: RemoveModelBackendDialogProps) {
  const [typed, setTyped] = useState('');
  const [plan, setPlan] = useState<RemoveBackendResult>();
  const [removed, setRemoved] = useState<RemoveBackendResult>();
  const write = useBackendWrite(installation);
  const startAnswer = useOpenGeneration(isOpen);
  const label = BACKEND_KIND_LABEL[kind];
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);

  useEffect(() => {
    if (!isOpen) {
      setTyped('');
      setPlan(undefined);
      setRemoved(undefined);
      validation.reset();
      write.reset();
      return;
    }
    const isCurrent = startAnswer();
    write
      .dryRunRemove(kind)
      .then(answer => {
        if (isCurrent()) {
          setPlan(answer);
        }
      })
      .catch(() => {
        // Shown from `write.failure`; the confirm stays disabled.
      });
    // `write` changes identity every render; one dry run per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, kind, installation]);

  const isBusy = write.isBusy;
  const notConnected = write.failure?.kind === 'not-connected';
  // Nothing to confirm until model-manager has said what would go.
  const canConfirm = Boolean(plan) && !removed && !isBusy;
  const typedError =
    typed === kind ? undefined : `Type ${kind} to confirm the removal.`;

  const onConfirm = async () => {
    if (typedError) {
      validation.reveal();
      return;
    }
    try {
      const result = await write.remove(kind, 'apply');
      setRemoved(result);
      onRemoved?.(result);
    } catch {
      // Shown from `write.failure`.
    }
  };

  const unwired = plan?.modelConfigs ?? [];

  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(write.isWriting, onOpenChange)}
    >
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault();
          if (canConfirm) {
            onConfirm();
          }
        }}
        style={DIALOG_FORM_STYLE}
      >
        <DialogHeader>
          Remove {label} backend from {installation}?
        </DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="3" ref={scope}>
            <Text variant="body-small" color="secondary">
              model-manager unwires its model configs, deletes its backend
              document and stops listing it. The backend and its models keep
              running.
            </Text>
            {plan && (
              <Flex direction="column" gap="1" data-testid="remove-plan">
                <Text variant="body-small">
                  ConfigMap {plan.configMap.namespace}/{plan.configMap.name}
                </Text>
                <Text variant="body-small">
                  {unwired.length === 0
                    ? 'No model configs are wired for it.'
                    : `Model configs unwired: ${unwired.join(', ')}`}
                </Text>
                {servedModels.length > 0 && (
                  <Text variant="body-small">
                    Served models leaving this page: {servedModels.join(', ')}
                  </Text>
                )}
              </Flex>
            )}
            {!plan && !write.failure && (
              <Text variant="body-small" color="secondary">
                Asking model-manager what would go…
              </Text>
            )}
            {write.failure && !notConnected && (
              <Alert
                status="danger"
                title="model-manager refused"
                description={write.failure.message}
              />
            )}
            {notConnected && (
              <ConnectAgentManagerAlert
                installation={installation}
                message={write.failure!.message}
                action="Model backends are removed"
                server={MODEL_MANAGER_SERVER}
              />
            )}
            {removed && (
              <Alert
                status="success"
                title={`Removed the ${label} backend as you`}
                description={
                  removed.unwired && removed.unwired.length > 0
                    ? `Model configs unwired: ${removed.unwired.join(', ')}.`
                    : 'No model configs had to be unwired.'
                }
              />
            )}
            {plan && !removed && (
              <TextField
                label={`Type ${kind} to confirm`}
                value={typed}
                onChange={setTyped}
                isDisabled={isBusy}
                {...fieldErrorProps(validation.errorFor(typedError))}
              />
            )}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            onPress={() => onOpenChange(false)}
            isDisabled={write.isWriting}
          >
            {removed ? 'Close' : 'Cancel'}
          </Button>
          {!removed && (
            <Button type="submit" variant="primary" isDisabled={!canConfirm}>
              {isBusy && plan ? 'Removing…' : 'Remove backend'}
            </Button>
          )}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
