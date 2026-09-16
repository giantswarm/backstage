/**
 * model-manager's backend-registration tools, as the portal calls them
 * through muster.
 *
 * model-manager ships with every installation and starts with no backend
 * (bumblebee-plans#46, D5). A backend — Ollama, LM Studio, Lemonade or a
 * KServe cluster — is registered at runtime as a **backend document**: a
 * ConfigMap in model-manager's namespace found by label, validated when it is
 * read (`docs/backends.md` of giantswarm/model-manager). The portal writes
 * nothing itself: `add_backend` renders the document (`dryRun`) and writes it
 * (`mode: apply`) as the signed-in person, reached through the installation's
 * muster where the tools appear as `x_model-manager_<tool>`; `remove_backend`
 * unwires the ModelConfigs of the backend and deletes the document. The
 * inventory reads stay on the REST seam (`ModelManagerApiClient`).
 */

import { looksNotConnected, type CommitAgentResult } from './agentManager';

/** The MCPServer name muster registers model-manager under. */
export const MODEL_MANAGER_SERVER = 'model-manager';

/** The tools this plugin calls, by their model-manager name. */
export const MODEL_MANAGER_TOOLS = {
  addBackend: 'add_backend',
  removeBackend: 'remove_backend',
} as const;

export type ModelManagerTool =
  (typeof MODEL_MANAGER_TOOLS)[keyof typeof MODEL_MANAGER_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function modelManagerToolName(tool: ModelManagerTool): string {
  return `x_${MODEL_MANAGER_SERVER}_${tool}`;
}

/** The drivers a backend document may name (`spec.kind`). */
export const BACKEND_KINDS = [
  'ollama',
  'lmstudio',
  'lemonade',
  'kserve',
] as const;
export type BackendKind = (typeof BACKEND_KINDS)[number];

/** The kinds reached at a host URL; `kserve` is reached at a cluster instead. */
export const HOST_BACKEND_KINDS: readonly BackendKind[] = [
  'ollama',
  'lmstudio',
  'lemonade',
];

export function isHostBackendKind(kind: BackendKind): boolean {
  return HOST_BACKEND_KINDS.includes(kind);
}

export const BACKEND_KIND_LABEL: Record<BackendKind, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  lemonade: 'Lemonade',
  kserve: 'KServe',
};

export function isBackendKind(value: string): value is BackendKind {
  return (BACKEND_KINDS as readonly string[]).includes(value);
}

/** Who wrote a backend: the chart's values, a person, or cluster-manager. */
export type BackendSource = 'static' | 'person' | 'cluster-manager';

/** The source of a backend as a phrase for a group header. */
/**
 * The registered backends that have no group on the Serving page — nothing
 * served yet (a KServe without a pool, an Ollama before its first pull) — so
 * the page can list them with their source and Remove backend all the same.
 * `present` is what the table shows: one (installation, backend) per group.
 */
export function backendsWithoutModels<
  T extends { installation: string; kind: string },
>(
  registered: readonly T[],
  present: readonly { installation: string; backend: string }[],
): T[] {
  return registered.filter(
    backend =>
      !present.some(
        group =>
          group.installation === backend.installation &&
          group.backend === backend.kind,
      ),
  );
}

export function describeBackendSource(source: string | undefined): string {
  switch (source) {
    case 'person':
      return 'Registered from the portal';
    case 'cluster-manager':
      return 'Registered by cluster-manager';
    case 'static':
      return "Configured by the chart's values";
    default:
      return '';
  }
}

/** A write's mode: land the ConfigMap live, or open a pull request. */
export type WriteMode = 'apply' | 'commit';

/** What the dialog sends to `add_backend`; the tool fills every default. */
export type AddBackendInput = {
  kind: BackendKind;
  /** Host kinds: the base URL as model-manager reaches it. */
  endpoint?: string;
  /** Host kinds: the base URL as agent pods reach it (default: `endpoint`). */
  agentEndpoint?: string;
  /** A Secret holding a token — a reference, never the token itself. */
  credentialsSecret?: string;
  credentialsKey?: string;
  /** kserve: the target cluster; `local` is the cluster model-manager runs on. */
  cluster?: string;
  organization?: string;
  apiServer?: string;
  caBundle?: string;
  servingNamespace?: string;
  discoveryNamespace?: string;
  discoveryName?: string;
};

