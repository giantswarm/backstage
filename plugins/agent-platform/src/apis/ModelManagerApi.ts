import type {
  ModelConfigRef,
  ModelManagerBackend,
  ModelManagerFitResult,
  ModelManagerJob,
  ModelManagerLoadedModel,
  ModelManagerModel,
  ModelManagerNode,
  ModelManagerPreset,
  ModelManagerSearchResult,
} from '../lib/modelManager';

/**
 * Header carrying the user's per-installation Dex OIDC ID token for
 * model-manager, read by the agent-platform-backend pass-through and promoted
 * to `Authorization: Bearer` toward the model-manager API — where the
 * agentgateway route's JWT policy, not model-manager, decides whether it is
 * accepted.
 *
 * A sibling of `KAGENT_AUTH_HEADER`, not a reuse: one header per upstream.
 *
 * Must match MODEL_MANAGER_AUTH_HEADER in plugins/agent-platform-backend.
 */
export const MODEL_MANAGER_AUTH_HEADER =
  'backstage-model-manager-authorization';

/**
 * The model-manager REST API (giantswarm/model-manager), per installation,
 * through the agent-platform-backend proxy.
 *
 * Errors carry the names the plugin's QueryClientProvider and serving source
 * key on: `NotFoundError` (the installation has no model-manager configured,
 * or the model/job is gone), `UnauthorizedError`, `ForbiddenError` (also how
 * an unsupported capability arrives — the backend never offered it),
 * `ConflictError`, `PreconditionFailedError` (a fit check refused the model —
 * model-manager's `412 does_not_fit`, with the numbers in the message),
 * `ServiceUnavailableError` (model-manager or its backend is unreachable).
 */
/**
 * The backend a read is narrowed to, or a mutation addressed to, when the
 * installation's model-manager runs several (0.17 on): a name from
 * {@link ModelManagerApi.listBackends}. Left out, reads aggregate every
 * backend and a mutation is resolved to the one backend holding the
 * reference (a reference on several answers `ConflictError`). An older
 * model-manager ignores it.
 */
export type BackendScope = { backend?: string };

export interface ModelManagerApi {
  /** Installations the backend can proxy model-manager for. Names only. */
  listInstallations(): Promise<string[]>;

  /**
   * `GET /api/v1/backend` — identity, health and capability flags of the
   * installation's default backend (`backends` names the others, 0.17 on).
   */
  getBackend(installation: string): Promise<ModelManagerBackend>;

  /**
   * `GET /api/v1/backends` — every backend the installation's model-manager
   * runs, in order (the first is the default backend), each with its own
   * flags. On a model-manager before 0.17 (no such route) the one descriptor
   * of `GET /api/v1/backend`.
   */
  listBackends(installation: string): Promise<ModelManagerBackend[]>;

  /** `GET /api/v1/models` — the inventory, with loaded state and ModelConfig; every model names its backend. */
  listModels(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerModel[]>;

  /** `GET /api/v1/loaded` — what is in memory / serving right now. */
  listLoaded(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerLoadedModel[]>;

  /**
   * Start importing a model. Answers at once with the job to poll; `created`
   * is false when a pull of the same reference was already running and was
   * joined instead. `wire` overrides the server's auto-wiring default (a
   * KServe backend refuses it: models are wired when served). On KServe,
   * `preset` names the serving preset whose cache directory receives the
   * download and `node` the node whose cache it lands in; a model that does
   * not fit the node is refused with `PreconditionFailedError`.
   */
  pullModel(
    installation: string,
    request: {
      model: string;
      wire?: boolean;
      preset?: string;
      node?: string;
    } & BackendScope,
  ): Promise<{ job: ModelManagerJob; created: boolean }>;

  /**
   * Load into memory / start serving. Resolves once the backend has the
   * model, which for a multi-GiB model takes a while — the backend proxy
   * gives it its own timeout. On KServe, `preset` picks the serving preset
   * the InferenceService is composed from (`model` may then be left out) and
   * `node` pins the predictor.
   */
  loadModel(
    installation: string,
    request: {
      model?: string;
      keepAlive?: string;
      preset?: string;
      node?: string;
    } & BackendScope,
  ): Promise<ModelManagerModel>;

  /**
   * Whether a model fits a node before downloading or serving it (KServe):
   * the weights as the hub reports them plus the serving overhead, against the
   * node's memory budget. `fits: false` is an answer, not an error.
   */
  fitCheck(
    installation: string,
    request: { model?: string; preset?: string; node?: string } & BackendScope,
  ): Promise<ModelManagerFitResult>;

  /** The curated serving presets, as model-manager resolves them (KServe). */
  listPresets(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerPreset[]>;

  /** Search the model hub (KServe — the Hugging Face Hub), most downloaded first. */
  searchModels(
    installation: string,
    query: string,
    limit?: number,
    scope?: BackendScope,
  ): Promise<ModelManagerSearchResult[]>;

  /** Every node with its memory budget and download cache; every node names its backend. */
  listNodes(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerNode[]>;

  /** Evict from memory / stop serving. */
  unloadModel(
    installation: string,
    model: string,
    scope?: BackendScope,
  ): Promise<void>;

  /**
   * Remove a downloaded model. `unwire` (default true, like the server's)
   * also removes the ModelConfig model-manager created for it, so agents are
   * not left pointing at nothing.
   */
  deleteModel(
    installation: string,
    model: string,
    options?: { unwire?: boolean } & BackendScope,
  ): Promise<void>;

  /** Create or refresh the kagent ModelConfig for a downloaded model. */
  wireModel(
    installation: string,
    model: string,
    scope?: BackendScope,
  ): Promise<ModelConfigRef | undefined>;

  /** Delete the ModelConfig model-manager created for a model. */
  unwireModel(
    installation: string,
    model: string,
    scope?: BackendScope,
  ): Promise<void>;

  /** Every job model-manager remembers, newest first; every job names its backend. In-memory upstream. */
  listJobs(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerJob[]>;

  /** One job with its progress. */
  getJob(installation: string, id: string): Promise<ModelManagerJob>;

  /** Cancel a running job; answers the job after the request. */
  cancelJob(installation: string, id: string): Promise<ModelManagerJob>;
}
