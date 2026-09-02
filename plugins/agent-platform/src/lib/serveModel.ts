// The serve flow's pure half: turning a preset, the installation's serving
// config and the user's few choices (name, GPUs, target node, extra args) into
// the KServe InferenceService the portal creates; the fit check that runs
// before it; and the kagent ModelConfig + placeholder Secret the auto-wiring
// creates once the model is ready. Nothing here invents a vLLM flag: every
// argument comes from the preset, plus what the user typed into the clearly
// labelled advanced field, appended.
//
// The hooks that perform the writes are `hooks/useServeModel.ts`,
// `hooks/useStopServedModel.ts` and `hooks/useAutoWireServedModels.ts`.

import {
  BACKSTAGE_FIELD_MANAGER,
  InferenceService,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DISPLAY_NAME_ANNOTATION,
  MANAGED_BY_LABEL,
  MODEL_CONFIG_ANNOTATION,
} from './kserveServing';
import {
  buildKeySecretManifest,
  buildKeySecretPatch,
  buildModelConfigManifest,
  MODEL_CONFIG_NAMESPACE,
  planKeySecret,
  type ModelConfigFormValues,
} from './modelConfigs';
import { gpuFree, gpuTotal, type GpuNode, type ServedModel } from './serving';
import {
  AGENT_PLATFORM_PRESET_LABEL,
  presetRequiredGiB,
  type ModelServingConfig,
  type ServingPreset,
} from './servingPresets';

/** Pod volume the chat-template ConfigMap is mounted through. */
export const CHAT_TEMPLATE_VOLUME = 'chat-template';

/** The node label a target-node choice pins the predictor with. */
export const HOSTNAME_LABEL = 'kubernetes.io/hostname';

/**
 * What the serve dialog collects. Everything model-specific stays in the
 * preset; these are the deployment-time choices.
 */
export type ServeModelRequest = {
  installation: string;
  presetName: string;
  /** InferenceService name; defaults to the preset's. */
  name: string;
  /** `predictor.model.storageUri`; defaults to the preset's. */
  storageUri: string;
  gpus: number;
  /** Node to pin the predictor to; `undefined` leaves it to the scheduler. */
  node?: string;
  /** Advanced: extra vLLM arguments, one per line, appended after the preset's. */
  extraArgs: string;
  /** The user has read a "does not fit" verdict and wants to serve anyway. */
  acknowledgeFit: boolean;
};

export function initialServeModelRequest(
  preset: ServingPreset,
  node?: string,
): ServeModelRequest {
  return {
    installation: preset.installation,
    presetName: preset.name,
    name: preset.name,
    storageUri: preset.model.storageUri,
    gpus: preset.resources.gpus,
    node,
    extraArgs: '',
    acknowledgeFit: false,
  };
}

/**
 * The advanced field, one argument per line. Blank lines and `#` comments are
 * dropped; everything else is taken literally (a value on its own line is how
 * a flag with a JSON argument is written, e.g. `--speculative-config` then the
 * JSON).
 */
export function parseExtraArgs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Flags the runtime or the preset own and the advanced field may not
 * override: the runtime sets model path, port and served name (what agents
 * address the model as), the preset the chat template.
 */
export const RESERVED_ARG_PREFIXES = [
  '--model',
  '--port',
  '--served-model-name',
  '--chat-template',
];

/**
 * Longest InferenceService name accepted here. KServe derives the predictor
 * Deployment (`<name>-predictor`) and its pod names from it, and those have to
 * stay within the 63-character label limit with room for the hash suffixes.
 */
export const MAX_INFERENCESERVICE_NAME_LENGTH = 40;

const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const STORAGE_URI_PATTERN = /^(hf|pvc|s3|gs|oci|https?):\/\/.+/;

/**
 * Validation problems, in form order; empty when the request can be sent.
 *
 * `existingNames` are the InferenceServices already in the target namespace
 * on that installation: the apiserver would answer 409 anyway, but saying so
 * before the submit is friendlier than decoding a conflict afterwards.
 */