const KSERVE_ONLY_FIELDS = [
  'cluster',
  'organization',
  'apiServer',
  'caBundle',
  'servingNamespace',
  'discoveryNamespace',
  'discoveryName',
] as const;

const HOST_ONLY_FIELDS = ['endpoint', 'agentEndpoint'] as const;

export type BackendWriteOptions = { dryRun?: boolean; mode?: WriteMode };

/**
 * The arguments of an `add_backend` call: the fields the person set, trimmed,
 * empty ones dropped, and the fields the kind does not accept dropped too —
 * model-manager refuses `endpoint` on kserve and `kserve.*` on a host kind, so
 * a value left over from switching the kind in the form never reaches it.
 */
export function addBackendArgs(
  input: AddBackendInput,
  options: BackendWriteOptions = {},
): Record<string, unknown> {
  const dropped: readonly string[] = isHostBackendKind(input.kind)
    ? KSERVE_ONLY_FIELDS
    : HOST_ONLY_FIELDS;
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (dropped.includes(key) || typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      args[key] = trimmed;
    }
  }
  return { ...args, ...writeArgs(options) };
}

/** `dryRun` only when asked; `mode` on a real write. */
export function writeArgs(
  options: BackendWriteOptions,
): Record<string, unknown> {
  if (options.dryRun) {
    return { dryRun: true };
  }
  return { mode: options.mode ?? 'apply' };
}

/** The ConfigMap a write names: `model-backend-<kind>` in model-manager's namespace. */
export type BackendConfigMapRef = {
  namespace: string;
  name: string;
  labels?: Record<string, string>;
};

/** `add_backend`: the rendered document, and what an apply did. */
export type AddBackendResult = {
  dryRun: boolean;
  /** The backend document (`kind: ModelBackend`), YAML. */
  document: string;
  configMap: BackendConfigMapRef;
  /** An apply: whether the ConfigMap was created (else replaced). */
  created?: boolean;
  /** An apply: whether model-manager's watch delivered it in time. */
  registered?: boolean;
  /** An apply: the backend as `list_backends` reports it. */
  backend?: { backend?: string; endpoint?: string; healthy?: boolean };
} & CommitAgentResult;

/** `remove_backend`: what would go, or went. */
export type RemoveBackendResult = {
  dryRun: boolean;
  configMap: BackendConfigMapRef;
  /** A dry run: the ModelConfigs model-manager wired for the backend. */
  modelConfigs?: string[];
  /** An apply: the ModelConfigs removed. */
  unwired?: string[];
  removed?: boolean;
  deregistered?: boolean;
} & CommitAgentResult;

/** A base URL a host backend is reached at: `http(s)://host[:port][/path]`. */
export function isValidEndpoint(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && !!url.host
    );
  } catch {
    return false;
  }
}

/**
 * A refusal model-manager answered, in its own words. `code` is the status
 * word the tool prefixes (`conflict`, `not_found`, `invalid_request`,
 * `unsupported`, …); the message keeps the whole answer verbatim.
 */
export class ModelManagerToolError extends Error {
  readonly name = 'ModelManagerToolError';
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * The person's muster session holds no connection to model-manager yet (the
 * frontend counterpart of gs-node's `MusterServerNotConnectedError`).
 */
export class ModelManagerNotConnectedError extends Error {
  readonly name = 'ModelManagerNotConnectedError';
}

const TOOL_ERROR_CODE = /^([a-z_]+):\s/;

/**
 * Classifies what a tool call threw: muster's "not connected" answers become
 * {@link ModelManagerNotConnectedError}; everything else is model-manager's
 * refusal (or the apiserver's answer through it), kept verbatim as
 * {@link ModelManagerToolError}.
 */
export function classifyModelManagerToolError(error: unknown): Error {
  if (
    error instanceof ModelManagerToolError ||
    error instanceof ModelManagerNotConnectedError
  ) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (looksNotConnected(message)) {
    return new ModelManagerNotConnectedError(message);
  }
  return new ModelManagerToolError(
    message,
    message.match(TOOL_ERROR_CODE)?.[1],
  );
}
