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
  isHuggingFaceRepository,
  MAX_INFERENCESERVICE_NAME_LENGTH,
  validateServeModelRequest,
  type ServeModelRequest,
} from '../../lib/serveModel';
import { formatBytes } from '../../lib/modelManagerServing';
import type { GpuNode, ServedModel } from '../../lib/serving';
import type {
  ModelServingConfig,
  ServingPreset,
} from '../../lib/servingPresets';
import { DIALOG_FORM_STYLE } from '../dialogForm';

/** Select key for "no node pin". */
export const ANY_NODE = '__any__';

/**
 * A model whose weights already sit in a node's cache (model-manager's
 * inventory, "downloaded on <node>"), offered by the serve flow as the source
 * of an InferenceService instead of a download.
 */
export type DownloadedModelOption = {
  /** Row id, the select key. */
  id: string;
  /**
   * What model-manager lists the directory as: the Hugging Face repository
   * when it knows which one filled the directory (pre-warm marker, preset or
   * InferenceService of the same name), else the bare directory name.
   */
  model: string;
  /** Node whose cache holds it. */
  node?: string;
  /** Cache directory — the InferenceService name the storage-initializer looks for. */
  cachePath?: string;
  /** The serving preset whose model this is, when model-manager attributed it. */
  preset?: string;
  sizeBytes?: number;
};

/** A "downloaded on <node>" row as the serve flow's weights option. */
export function toDownloadedModelOption(
  model: ServedModel,
): DownloadedModelOption {
  return {
    id: model.id,
    model: model.managerRef ?? model.modelSource ?? model.name,
    node: model.node,
    cachePath: model.cachePath,
    preset: model.preset,
    sizeBytes: model.sizeBytes,
  };
}

/** What a "Serve…" on a row hands the dialog to start from. */
export type ServeModelSeed = {
  download?: DownloadedModelOption;
  presetName?: string;
};

/**
 * One entry of the Model picker: a preset — served from the Hub, or from the
 * cache directory on a node that already holds its weights — or a cache
 * directory no preset claims, which needs a preset chosen for it explicitly.
 */
export type ServeModelChoice =
  | {
      kind: 'preset';
      id: string;
      preset: ServingPreset;
      download?: DownloadedModelOption;
    }
  | { kind: 'download'; id: string; download: DownloadedModelOption };

/**
 * Whether a cache directory holds a preset's model: model-manager's own
 * attribution when it made one, else the same Hugging Face repository (the
 * match model-manager uses too, case-insensitive on the repository id).
 */