export function validateServeModelRequest(
  request: ServeModelRequest,
  context: { existingNames: string[]; fit: FitCheck },
): string[] {
  const errors: string[] = [];
  const name = request.name.trim();

  if (!name) {
    errors.push('Name is required');
  } else if (
    name.length > MAX_INFERENCESERVICE_NAME_LENGTH ||
    !DNS_LABEL_PATTERN.test(name)
  ) {
    errors.push(
      `Name must be lowercase letters, numbers and hyphens (max ${MAX_INFERENCESERVICE_NAME_LENGTH} characters), e.g. qwen3-14b`,
    );
  } else if (context.existingNames.includes(name)) {
    errors.push(`A served model named "${name}" already exists there`);
  }

  if (!STORAGE_URI_PATTERN.test(request.storageUri.trim())) {
    errors.push(
      'Model source must be an hf://, pvc://, s3://, gs://, oci:// or http(s):// URI',
    );
  }

  if (!Number.isInteger(request.gpus) || request.gpus < 0) {
    errors.push('GPUs must be a whole number');
  }

  const reserved = parseExtraArgs(request.extraArgs).filter(arg =>
    RESERVED_ARG_PREFIXES.some(
      prefix => arg === prefix || arg.startsWith(`${prefix}=`),
    ),
  );
  if (reserved.length > 0) {
    errors.push(
      `${reserved.join(', ')} ${reserved.length === 1 ? 'is' : 'are'} set by the runtime or the preset and cannot be overridden here`,
    );
  }

  if (context.fit.verdict === 'doesNotFit' && !request.acknowledgeFit) {
    errors.push(
      'The model does not fit the target node — tick the acknowledgement to serve it anyway',
    );
  }

  return errors;
}

/** How a fit check reached its verdict, for the explanation. */
export type FitBudgetSource =
  /** The GPU memory of the requested GPUs (`nvidia.com/gpu.memory` × GPUs). */
  | 'gpuMemory'
  /** The node's allocatable memory — a unified-memory node, or no GPU memory label. */
  | 'nodeMemory';

export type FitCheck = {
  /**
   * `fits` — required ≤ budget; `doesNotFit` — required > budget (blocked
   * without acknowledgement); `unknown` — nothing to compare against (no node
   * chosen, or a node with no memory data), never a block.
   */
  verdict: 'fits' | 'doesNotFit' | 'unknown';
  /** `weightsGiB + overheadGiB` of the preset. */
  requiredGiB: number;
  budgetGiB?: number;
  budgetSource?: FitBudgetSource;
  /**
   * Whether the GPU shares the node's system memory (unified memory: the
   * labelled GPU memory is essentially the node's memory). The budget is then
   * the node's allocatable memory, which the OS and every other pod on the
   * node also draw on — so a verdict close to the line is optimistic.
   */
  unifiedMemory: boolean;
  /** Why `doesNotFit`, in the user's terms. Empty otherwise. */
  problems: string[];
  /** Caveats that do not block: a tight free-GPU count, an estimated budget. */
  notes: string[];
};

/**
 * Above this share of the node's memory, the labelled GPU memory *is* the
 * node's memory: a unified-memory device (Grace-Blackwell desktops, Jetson),
 * not a discrete card with its own VRAM. Discrete GPUs sit far below it — a
 * node with 80 GiB of VRAM has hundreds of GiB of RAM.
 */
export const UNIFIED_MEMORY_RATIO = 0.8;

const MIB = 2 ** 20;
const GIB = 2 ** 30;

function formatGiB(value: number): string {
  return `${Math.round(value)} GiB`;
}

/**
 * Whether the preset's memory need fits the target node, before anything is
 * created. `weightsGiB + overheadGiB` (the recipe's own numbers) against:
 *
 * - on a discrete-GPU node, the memory of the GPUs requested
 *   (`nvidia.com/gpu.memory` per GPU × GPUs) — VRAM is the constraint, node RAM
 *   is not;
 * - on a unified-memory node, the node's allocatable memory — GPU and CPU draw
 *   on the same pool, so what the scheduler may hand out is the honest ceiling,
 *   and the verdict is flagged as conservative because everything else on the
 *   node draws on it too;
 * - without a GPU memory label, the node's allocatable memory as an upper
 *   bound, flagged as an estimate.
 *
 * Also blocks a request for more GPUs than the node has, and notes when fewer
 * are free right now than requested (a pod may be about to go; not a block).
 */
