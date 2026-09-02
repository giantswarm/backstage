import { useEffect, useMemo, useState } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Switch,
  Text,
  TextField,
} from '@backstage/ui';

import { usePullModel } from '../../hooks/usePullJobs';
import { validateModelRef } from '../../lib/modelManagerServing';

/** Long enough to read two lines, short enough not to follow you around. */
const TOAST_TIMEOUT_MS = 6000;

/** An installation the dialog can pull on, and whether it can wire. */
export type PullTarget = {
  name: string;
  /** The backend creates kagent ModelConfigs (`wire` capability). */
  canWire: boolean;
};

export type PullModelDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Installations whose backend reports the `pull` capability. */
  targets: PullTarget[];
};

/**
 * Asks for a model reference and starts its import.
 *
 * Nothing here waits for the download: model-manager answers with a job at
 * once and the downloads panel follows its progress, so the dialog closes on
 * acceptance and says where to look. A reference that the backend proxy would
 * refuse is caught before it is sent (same rule, kinder message), and a pull
 * of a reference that is already downloading is joined by model-manager, not
 * duplicated — the panel shows one job either way.
 *
 * Controlled like `ConfirmDialog`: confirming does not close it, so a failed
 * request has somewhere to say so.
 */
export function PullModelDialog({
  isOpen,
  onOpenChange,
  targets,
}: PullModelDialogProps) {
  const toastApi = useApi(toastApiRef);
  const [installation, setInstallation] = useState(targets[0]?.name ?? '');
  const [model, setModel] = useState('');
  const [wire, setWire] = useState(true);
  const [validationError, setValidationError] = useState<string>();

  // A target list that changes under an open dialog (an installation became
  // unreachable) must not leave the select pointing at nothing.
  useEffect(() => {
    if (!targets.some(target => target.name === installation)) {
      setInstallation(targets[0]?.name ?? '');
    }
  }, [targets, installation]);

  // Start clean every time it opens, including a previous attempt's error.
  useEffect(() => {
    if (isOpen) {
      setModel('');
      setWire(true);
      setValidationError(undefined);
    }
  }, [isOpen]);

  const target = useMemo(
    () => targets.find(candidate => candidate.name === installation),
    [targets, installation],
  );
  const pull = usePullModel(installation);
  const { reset } = pull;
  useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const submit = async () => {
    const problem = validateModelRef(model);
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(undefined);

    const reference = model.trim();
    let result: Awaited<ReturnType<typeof pull.mutateAsync>>;
    try {
      result = await pull.mutateAsync({
        model: reference,
        ...(target?.canWire ? { wire } : {}),
      });
    } catch {
      // Left to the dialog, which stays open and renders `pull.error`.
      return;
    }

    onOpenChange(false);
    toastApi.post({
      title: result.created
        ? `Pulling ${reference} on ${installation}`
        : `${reference} is already being pulled on ${installation}`,
      description:
        'Progress shows in the downloads list below the served models.',
      status: 'info',
      timeout: TOAST_TIMEOUT_MS,
    });
  };

  const isBusy = pull.isPending;
  const error = validationError ?? pull.error?.message;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      width="min(90vw, 560px)"
    >
      <DialogHeader>Pull a model</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text variant="body-medium" color="secondary">
            Downloads the model onto the installation's serving backend. Give a
            registry tag such as <code>qwen2.5:0.5b</code>, or a Hugging Face
            GGUF reference such as <code>hf.co/org/repo:Q4_K_M</code>.
          </Text>

          {targets.length > 1 && (
            <Select
              label="Installation"
              isRequired
              isDisabled={isBusy}
              options={targets.map(candidate => ({
                id: candidate.name,
                label: candidate.name,
              }))}
              selectedKey={installation}
              onSelectionChange={key => {
                if (key) {
                  setInstallation(String(key));
                }
              }}
            />
          )}

          <TextField
            label="Model reference"
            isRequired
            isDisabled={isBusy}
            value={model}
            onChange={setModel}
            placeholder="e.g. qwen2.5:0.5b"
            description="Agents need a model with tool calling; the inventory shows each model's features once it is downloaded."
          />

          {target?.canWire && (
            <Switch
              label="Create a kagent ModelConfig when the download finishes, so agents can use the model"
              isDisabled={isBusy}
              isSelected={wire}
              onChange={setWire}
            />
          )}

          {error ? <Alert status="danger" description={error} /> : null}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={isBusy}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          isPending={isBusy}
          isDisabled={!target}
          onClick={submit}
        >
          {isBusy ? 'Starting…' : 'Pull'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
