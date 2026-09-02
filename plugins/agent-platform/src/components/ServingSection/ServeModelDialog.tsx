import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Grid,
  NumberField,
  Select,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';

import {
  composeInferenceService,
  fitCheck,
  initialServeModelRequest,
  MAX_INFERENCESERVICE_NAME_LENGTH,
  validateServeModelRequest,
  type ServeModelRequest,
} from '../../lib/serveModel';
import type { GpuNode } from '../../lib/serving';
import type {
  ModelServingConfig,
  ServingPreset,
} from '../../lib/servingPresets';

/** Select key for "no node pin". */
export const ANY_NODE = '__any__';

export type ServeModelConfirmation = {
  preset: ServingPreset;
  config: ModelServingConfig;
  request: ServeModelRequest;
  /** The composed InferenceService, ready to create. */
  manifest: Record<string, unknown>;
};

export type ServeModelDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Installations with presets, in order. One = no choice offered. */
  installations: string[];
  installation: string | undefined;
  onInstallationChange: (installation: string) => void;
  /** The selected installation's presets, discovery config and GPU nodes. */
  presets: ServingPreset[];
  config: ModelServingConfig | undefined;
  gpuNodes: GpuNode[];
  /** InferenceServices already in the serving namespace there. */
  existingNames: string[];
  /** Whether the user may create InferenceServices there (SelfSubjectAccessReview). */
  permission: { allowed: boolean; isLoading: boolean };
  isServing: boolean;
  /** A failed attempt's message. */
  error?: string;
  onConfirm: (confirmation: ServeModelConfirmation) => void;
};

function presetSummary(preset: ServingPreset): string {
  const parts = [
    preset.model.id,
    `${preset.requirements.weightsGiB} GiB of weights`,
    `${preset.resources.gpus} GPU${preset.resources.gpus === 1 ? '' : 's'}`,
  ];
  if (preset.model.contextLength) {
    parts.push(
      `${preset.model.contextLength.toLocaleString()} tokens of context`,
    );
  }
  if (preset.model.capabilities.length > 0) {
    parts.push(preset.model.capabilities.join(', '));
  }
  return parts.join(' · ');
}

/** The cache line of the notice, from what the discovery config says. */
export function cacheNotice(config: ModelServingConfig): string {
  if (config.cache.enabled && config.cache.redirectPolicy) {
    return 'The model cache is wired at admission: the weights download once and every restart reuses them.';
  }
  if (config.cache.enabled) {
    return 'The model cache exists but the admission policies are off on this installation, so the weights download on every start.';
  }
  return 'No model cache is configured on this installation, so the weights download on every start.';
}

/**
 * Serves a model from a curated preset: the preset carries everything
 * model-specific (flags, chat template, memory numbers), the dialog collects
 * the deployment-time choices — name, model source, GPUs, target node — runs
 * the fit check against the chosen node, and composes the InferenceService.
 *
 * Presentational like the other dialogs here: the parent runs the create,
 * passes `isServing` while it is in flight and `error` if it fails, and
 * closes the dialog on success — so a failure has somewhere to be shown.
 * While in flight the dialog cannot be dismissed.
 *
 * The advanced field appends arguments after the preset's; it never replaces
 * them, and the runtime-owned flags are refused — a blank flags field is
 * exactly what the preset design exists to avoid.
 */