export function fitCheck({
  preset,
  gpus,
  node,
}: {
  preset: ServingPreset;
  gpus: number;
  node?: GpuNode;
}): FitCheck {
  const requiredGiB = presetRequiredGiB(preset);
  const base: FitCheck = {
    verdict: 'unknown',
    requiredGiB,
    unifiedMemory: false,
    problems: [],
    notes: [],
  };

  if (!node) {
    base.notes.push(
      `Needs about ${formatGiB(requiredGiB)} of memory (${preset.requirements.weightsGiB} GiB of weights + ${preset.requirements.overheadGiB} GiB of headroom). Pick a target node to check whether it fits.`,
    );
    return base;
  }

  const total = gpuTotal(node);
  if (total !== undefined && gpus > total) {
    base.problems.push(
      `Requests ${gpus} GPU${gpus === 1 ? '' : 's'}, but ${node.name} has ${total}.`,
    );
  }
  const free = gpuFree(node);
  if (
    free !== undefined &&
    gpus > free &&
    (total === undefined || gpus <= total)
  ) {
    base.notes.push(
      `Only ${free} of ${node.name}'s GPUs ${free === 1 ? 'is' : 'are'} free right now; the predictor stays pending until ${gpus} ${gpus === 1 ? 'is' : 'are'}.`,
    );
  }
  if (node.schedulable === false) {
    base.notes.push(
      `${node.name} is cordoned; nothing schedules there until it is uncordoned.`,
    );
  }

  const gpuMemoryGiB =
    node.memoryMiB !== undefined ? (node.memoryMiB * MIB) / GIB : undefined;
  const nodeMemoryGiB =
    node.memoryAllocatableBytes !== undefined
      ? node.memoryAllocatableBytes / GIB
      : undefined;
  const unifiedMemory =
    gpuMemoryGiB !== undefined &&
    nodeMemoryGiB !== undefined &&
    gpuMemoryGiB * (node.labeledCount ?? 1) >=
      UNIFIED_MEMORY_RATIO * nodeMemoryGiB;

  let budgetGiB: number | undefined;
  let budgetSource: FitBudgetSource | undefined;
  if (unifiedMemory && nodeMemoryGiB !== undefined) {
    budgetGiB = nodeMemoryGiB;
    budgetSource = 'nodeMemory';
    base.notes.push(
      `${node.name} shares its memory between GPU and CPU (unified memory): the budget is the node's allocatable ${formatGiB(nodeMemoryGiB)}, which the system and every other pod on the node also use — treat a close call as too tight.`,
    );
  } else if (gpuMemoryGiB !== undefined && gpus > 0) {
    budgetGiB = gpuMemoryGiB * gpus;
    budgetSource = 'gpuMemory';
  } else if (nodeMemoryGiB !== undefined) {
    budgetGiB = nodeMemoryGiB;
    budgetSource = 'nodeMemory';
    base.notes.push(
      gpus > 0
        ? `${node.name} has no GPU memory label; using its allocatable ${formatGiB(nodeMemoryGiB)} of memory as an upper bound. The GPUs' own memory may be smaller.`
        : `No GPUs requested; checking against ${node.name}'s allocatable ${formatGiB(nodeMemoryGiB)} of memory.`,
    );
  }

  if (budgetGiB === undefined) {
    base.notes.push(
      `Needs about ${formatGiB(requiredGiB)} of memory, but ${node.name} reports neither GPU memory nor allocatable memory, so the fit cannot be checked.`,
    );
    return { ...base, unifiedMemory };
  }

  const fits = requiredGiB <= budgetGiB;
  if (!fits) {
    base.problems.push(
      `Needs about ${formatGiB(requiredGiB)} of memory (${preset.requirements.weightsGiB} GiB of weights + ${preset.requirements.overheadGiB} GiB of headroom), but ${
        budgetSource === 'gpuMemory'
          ? `${gpus} GPU${gpus === 1 ? '' : 's'} on ${node.name} ${gpus === 1 ? 'has' : 'have'} ${formatGiB(budgetGiB)}`
          : `${node.name} has ${formatGiB(budgetGiB)} allocatable`
      }. vLLM would fail to load the model.`,
    );
  } else {
    base.notes.unshift(
      `Needs about ${formatGiB(requiredGiB)} of memory (${preset.requirements.weightsGiB} GiB of weights + ${preset.requirements.overheadGiB} GiB of headroom); ${
        budgetSource === 'gpuMemory'
          ? `${gpus} GPU${gpus === 1 ? '' : 's'} on ${node.name} ${gpus === 1 ? 'has' : 'have'} ${formatGiB(budgetGiB)}`
          : `${node.name} has ${formatGiB(budgetGiB)} allocatable`
      }.`,
    );
  }

  return {
    ...base,
    verdict: base.problems.length > 0 ? 'doesNotFit' : 'fits',
    budgetGiB,
    budgetSource,
    unifiedMemory,
  };
}

