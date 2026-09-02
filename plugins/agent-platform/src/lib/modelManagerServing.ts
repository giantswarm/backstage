// The model-manager serving source's pure half: turning the documents of the
// model-manager REST API (`lib/modelManager.ts`) into the backend-agnostic
// shapes in `serving.ts`, plus the formatting the Serving section needs for
// them. The hook that fetches them is
// `components/ServingProvider/useModelManagerServingSource.ts`.

import { urlHostname } from '@giantswarm/backstage-plugin-kubernetes-react';
import type {
  ModelManagerBackend,
  ModelManagerCapabilities,
  ModelManagerModel,
} from './modelManager';
import type {
  ServedModel,
  ServingBackend,
  ServingCapabilities,
} from './serving';

/** The model feature agents need: tool calling. */
export const TOOLS_CAPABILITY = 'tools';

/**
 * Model features not worth a chip: every model completes text, so saying so
 * is noise next to the ones that distinguish it (tools, vision, thinking).
 */
const IMPLIED_MODEL_CAPABILITIES = new Set(['completion']);

/**
 * The backends the seam knows. model-manager may grow others; an installation
 * reporting one the portal has no vocabulary for is skipped (with a console
 * warning) rather than mislabelled.
 */
export function toServingBackend(name: string): ServingBackend | undefined {
  return name === 'kserve' || name === 'ollama' ? name : undefined;
}

/** model-manager's flags are already the seam's vocabulary. */
export function toServingCapabilities(
  capabilities: ModelManagerCapabilities,
): ServingCapabilities {
  return {
    pull: capabilities.pull,
    pullProgress: capabilities.pullProgress,
    delete: capabilities.delete,
    load: capabilities.load,
    unload: capabilities.unload,
    loadedModels: capabilities.loadedModels,
    wire: capabilities.wire,
    presets: capabilities.presets,
    fitCheck: capabilities.fitCheck,
    nodeInventory: capabilities.nodeInventory,
    search: capabilities.search,
  };
}

/**
 * One model of a model-manager inventory as a served model.
 *
 * Readiness follows what the backend says about memory: loaded → `ready`,
 * downloaded but not loaded → `available`, and every model `notReady` while
 * the backend reports itself unhealthy (its inventory may then be stale). The
 * endpoint every model answers on is the backend's own — on a multi-model
 * host that is one hostname for every model, which is why
 * `findServedModel` disambiguates by name.
 */
export function toServedModelFromManager(
  installation: string,
  backend: ModelManagerBackend & { backend: ServingBackend },
  model: ModelManagerModel,
): ServedModel {
  const running = model.running;

  let readiness: ServedModel['readiness'];
  let readinessMessage: string | undefined;
  if (!backend.healthy) {
    readiness = 'notReady';
    readinessMessage =
      backend.message ??
      `The ${backend.backend} backend is not healthy; its inventory may be stale.`;
  } else if (model.loaded) {
    readiness = 'ready';
    readinessMessage = running?.expiresAt
      ? `Loaded in memory until ${formatTime(running.expiresAt)}.`
      : 'Loaded in memory.';
  } else {
    readiness = 'available';
    readinessMessage = 'Downloaded; not loaded in memory.';
  }

  const endpointHosts = Array.from(
    new Set(
      [urlHostname(backend.endpoint), urlHostname(running?.endpoint)].filter(
        (host): host is string => Boolean(host),
      ),
    ),
  );

  return {
    id: `${installation}/${backend.backend}//${model.name}`,
    installation,
    backend: backend.backend,
    name: model.name,
    modelSource: model.name,
    runtime: backend.version
      ? `${backend.backend} ${backend.version}`
      : backend.backend,
    readiness,
    readinessMessage,
    node: running?.node ?? model.node,
    internalUrl: running?.endpoint ?? backend.endpoint,
    endpointHosts,
    sizeBytes: model.sizeBytes,
    loaded: model.loaded,
    memoryBytes: running?.sizeBytes,
    loadedUntil: running?.expiresAt,
    capabilities: model.capabilities,
    details: {
      family: model.family,
      parameterSize: model.parameterSize,
      quantization: model.quantization,
      contextLength: model.contextLength,
      format: model.format,
    },
    modelConfig: model.modelConfig
      ? {
          name: model.modelConfig.name,
          namespace: model.modelConfig.namespace,
          ready: model.modelConfig.ready,
          message: model.modelConfig.message,
        }
      : undefined,
    // model-manager is the one source that acts on what it lists.
    operable: true,
  };
}

/**
 * Whether agents cannot use this model: the backend lists its features and
 * tool calling is not among them. `false` when features are unknown — no
 * warning on a guess.
 */
export function lacksToolCalling(
  model: Pick<ServedModel, 'capabilities'>,
): boolean {
  return (
    model.capabilities !== undefined &&
    !model.capabilities.includes(TOOLS_CAPABILITY)
  );
}

/** The features worth showing, in the backend's order. */
export function notableCapabilities(capabilities: string[]): string[] {
  return capabilities.filter(
    capability => !IMPLIED_MODEL_CAPABILITIES.has(capability),
  );
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes → a short binary-prefixed figure: 6594474711 → "6.1 GiB". */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes are exact; above that one decimal until the figure has three
  // digits, where a decimal is noise ("498 MiB", "6.1 GiB").
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/** A context window: 262144 → "256k", 40960 → "40k", 4096 → "4k". */
export function formatContextLength(length: number | undefined): string {
  if (length === undefined || !Number.isFinite(length) || length <= 0) {
    return '—';
  }
  if (length < 1024) {
    return String(length);
  }
  const k = length / 1024;
  return `${Number.isInteger(k) ? k : Math.round(k)}k`;
}

/**
 * The row description under a served model's name: what kind of model it is,
 * from the details the backend reports. Empty when it reports none.
 */
export function describeServedModel(
  details: ServedModel['details'] | undefined,
): string {
  if (!details) {
    return '';
  }
  return [
    details.parameterSize,
    details.quantization,
    details.contextLength !== undefined
      ? `${formatContextLength(details.contextLength)} ctx`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** ISO time → a short local clock time, else the input as-is. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
}

/**
 * The shape of a model reference the pull form accepts — the same rule the
 * backend proxy enforces (`MODEL_REF_PATTERN` there), so a reference the form
 * lets through is never refused a step later with a less helpful message.
 */
export const MODEL_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-:/]*$/;
export const MODEL_REF_MAX_LENGTH = 255;

/** Why a model reference cannot be pulled, or `undefined` when it can. */
export function validateModelRef(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter a model reference, e.g. qwen2.5:0.5b or hf.co/org/repo:Q4_K_M.';
  }
  if (trimmed.length > MODEL_REF_MAX_LENGTH) {
    return `A model reference is at most ${MODEL_REF_MAX_LENGTH} characters.`;
  }
  if (!MODEL_REF_PATTERN.test(trimmed)) {
    return 'A model reference is letters, digits, dots, dashes, underscores, colons and slashes — no spaces.';
  }
  return undefined;
}