export function downloadMatchesPreset(
  download: DownloadedModelOption,
  preset: ServingPreset,
): boolean {
  if (download.preset) {
    return download.preset === preset.name;
  }
  const repository = download.model.trim().toLowerCase();
  return (
    repository === preset.model.id.toLowerCase() ||
    repository === preset.model.storageUri.replace(/^hf:\/\//, '').toLowerCase()
  );
}

/**
 * The Model picker's entries: the presets in their order — one entry per node
 * whose cache holds the preset's weights, else the Hub download — then the
 * cache directories no preset claims.
 */
export function serveModelChoices(
  presets: ServingPreset[],
  downloads: DownloadedModelOption[],
): ServeModelChoice[] {
  const claimed = new Set<string>();
  const choices: ServeModelChoice[] = [];
  for (const preset of presets) {
    const cached = downloads.filter(download =>
      downloadMatchesPreset(download, preset),
    );
    if (cached.length === 0) {
      choices.push({ kind: 'preset', id: `preset/${preset.name}`, preset });
      continue;
    }
    for (const download of cached) {
      claimed.add(download.id);
      choices.push({
        kind: 'preset',
        id: `preset/${preset.name}/${download.id}`,
        preset,
        download,
      });
    }
  }
  for (const download of downloads) {
    if (!claimed.has(download.id)) {
      choices.push({
        kind: 'download',
        id: `download/${download.id}`,
        download,
      });
    }
  }
  return choices;
}

/**
 * The entry a seed lands on: the download a row's "Serve…" was pressed for
 * (under its preset when one claims it), else the named preset — its cached
 * entry when one exists, else its Hub download.
 */
export function choiceForSeed(
  choices: ServeModelChoice[],
  seed: ServeModelSeed | undefined,
): ServeModelChoice | undefined {
  if (seed?.download) {
    const downloadId = seed.download.id;
    const byDownload = choices.find(
      candidate => candidate.download?.id === downloadId,
    );
    if (byDownload) {
      return byDownload;
    }
  }
  if (seed?.presetName) {
    const ofPreset = choices.filter(
      candidate =>
        candidate.kind === 'preset' &&
        candidate.preset.name === seed.presetName,
    );
    return ofPreset.find(candidate => candidate.download) ?? ofPreset[0];
  }
  return undefined;
}

function cachedOn(download: DownloadedModelOption): string {
  return download.node ? `cached on ${download.node}` : 'cached';
}

/** The label of an entry in the Model picker. */
export function describeChoice(choice: ServeModelChoice): string {
  if (choice.kind === 'preset') {
    return `${choice.preset.displayName} · ${
      choice.download
        ? cachedOn(choice.download)
        : 'downloads from Hugging Face'
    }`;
  }
  return [
    choice.download.model,
    cachedOn(choice.download),
    choice.download.sizeBytes !== undefined
      ? formatBytes(choice.download.sizeBytes)
      : undefined,
    'no preset',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The `storageUri` that serves a cached download — always the directory's
 * own weights, never another model's source. With the cache's admission
 * policies on and the repository known, the repository itself: the
 * storage-initializer is redirected into `<claim>/<InferenceService name>`
 * and finds the files (which is why the InferenceService takes the cache
 * directory's name). Otherwise the claim directly (`pvc://<claim>/<dir>`),
 * which downloads nothing either way; a directory whose repository is not
 * recorded can only be served that way. Empty when neither is possible.
 */
export function storageUriForDownload(
  download: DownloadedModelOption,
  config: ModelServingConfig | undefined,
): string {
  const repository = isHuggingFaceRepository(download.model)
    ? download.model.trim()
    : undefined;
  const claim =
    config?.cache.enabled && config.cache.claimName && download.cachePath
      ? `pvc://${config.cache.claimName}/${download.cachePath}`
      : undefined;
  if (repository && config?.cache.enabled && config.cache.redirectPolicy) {
    return `hf://${repository}`;
  }
  if (claim) {
    return claim;
  }
  return repository ? `hf://${repository}` : '';
}

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
  /**
   * Cached downloads on the selected installation (model-manager's per-node
   * inventory): a preset whose weights are cached is served from the cache,
   * and a directory no preset claims is offered with an explicit preset.
   */
  downloads?: DownloadedModelOption[];
  /**
   * Where to start from when the dialog opens: the download a "Serve…" on a
   * row was pressed for, and/or a preset. Read on the closed → open
   * transition only.
   */
  seed?: ServeModelSeed;
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

/** The line under the Model picker for the chosen entry. */
export function describeChoiceDetails(choice: ServeModelChoice): string {
  if (choice.kind === 'preset') {
    const from = choice.download
      ? ` · served from the cache directory ${
          choice.download.cachePath ?? choice.download.model
        }${choice.download.node ? ` on ${choice.download.node}` : ''}`
      : '';
    return `Preset ${choice.preset.name} · ${presetSummary(choice.preset)}${from}`;
  }
  const { download } = choice;
  const repository = isHuggingFaceRepository(download.model)
    ? `Repository ${download.model.trim()}`
    : 'The repository that filled this directory is not recorded';
  return `${repository} · cache directory ${
    download.cachePath ?? download.model
  }${
    download.node ? ` on ${download.node}` : ''
  }. No curated preset matches these weights.`;
}

/**
 * The network-policy notice, from what the discovery config says: charts from
 * 0.13.0 render the serving namespace's policies under `global.networkPolicy`
 * and publish `networkPolicy.{enabled, flavor}`; without the field (older
 * chart) or with `enabled: false` the operator writes them by hand where
 * policies are enforced.
 */
export function networkPolicyNotice(config: ModelServingConfig): {
  status: 'info' | 'warning';
  title: string;
  text: string;
} {
  if (config.networkPolicy?.enabled) {
    const flavor = config.networkPolicy.flavor
      ? ` (${config.networkPolicy.flavor} flavor)`
      : '';
    return {
      status: 'info',
      title: 'Network and cache',
      text: `The platform renders the network policies for the serving namespace ${config.namespace}${flavor}: agents and the portal reach the predictor, and the model download reaches Hugging Face. Other callers need components.modelServing.networkPolicy.predictor.additionalIngressNamespaces.`,
    };
  }
  return {
    status: 'warning',
    title: 'Before agents can use it',
    text: `This installation renders no network policies for the serving namespace (global.networkPolicy is off, or the chart predates 0.13.0). Where network policies are enforced, allow agents (namespace kagent) to reach the predictor in ${config.namespace} and the storage-initializer to reach Hugging Face — otherwise the download or the requests fail silently.`,
  };
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
 * Serves a model, starting from the model: the picker lists the curated
 * presets — each carrying the model-specific recipe (flags, chat template,
 * memory numbers) and served from a node's cache when the weights are already
 * there — and the cache directories no preset claims. A preset is derived
 * from the model; only a directory without one asks for a preset explicitly,
 * and then says the recipe was written for another model and wants that
 * acknowledged. The dialog collects the deployment-time choices — name,
 * model source, GPUs, target node — runs the fit check against the chosen
 * node, and composes the InferenceService.
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
  downloads = [],
  seed,
  permission,
  isServing,
  error,
  onConfirm,
}: ServeModelDialogProps) {
  const [choiceId, setChoiceId] = useState<string | undefined>();
  /** The preset picked for a cache directory no preset claims. */
  const [presetForDownload, setPresetForDownload] = useState<
    string | undefined
  >();
  const [request, setRequest] = useState<ServeModelRequest | undefined>();
  const [showValidation, setShowValidation] = useState(false);

  const choices = useMemo(
    () => serveModelChoices(presets, downloads),
    [presets, downloads],
  );
  const choice = choices.find(candidate => candidate.id === choiceId);
  const preset =
    choice?.kind === 'preset'
      ? choice.preset
      : presets.find(candidate => candidate.name === presetForDownload);
  /** Cached weights served with a recipe written for another model. */
  const presetMismatch = choice?.kind === 'download' && preset !== undefined;

  // A single GPU node is the obvious target; with several, or none known, the
  // scheduler decides unless the user picks one.
  const defaultNode = gpuNodes.length === 1 ? gpuNodes[0].name : undefined;

  /**
   * The request for an entry: from the preset alone for a Hub download; for
   * cached weights the InferenceService named after the cache directory so
   * the storage-initializer finds the files, pinned to the node that holds
   * them, with the directory's own source.
   */
  const requestFor = (
    next: ServeModelChoice,
    withPreset: ServingPreset | undefined,
    node: string | undefined,
  ): ServeModelRequest | undefined => {
    if (!withPreset) {
      return undefined;
    }
    const download = next.download;
    if (!download) {
      return initialServeModelRequest(withPreset, node);
    }
    return {
      ...initialServeModelRequest(withPreset, download.node ?? node),
      name: download.cachePath ?? withPreset.name,
      storageUri: storageUriForDownload(download, config),
    };
  };

  const presetOf = (next: ServeModelChoice): ServingPreset | undefined =>
    next.kind === 'preset' ? next.preset : undefined;

  // Re-seed on the closed → open transition (a dialog mounted open counts);
  // never on live data changes under an open dialog.
  const wasOpen = useRef(false);
  // Set by the seeding effect, consumed by the one below it in the same
  // commit: both read the pre-update state, and the fallback must not undo
  // the seed it cannot see yet.
  const justSeeded = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      justSeeded.current = true;
      setShowValidation(false);
      const seeded = choiceForSeed(choices, seed) ?? choices[0];
      setChoiceId(seeded?.id);
      setPresetForDownload(undefined);
      setRequest(
        seeded ? requestFor(seeded, presetOf(seeded), defaultNode) : undefined,
      );
    }
    wasOpen.current = isOpen;
    // Seeding is tied to the open transition; choices/defaultNode/seed are read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (justSeeded.current) {
      justSeeded.current = false;
      return;
    }
    if (choice || choices.length === 0) {
      return;
    }
    // The entry changed shape under an open dialog (the weights arrived in
    // the inventory, or left it): stay on the same preset and keep the form.
    const samePreset = choices.find(
      candidate =>
        candidate.kind === 'preset' &&
        candidate.preset.name === request?.presetName,
    );
    if (samePreset && request) {
      setChoiceId(samePreset.id);
      return;
    }
    // The installation changed (or presets arrived): start from its first entry.
    setChoiceId(choices[0].id);
    setPresetForDownload(undefined);
    setRequest(requestFor(choices[0], presetOf(choices[0]), defaultNode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, choices, choice]);

  const chooseModel = (id: string) => {
    const next = choices.find(candidate => candidate.id === id);
    if (!next) {
      return;
    }
    setShowValidation(false);
    setChoiceId(id);
    setPresetForDownload(undefined);
    setRequest(requestFor(next, presetOf(next), request?.node ?? defaultNode));
  };

  const choosePresetForDownload = (name: string) => {
    const next = presets.find(candidate => candidate.name === name);
    if (!next || choice?.kind !== 'download') {
      return;
    }
    setShowValidation(false);
    setPresetForDownload(name);
    setRequest(requestFor(choice, next, defaultNode));
  };

  const node = gpuNodes.find(candidate => candidate.name === request?.node);
  const fit = useMemo(
    () =>
      preset && request
        ? fitCheck({ preset, gpus: request.gpus, node })
        : undefined,
    [preset, request, node],
  );

  let validationErrors: string[];
  if (preset && request && fit) {
    validationErrors = validateServeModelRequest(request, {
      existingNames,
      fit,
      presetMismatch,
    });
  } else if (choice?.kind === 'download') {
    validationErrors = ['Pick a preset for these weights'];
  } else {
    validationErrors = ['Pick a model'];
  }

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
      <form onSubmit={handleSubmit} style={DIALOG_FORM_STYLE}>
        <DialogHeader>Serve a model</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text color="secondary">
              Pick the model to serve. A curated preset carries its recipe —
              vLLM flags, chat template, memory needs — and weights already in a
              node&apos;s cache are served from there instead of downloaded
              again. Choose where it runs; the portal composes the
              InferenceService and, once the model answers, creates the model
              config agents use.
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
              label="Model"
              isRequired
              options={choices.map(candidate => ({
                id: candidate.id,
                label: describeChoice(candidate),
              }))}
              selectedKey={choiceId ?? null}
              onSelectionChange={key => {
                if (key) {
                  chooseModel(String(key));
                }
              }}
              description={choice ? describeChoiceDetails(choice) : undefined}
            />
            {choice?.kind === 'preset' && choice.preset.description && (
              <Text
                as="p"
                variant="body-small"
                color="secondary"
                style={{ whiteSpace: 'pre-line' }}
              >
                {choice.preset.description.trim()}
              </Text>
            )}

            {choice?.kind === 'download' && (
              <>
                <Select
                  label="Preset"
                  isRequired
                  options={presets.map(candidate => ({
                    id: candidate.name,
                    label: candidate.displayName,
                  }))}
                  selectedKey={presetForDownload ?? null}
                  onSelectionChange={key => {
                    if (key) {
                      choosePresetForDownload(String(key));
                    }
                  }}
                  description="Pick the recipe to serve these weights with. Every preset's vLLM flags, chat template and memory numbers were written for its own model."
                />
                {preset && (
                  <Flex direction="column" gap="2">
                    <Alert
                      status="warning"
                      title="Preset written for another model"
                      description={`${preset.displayName} was written for ${preset.model.id}; these weights are ${choice.download.model}. Its vLLM flags and chat template may not suit them, and vLLM may refuse to load the model.`}
                    />
                    <Checkbox
                      isSelected={request?.acknowledgePresetMismatch ?? false}
                      onChange={acknowledgePresetMismatch =>
                        patch({ acknowledgePresetMismatch })
                      }
                    >
                      Serve anyway — I understand the preset was not written for
                      these weights
                    </Checkbox>
                  </Flex>
                )}
              </>
            )}

            {request && preset && (
              <>
                <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
                  <Grid.Item>
                    <TextField
                      label="Name"
                      isRequired
                      value={request.name}
                      onChange={name => patch({ name })}
                      maxLength={MAX_INFERENCESERVICE_NAME_LENGTH}
                      description="The InferenceService name; also what agents address the model as, and the name of the model config. Cached weights keep their directory's name so the storage-initializer finds them."
                    />
                  </Grid.Item>
                  <Grid.Item>
                    <TextField
                      label="Model source"
                      isRequired
                      value={request.storageUri}
                      onChange={storageUri => patch({ storageUri })}
                      description="Where the weights come from, set from the model picked above: hf://owner/name downloads from Hugging Face; pvc://claim/dir serves pre-warmed weights."
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
                      description="The GPU nodes this installation reports. Pinning lets the fit check use that node's memory; cached weights are pinned to the node that holds them."
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
                    status={networkPolicyNotice(config).status}
                    title={networkPolicyNotice(config).title}
                    description={`${networkPolicyNotice(config).text} ${cacheNotice(config)}`}
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