/** The ModelConfig the serve flow promises for an InferenceService of this name. */
export function autoWireTarget(name: string): {
  namespace: string;
  name: string;
} {
  return { namespace: MODEL_CONFIG_NAMESPACE, name };
}

/**
 * The InferenceService for a preset, per the chart's composition recipe:
 *
 * - `metadata`: the requested name in the config's serving namespace,
 *   labelled as ours (`app.kubernetes.io/managed-by`) and with the preset
 *   (`agent-platform.giantswarm.io/preset`); annotated with the ModelConfig to
 *   create on ready and the preset's display name;
 * - `predictor`: `deploymentStrategy.type`, `runtimeClassName` and `timeout`
 *   from the config, the preset's tolerations, then the preset's `predictor`
 *   fields verbatim (they win), then the merged node selector (config ←
 *   preset scheduling ← preset predictor ← the chosen node as
 *   `kubernetes.io/hostname`);
 * - `predictor.model`: `modelFormat` from the preset, `runtime` from the
 *   preset else the config, the chosen `storageUri`, `args` = the preset's
 *   followed by the advanced field's, the preset's `env`, and `resources` =
 *   the preset's with the GPU count set as the config's `gpuResourceName` in
 *   requests and limits (left out when 0 GPUs);
 * - when the preset has a chat template, its ConfigMap mounted read-only at
 *   the preset's `mountPath` — the preset's args already end in
 *   `--chat-template=<mountPath>/<key>`.
 *
 * The cache needs nothing from here: with the Kyverno policies on
 * (`config.cache.redirectPolicy`) the predictor pods are wired at admission;
 * off, the storage-initializer downloads on every start (the dialog says so).
 */
