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
 * Header carrying the person's per-installation Dex OIDC ID token for a
 * **Try it** on a served model: the portal's backend sends it as
 * `Authorization: Bearer` toward the served model's endpoint (the models
 * Gateway of the installation) on the second of its two completions, so the
 * gateway's own enforcement is what the person sees. Nothing else in this
 * plugin reaches the backend with it: every model-manager call goes through
 * muster as the person.
 *
 * Must match SERVED_MODEL_AUTH_HEADER in plugins/agent-platform-backend.
 */
export const SERVED_MODEL_AUTH_HEADER = 'backstage-served-model-authorization';

/**
 * The backend's answer to a try of a served model (`POST /served-models/try`):
 * the URL it posted to, the model id it sent, and the two calls' outcomes.
 * Must match `TryServedModelResult` in plugins/agent-platform-backend.
 */
export type TryServedModelResult = {
  url: string;
  model: string;
  without: { status: number; error?: string };
  with: { status: number; content?: string; error?: string; latencyMs: number };
};

/**
 * model-manager (giantswarm/model-manager) per installation, through the
 * installation's muster as the signed-in person: every method is one
 * `x_model-manager_<tool>` call (the tools answer the JSON their REST routes
 * do), except {@link ModelManagerApi.tryModel}, which the portal's backend
 * carries out because the browser cannot post to the models Gateway itself.
 *
 * Errors carry the names the plugin's QueryClientProvider and serving source
 * key on, mapped from model-manager's status word (`MODEL_MANAGER_ERROR_NAMES`):
 * `NotFoundError` (the model or job is gone), `ForbiddenError` (an unsupported
 * capability — the backend never offered it), `ConflictError`,
 * `PreconditionFailedError` (a fit check refused the model — model-manager's
 * `does_not_fit`, with the numbers in the message), `ServiceUnavailableError`
 * (the backend behind model-manager is unreachable); muster's own answers keep
 * theirs (`UnauthorizedError`, `ModelManagerNotConnectedError`).
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
  /**
   * `get_backend` — identity, health and capability flags of the
   * installation's default backend (`backends` names the others).
   */
  getBackend(installation: string): Promise<ModelManagerBackend>;

  /**
   * `list_backends` — every backend the installation's model-manager runs, in
   * order (the first is the default backend), each with its own flags. Empty
   * on a model-manager with no backend registered yet: that is its shipped
   * state, not a fault.
   */
  listBackends(installation: string): Promise<ModelManagerBackend[]>;

  /** `list_models` — the inventory, with loaded state and ModelConfig; every model names its backend. */
  listModels(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerModel[]>;

  /** `list_loaded_models` — what is in memory / serving right now. */
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
   * model — at once on KServe, where model-manager composes the serving
   * object and answers; on a host backend once the weights are in memory,
   * within the MCPServer's tool timeout. On KServe, `preset` picks the
   * serving preset the object is composed from (`model` may then be left
   * out) and `node` pins the predictor.
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
   * Try a served model: one short chat completion against its endpoint as
   * model-manager reports it (`url`, the row's), sent by the portal's backend
   * twice — without a token and as the signed-in person — so the gateway's
   * enforcement of the ModelConfig's passthrough shows (401 without, 200
   * with) along with the model's answer. `model` is the serving object's
   * name (the row's), the model id the completion is sent for.
   */
  tryModel(
    installation: string,
    request: { model: string; url: string },
  ): Promise<TryServedModelResult>;

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
