import type {
  ModelConfigRef,
  ModelManagerBackend,
  ModelManagerJob,
  ModelManagerLoadedModel,
  ModelManagerModel,
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
 * `ConflictError`, `ServiceUnavailableError` (model-manager or its backend is
 * unreachable).
 */
export interface ModelManagerApi {
  /** Installations the backend can proxy model-manager for. Names only. */
  listInstallations(): Promise<string[]>;

  /** `GET /api/v1/backend` — identity, health and capability flags. */
  getBackend(installation: string): Promise<ModelManagerBackend>;

  /** `GET /api/v1/models` — the inventory, with loaded state and ModelConfig. */
  listModels(installation: string): Promise<ModelManagerModel[]>;

  /** `GET /api/v1/loaded` — what is in memory / serving right now. */
  listLoaded(installation: string): Promise<ModelManagerLoadedModel[]>;

  /**
   * Start importing a model. Answers at once with the job to poll; `created`
   * is false when a pull of the same reference was already running and was
   * joined instead. `wire` overrides the server's auto-wiring default.
   */
  pullModel(
    installation: string,
    request: { model: string; wire?: boolean },
  ): Promise<{ job: ModelManagerJob; created: boolean }>;

  /**
   * Load into memory / start serving. Resolves once the backend has the
   * model, which for a multi-GiB model takes a while — the backend proxy
   * gives it its own timeout.
   */
  loadModel(
    installation: string,
    request: { model: string; keepAlive?: string },
  ): Promise<ModelManagerModel>;

  /** Evict from memory / stop serving. */
  unloadModel(installation: string, model: string): Promise<void>;

  /**
   * Remove a downloaded model. `unwire` (default true, like the server's)
   * also removes the ModelConfig model-manager created for it, so agents are
   * not left pointing at nothing.
   */
  deleteModel(
    installation: string,
    model: string,
    options?: { unwire?: boolean },
  ): Promise<void>;

  /** Create or refresh the kagent ModelConfig for a downloaded model. */
  wireModel(
    installation: string,
    model: string,
  ): Promise<ModelConfigRef | undefined>;

  /** Delete the ModelConfig model-manager created for a model. */
  unwireModel(installation: string, model: string): Promise<void>;

  /** Every job model-manager remembers, newest first. In-memory upstream. */
  listJobs(installation: string): Promise<ModelManagerJob[]>;

  /** One job with its progress. */
  getJob(installation: string, id: string): Promise<ModelManagerJob>;

  /** Cancel a running job; answers the job after the request. */
  cancelJob(installation: string, id: string): Promise<ModelManagerJob>;
}