export function composeInferenceService({
  preset,
  config,
  request,
}: {
  preset: ServingPreset;
  config: ModelServingConfig;
  request: ServeModelRequest;
}): Record<string, unknown> {
  const name = request.name.trim();
  const gpus = request.gpus;

  const nodeSelector: Record<string, string> = {
    ...config.nodeSelector,
    ...preset.scheduling.nodeSelector,
    ...((preset.predictor.nodeSelector as Record<string, string> | undefined) ??
      {}),
    ...(request.node ? { [HOSTNAME_LABEL]: request.node } : {}),
  };

  const gpuResources =
    gpus > 0 ? { [config.gpuResourceName]: String(gpus) } : {};
  const resources: Record<string, Record<string, string>> = {};
  const requests = { ...preset.resources.requests, ...gpuResources };
  const limits = { ...preset.resources.limits, ...gpuResources };
  if (Object.keys(requests).length > 0) {
    resources.requests = requests;
  }
  if (Object.keys(limits).length > 0) {
    resources.limits = limits;
  }

  const model: Record<string, unknown> = {
    modelFormat: { name: preset.model.format },
    runtime: preset.runtime ?? config.runtime,
    storageUri: request.storageUri.trim(),
    args: [...preset.args, ...parseExtraArgs(request.extraArgs)],
    ...(preset.env.length > 0 ? { env: preset.env } : {}),
    ...(Object.keys(resources).length > 0 ? { resources } : {}),
    ...(preset.chatTemplate
      ? {
          volumeMounts: [
            {
              name: CHAT_TEMPLATE_VOLUME,
              mountPath: preset.chatTemplate.mountPath,
              readOnly: true,
            },
          ],
        }
      : {}),
  };

  const predictor: Record<string, unknown> = {
    ...(config.deploymentStrategyType
      ? { deploymentStrategy: { type: config.deploymentStrategyType } }
      : {}),
    ...(config.runtimeClassName
      ? { runtimeClassName: config.runtimeClassName }
      : {}),
    ...(config.timeoutSeconds !== undefined
      ? { timeout: config.timeoutSeconds }
      : {}),
    ...(preset.scheduling.tolerations.length > 0
      ? { tolerations: preset.scheduling.tolerations }
      : {}),
    ...preset.predictor,
    ...(Object.keys(nodeSelector).length > 0 ? { nodeSelector } : {}),
    model,
    ...(preset.chatTemplate
      ? {
          volumes: [
            {
              name: CHAT_TEMPLATE_VOLUME,
              configMap: { name: preset.chatTemplate.configMap },
            },
          ],
        }
      : {}),
  };

  const target = autoWireTarget(name);

  return {
    apiVersion: `${InferenceService.group}/${InferenceService.apiVersion}`,
    kind: InferenceService.kind,
    metadata: {
      name,
      namespace: config.namespace,
      labels: {
        [MANAGED_BY_LABEL]: BACKSTAGE_FIELD_MANAGER,
        [AGENT_PLATFORM_PRESET_LABEL]: preset.name,
      },
      annotations: {
        [MODEL_CONFIG_ANNOTATION]: `${target.namespace}/${target.name}`,
        [DISPLAY_NAME_ANNOTATION]: preset.displayName,
      },
    },
    spec: { predictor },
  };
}

/**
 * The OpenAI-compatible base URL agents reach a served model at: the
 * predictor's in-cluster address from the CR status, else the Service name
 * KServe always gives the predictor, plus `/v1`.
 */
export function predictorBaseUrl(model: ServedModel): string {
  const base =
    model.internalUrl?.replace(/\/+$/, '') ??
    `http://${model.name}-predictor.${model.namespace ?? 'default'}.svc.cluster.local`;
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

/**
 * The form values the ModelConfig for a served model is composed from — so
 * the auto-wiring writes exactly what the "Add model" form would have, had
 * someone filled it in by hand:
 *
 * - provider `OpenAI` (vLLM speaks the OpenAI API), base URL = the predictor;
 * - `model` = the InferenceService name: the platform's runtime starts vLLM
 *   with `--served-model-name {{.Name}}`, so that is the id the endpoint
 *   answers to, not the Hugging Face repository;
 * - keyless: vLLM enforces no key, but the ADK runtime crashloops without
 *   `OPENAI_API_KEY`, so the Secret is written with the placeholder value.
 */
export function autoWireFormValues(
  model: ServedModel,
  target: { name: string },
): ModelConfigFormValues {
  return {
    name: target.name,
    displayName: model.displayName ?? '',
    provider: 'OpenAI',
    model: model.name,
    endpoint: predictorBaseUrl(model),
    insecureSkipTlsVerify: false,
    apiKey: '',
    keyless: true,
  };
}

/** The manifests the auto-wiring writes, in order: Secret first, then the ModelConfig. */
export function buildAutoWireManifests(
  model: ServedModel,
  target: { namespace: string; name: string },
): {
  secret: {
    name: string;
    manifest: Record<string, unknown>;
    patch: Record<string, unknown>;
  };
  modelConfig: Record<string, unknown>;
} {
  const values = autoWireFormValues(model, target);
  const plan = planKeySecret(values, false);
  if (plan.action !== 'write') {
    // Unreachable for an OpenAI provider; typed for completeness.
    throw new Error('auto-wiring always writes a placeholder key Secret');
  }
  return {
    secret: {
      name: plan.name,
      manifest: buildKeySecretManifest(plan, target.namespace),
      patch: buildKeySecretPatch(plan),
    },
    modelConfig: buildModelConfigManifest(values, plan, target.namespace),
  };
}