export function ServeModelDialog({
  isOpen,
  onOpenChange,
  installations,
  installation,
  onInstallationChange,
  presets,
  config,
  gpuNodes,
  existingNames,
  permission,
  isServing,
  error,
  onConfirm,
}: ServeModelDialogProps) {
  const [presetName, setPresetName] = useState<string | undefined>();
  const [request, setRequest] = useState<ServeModelRequest | undefined>();
  const [showValidation, setShowValidation] = useState(false);

  const preset = presets.find(candidate => candidate.name === presetName);

  // A single GPU node is the obvious target; with several, or none known, the
  // scheduler decides unless the user picks one.
  const defaultNode = gpuNodes.length === 1 ? gpuNodes[0].name : undefined;

  // Re-seed on the closed → open transition and whenever the preset changes;
  // never on live data changes under an open dialog.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setShowValidation(false);
      setPresetName(presets[0]?.name);
      setRequest(
        presets[0]
          ? initialServeModelRequest(presets[0], defaultNode)
          : undefined,
      );
    }
    wasOpen.current = isOpen;
    // Seeding is tied to the open transition; presets/defaultNode are read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    // The installation changed (or presets arrived): start from its first preset.
    if (!preset && presets[0]) {
      setPresetName(presets[0].name);
      setRequest(initialServeModelRequest(presets[0], defaultNode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, presets, preset]);

  const choosePreset = (name: string) => {
    const next = presets.find(candidate => candidate.name === name);
    if (next) {
      setPresetName(name);
      setRequest(initialServeModelRequest(next, request?.node ?? defaultNode));
      setShowValidation(false);
    }
  };

  const node = gpuNodes.find(candidate => candidate.name === request?.node);
  const fit = useMemo(
    () =>
      preset && request
        ? fitCheck({ preset, gpus: request.gpus, node })
        : undefined,
    [preset, request, node],
  );

  const validationErrors =
    preset && request && fit
      ? validateServeModelRequest(request, { existingNames, fit })
      : ['Pick a preset'];

  const canSubmit =
    Boolean(preset && config && request) &&
    permission.allowed &&
    !permission.isLoading &&
    !isServing;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!preset || !config || !request || !canSubmit) {
      return;
    }
    if (validationErrors.length > 0) {
      setShowValidation(true);
      return;
    }
    onConfirm({
      preset,
      config,
      request,
      manifest: composeInferenceService({ preset, config, request }),
    });
  };

  const patch = (changes: Partial<ServeModelRequest>) =>
    setRequest(previous => (previous ? { ...previous, ...changes } : previous));

  return (
    <Dialog
      isOpen={isOpen}
      // Gated here as well as through isDismissable: the header's close button
      // routes through this callback regardless (see SessionRenameDialog).
      onOpenChange={next => {
        if (!isServing) {
          onOpenChange(next);
        }
      }}
      isDismissable={!isServing}
      isKeyboardDismissDisabled={isServing}
      width="min(90vw, 760px)"
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader>Serve a model</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text color="secondary">
              A curated preset carries the model-specific recipe — vLLM flags,
              chat template, memory needs. Choose where it runs; the portal
              composes the InferenceService and, once the model answers, creates
              the model config agents use.
            </Text>

            {installations.length > 1 && (
              <Select
                label="Installation"
                isRequired
                options={installations.map(name => ({ id: name, label: name }))}
                selectedKey={installation ?? null}
                onSelectionChange={key => {
                  if (key) {
                    onInstallationChange(String(key));
                  }
                }}
              />
            )}

            <Select
              label="Preset"
              isRequired
              options={presets.map(candidate => ({
                id: candidate.name,
                label: candidate.displayName,
              }))}
              selectedKey={presetName ?? null}
              onSelectionChange={key => {
                if (key) {
                  choosePreset(String(key));
                }
              }}
              description={preset ? presetSummary(preset) : undefined}
            />
            {preset?.description && (
              <Text
                as="p"
                variant="body-small"
                color="secondary"
                style={{ whiteSpace: 'pre-line' }}
              >
                {preset.description.trim()}
              </Text>
            )}

            {request && (
              <>
                <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
                  <Grid.Item>
                    <TextField
                      label="Name"
                      isRequired
                      value={request.name}
                      onChange={name => patch({ name })}
                      maxLength={MAX_INFERENCESERVICE_NAME_LENGTH}
                      description="The InferenceService name; also what agents address the model as, and the name of the model config."
                    />
                  </Grid.Item>
                  <Grid.Item>
                    <TextField
                      label="Model source"
                      isRequired
                      value={request.storageUri}
                      onChange={storageUri => patch({ storageUri })}
                      description="Where the weights come from: hf://owner/name downloads from Hugging Face; pvc://claim/dir serves pre-warmed weights."
                    />
                  </Grid.Item>
                </Grid.Root>

                <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
                  <Grid.Item>
                    <NumberField
                      label="GPUs"
                      isRequired
                      minValue={0}
                      step={1}
                      value={request.gpus}
                      onChange={gpus =>
                        patch({ gpus: Number.isNaN(gpus) ? 0 : gpus })
                      }
                      description={
                        config
                          ? `Requested as ${config.gpuResourceName}.`
                          : undefined
                      }
                    />
                  </Grid.Item>
                  <Grid.Item>
                    <Select
                      label="Target node"
                      options={[
                        { id: ANY_NODE, label: 'Any node (scheduler decides)' },
                        ...gpuNodes.map(candidate => ({
                          id: candidate.name,
                          label: candidate.product
                            ? `${candidate.name} · ${candidate.product}`
                            : candidate.name,
                        })),
                      ]}
                      selectedKey={request.node ?? ANY_NODE}
                      onSelectionChange={key =>
                        patch({
                          node:
                            key && String(key) !== ANY_NODE
                              ? String(key)
                              : undefined,
                          acknowledgeFit: false,
                        })
                      }
                      description="The GPU nodes this installation reports. Pinning lets the fit check use that node's memory."
                    />
                  </Grid.Item>
                </Grid.Root>

                {fit && fit.verdict === 'fits' && (
                  <Alert
                    status="success"
                    title={`Fits on ${request.node}`}
                    description={fit.notes.join(' ')}
                  />
                )}
                {fit && fit.verdict === 'unknown' && (
                  <Alert
                    status="info"
                    title="Fit not checked"
                    description={fit.notes.join(' ')}
                  />
                )}
                {fit && fit.verdict === 'doesNotFit' && (
                  <Flex direction="column" gap="2">
                    <Alert
                      status="danger"
                      title={`Does not fit on ${request.node}`}
                      description={[...fit.problems, ...fit.notes].join(' ')}
                    />
                    <Checkbox
                      isSelected={request.acknowledgeFit}
                      onChange={acknowledgeFit => patch({ acknowledgeFit })}
                    >
                      Serve anyway — I understand vLLM may fail to load the
                      model on this node
                    </Checkbox>
                  </Flex>
                )}

                <TextAreaField
                  label="Additional vLLM arguments"
                  secondaryLabel="advanced"
                  rows={3}
                  value={request.extraArgs}
                  onChange={extraArgs => patch({ extraArgs })}
                  placeholder={'--max-num-seqs=2\n--enable-prefix-caching'}
                  description="Appended after the preset's arguments, one per line; the preset's flags stay as they are. --model, --port, --served-model-name and --chat-template belong to the runtime and the preset and cannot be overridden."
                />

                {config && (
                  <Alert
                    status="info"
                    title="Before agents can use it"
                    description={`The platform does not yet ship network policies for the serving namespace. Where network policies are enforced, allow agents (namespace kagent) to reach the predictor in ${config.namespace}, and the storage-initializer to reach Hugging Face — otherwise the download or the requests fail silently. ${cacheNotice(config)}`}
                  />
                )}
              </>
            )}

            {!permission.isLoading && !permission.allowed && installation && (
              <Alert
                status="warning"
                title="Not allowed"
                description={`Your account may not create InferenceServices in ${
                  config?.namespace ?? 'the serving namespace'
                } on ${installation}, so the cluster would refuse this. Ask a platform administrator for the permission.`}
              />
            )}

            {showValidation && validationErrors.length > 0 && (
              <Alert
                status="danger"
                title="Please fix the following before continuing"
                description={validationErrors.join('. ')}
              />
            )}
            {error ? (
              <Alert
                status="danger"
                title="The model could not be served"
                description={error}
              />
            ) : null}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            isDisabled={isServing}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isDisabled={!canSubmit}
            isPending={isServing}
          >
            {isServing ? 'Serving…' : 'Serve model'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
