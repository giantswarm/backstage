import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  ConflictError,
  CustomErrorBase,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';

/**
 * A fit check refused the operation — model-manager's `412 does_not_fit`: the
 * model's weights plus serving overhead exceed the target node's memory
 * budget. A verdict about the request, not a fault of the service, so it is
 * answered as a 4xx with model-manager's own explanation (the numbers) rather
 * than falling into the 503 an unrecognised status used to become. Backstage's
 * error middleware reads `statusCode` for classes it does not know.
 */
export class PreconditionFailedError extends CustomErrorBase {
  readonly statusCode = 412;

  constructor(message?: string, cause?: Error | unknown) {
    super(message, cause);
    this.name = 'PreconditionFailedError';
  }
}

/**
 * Header the agent-platform frontend uses to forward the user's
 * per-installation Dex OIDC ID token for model-manager, which this proxy sets
 * as `Authorization: Bearer` toward the model-manager API.
 *
 * A sibling of `backstage-kagent-authorization` rather than a reuse of it, so
 * that a token minted for one upstream is never read by the routes of another
 * by accident, and so the two proxies can evolve their trust models apart. Kept
 * off `Authorization` because that header carries the Backstage identity on the
 * inbound leg (same reasoning as muster's `backstage-muster-authorization`).
 *
 * **Trust model.** model-manager itself checks no identity: the agentgateway
 * route in front of it (`/model-manager`, an `AgentgatewayPolicy` with JWT
 * validation, same shape as the kagent controller route) is the boundary that
 * rejects a missing or invalid token. This proxy therefore always forwards the
 * token and never decides anything from it. An `apiBaseUrl` that bypasses the
 * gateway (an in-cluster Service URL, as a lab shortcut) has no boundary at all
 * — every signed-in portal user can then manage models.
 *
 * Must match MODEL_MANAGER_AUTH_HEADER in plugins/agent-platform.
 */
export const MODEL_MANAGER_AUTH_HEADER =
  'backstage-model-manager-authorization';

/** Default per-request timeout toward a model-manager API. */
export const DEFAULT_MODEL_MANAGER_TIMEOUT_MS = 10_000;

/**
 * Default timeout for `POST /api/v1/models/load`, which answers only once the
 * backend has the model in memory — on Ollama that is a `keep_alive` generate
 * call that blocks for as long as loading several GiB of weights takes. Every
 * other operation answers immediately (a pull returns its job at once), so
 * this is the one call with its own budget.
 */
export const DEFAULT_MODEL_MANAGER_LOAD_TIMEOUT_MS = 120_000;

/**
 * Longest model reference this proxy forwards. Ollama tags and `hf.co/...`
 * GGUF references are all far shorter; this only keeps an absurd body from
 * reaching the backend.
 */
export const MODEL_REF_MAX_LENGTH = 255;

/**
 * Shape of a model reference the proxy is willing to forward: an Ollama
 * registry tag (`smollm2:135m`, `library/qwen3:0.6b`) or a Hugging Face GGUF
 * reference (`hf.co/org/repo:Q4_K_M`). Letters, digits, `.`, `_`, `-`, `:` and
 * `/`, starting alphanumeric — enough for every backend-native form without
 * letting whitespace or path tricks through.
 */
export const MODEL_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-:/]*$/;

/**
 * Shape of the `preset` and `node` fields the kserve backend takes on pull,
 * load and fit-check: a serving preset name (a DNS label) or a node name (a
 * DNS subdomain). Lower-case letters, digits, `-` and `.`, starting and
 * ending alphanumeric.
 */
export const KUBERNETES_NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
export const KUBERNETES_NAME_MAX_LENGTH = 253;

/** Longest hub search query forwarded (`GET /api/v1/search?q=`). */
export const SEARCH_QUERY_MAX_LENGTH = 200;
/** Upper bound of `limit` on a hub search, model-manager's own maximum. */
export const SEARCH_LIMIT_MAX = 50;

/** One installation's model-manager endpoint. */
export interface ModelManagerInstallationConfig {
  /** Installation name, as in `gs.installations`. */
  name: string;
  /**
   * model-manager base URL, no trailing slash — the REST paths (`/api/v1/...`)
   * are appended to it. Through the gateway that is
   * `https://agentgateway.<baseDomain>/model-manager`; the gateway rewrites the
   * prefix away.
   */
  apiBaseUrl: string;
}

export interface ModelManagerRequestOptions {
  /** The user's Dex ID token, forwarded as `Authorization: Bearer`. */
  userToken?: string;
  /**
   * The backend the call addresses, when the installation's model-manager
   * runs several (0.17 on): `?backend=` on reads and deletes, `backend` in
   * the body of the mutations. Absent, model-manager aggregates reads and
   * resolves a reference to the one backend holding it; a model-manager
   * before 0.17 ignores it.
   */
  backend?: string;
}

/**
 * Shape of a backend name (`ollama`, `kserve`, `lemonade`, whatever
 * model-manager grows): a short lower-case identifier.
 */
export const BACKEND_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/** Error envelope model-manager answers with: `{ error: { code, message } }`. */
type ModelManagerErrorEnvelope = {
  error?: { code?: string; message?: string };
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Encode a model reference for a path. References may contain `/` (Hugging
 * Face repos) and `:`; model-manager captures the remainder of the path as the
 * name, so each segment is encoded on its own and the `/` between them kept.
 */
export function encodeModelRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

/**
 * The installations to proxy model-manager for, from
 * `agentPlatform.modelManager.installations`.
 *
 * Unlike the kagent proxy nothing is derived from `baseDomain`: model-manager is
 * an optional component that only some installations deploy, and its route
 * lives behind the agentgateway hostname rather than a well-known subdomain, so
 * an explicit `apiBaseUrl` per installation is the only honest configuration.
 * The chart renders it whenever the component's route is enabled.
 */
export function readModelManagerInstallationsFromConfig(
  config: Config,
  logger: LoggerService,
): Map<string, ModelManagerInstallationConfig> {
  const result = new Map<string, ModelManagerInstallationConfig>();

  const installations = config.getOptionalConfig(
    'agentPlatform.modelManager.installations',
  );
  for (const name of installations?.keys() ?? []) {
    const apiBaseUrl = installations?.getOptionalString(`${name}.apiBaseUrl`);

    if (!apiBaseUrl) {
      logger.warn(
        `Skipping model-manager proxy for installation '${name}': apiBaseUrl is required.`,
      );
      continue;
    }

    // Reject a non-absolute URL here rather than letting it fail per request:
    // an operator omitting the scheme would otherwise surface as an opaque
    // fetch failure on every call instead of one clear message at startup.
    if (!isAbsoluteHttpUrl(apiBaseUrl)) {
      logger.warn(
        `Skipping model-manager proxy for installation '${name}': apiBaseUrl must be an absolute http(s) URL.`,
        { apiBaseUrl },
      );
      continue;
    }

    result.set(name, { name, apiBaseUrl: stripTrailingSlash(apiBaseUrl) });
  }

  return result;
}

/**
 * Thin client for one installation's model-manager REST API
 * (`api/openapi.yaml` in giantswarm/model-manager).
 *
 * Transport only: bodies are model-manager's JSON verbatim, and the frontend
 * owns the schema. What this adds is the trust hop (the user's token becomes
 * the `Authorization` header), bounded waits, and the mapping of
 * model-manager's `{ error: { code } }` answers onto `@backstage/errors`
 * classes so that `MiddlewareFactory.error()` answers the status the frontend
 * already knows how to read.
 */
export class ModelManagerClient {
  constructor(
    private readonly installation: ModelManagerInstallationConfig,
    private readonly logger: LoggerService,
    /** Overridable for tests; defaults to the global fetch. */
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_MODEL_MANAGER_TIMEOUT_MS,
    /** Separate budget for {@link loadModel}, which waits out a model load. */
    private readonly loadTimeoutMs: number = DEFAULT_MODEL_MANAGER_LOAD_TIMEOUT_MS,
  ) {}

  /**
   * `GET /api/v1/backend` — identity, health and capability flags of the
   * default backend (0.17 on: plus `backends`, the names of every backend;
   * `?backend=` describes another one).
   */
  async getBackend(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/backend', options);
  }

  /**
   * `GET /api/v1/backends` — every backend this model-manager runs, in order,
   * each with its own flags (model-manager 0.17 on; 404 before).
   */
  async listBackends(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/backends', options);
  }

  /** `GET /api/v1/models` — downloaded models, enriched with loaded state. */
  async listModels(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/models', options);
  }

  /** `GET /api/v1/models/{name}` — one downloaded model. */
  async getModel(
    name: string,
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request(`/api/v1/models/${encodeModelRef(name)}`, options);
  }

  /**
   * `DELETE /api/v1/models/{name}` — remove a downloaded model. Also removes
   * the ModelConfig model-manager created for it unless `unwire` is false.
   */
  async deleteModel(
    name: string,
    unwire: boolean,
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    const query = unwire ? '' : '?unwire=false';
    return this.request(
      `/api/v1/models/${encodeModelRef(name)}${query}`,
      options,
      { method: 'DELETE' },
    );
  }

  /** `GET /api/v1/loaded` — models in memory / serving right now. */
  async listLoaded(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/loaded', options);
  }

  /**
   * `POST /api/v1/models/pull` — start importing a model. Answers 202 with the
   * job at once (or the already-running job for the same reference); progress
   * comes from {@link getJob}. On kserve, `preset` names the serving preset
   * whose cache directory receives the download and `node` the node whose
   * cache it lands in; a refused fit answers `412 does_not_fit`.
   */
  async pullModel(
    body: { model: string; wire?: boolean; preset?: string; node?: string },
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request('/api/v1/models/pull', options, {
      method: 'POST',
      body,
    });
  }

  /**
   * `POST /api/v1/models/load` — load into memory / start serving. Blocks
   * until the backend has the model, hence the separate timeout. On kserve,
   * `preset` picks the serving preset to compose the InferenceService from
   * (`model` may then be left out) and `node` pins the predictor.
   */
  async loadModel(
    body: {
      model?: string;
      keepAlive?: string;
      preset?: string;
      node?: string;
    },
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request('/api/v1/models/load', options, {
      method: 'POST',
      body,
      timeoutMs: this.loadTimeoutMs,
    });
  }

  /**
   * `POST /api/v1/models/fit-check` — whether a model fits a node before
   * downloading or serving it (kserve). `fits: false` is a 200 with the
   * explanation; only pull and load answer 412.
   */
  async fitCheck(
    body: { model?: string; preset?: string; node?: string },
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request('/api/v1/models/fit-check', options, {
      method: 'POST',
      body,
    });
  }

  /** `GET /api/v1/presets` — the curated serving presets (kserve). */
  async listPresets(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/presets', options);
  }

  /** `GET /api/v1/search?q=…&limit=…` — model hub search (kserve). */
  async search(
    query: string,
    limit: number | undefined,
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    const params = new URLSearchParams({ q: query });
    if (limit !== undefined) {
      params.set('limit', String(limit));
    }
    return this.request(`/api/v1/search?${params.toString()}`, options);
  }

  /** `GET /api/v1/nodes` — node memory budgets and download caches (kserve). */
  async listNodes(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/nodes', options);
  }

  /** `POST /api/v1/models/unload` — evict from memory / stop serving. */
  async unloadModel(
    body: { model: string },
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request('/api/v1/models/unload', options, {
      method: 'POST',
      body,
    });
  }

  /** `POST /api/v1/models/wire` — create or refresh the kagent ModelConfig. */
  async wireModel(
    body: { model: string },
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request('/api/v1/models/wire', options, {
      method: 'POST',
      body,
    });
  }

  /** `POST /api/v1/models/unwire` — delete the ModelConfig model-manager made. */
  async unwireModel(
    body: { model: string },
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request('/api/v1/models/unwire', options, {
      method: 'POST',
      body,
    });
  }

  /** `GET /api/v1/jobs` — every job model-manager remembers, newest first. */
  async listJobs(options: ModelManagerRequestOptions): Promise<unknown> {
    return this.request('/api/v1/jobs', options);
  }

  /** `GET /api/v1/jobs/{id}` — one job with its progress. */
  async getJob(
    id: string,
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request(`/api/v1/jobs/${encodeURIComponent(id)}`, options);
  }

  /** `DELETE /api/v1/jobs/{id}` — cancel a running job. */
  async cancelJob(
    id: string,
    options: ModelManagerRequestOptions,
  ): Promise<unknown> {
    return this.request(`/api/v1/jobs/${encodeURIComponent(id)}`, options, {
      method: 'DELETE',
    });
  }

  private async request(
    path: string,
    options: ModelManagerRequestOptions,
    extra: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      timeoutMs?: number;
    } = {},
  ): Promise<unknown> {
    const { method = 'GET' } = extra;
    let { body } = extra;
    const timeoutMs = extra.timeoutMs ?? this.timeoutMs;
    let url = `${this.installation.apiBaseUrl}${path}`;
    // The backend scope rides in the body of a mutation and in the query of
    // a read or a delete — the two forms model-manager's API takes it in.
    if (options.backend) {
      if (method === 'POST') {
        body = {
          ...((body as Record<string, unknown> | undefined) ?? {}),
          backend: options.backend,
        };
      } else {
        url += `${url.includes('?') ? '&' : '?'}backend=${encodeURIComponent(options.backend)}`;
      }
    }
    const where = `model-manager on installation '${this.installation.name}'`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(options.userToken && {
            Authorization: `Bearer ${options.userToken}`,
          }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        // Never follow a redirect into a sign-in page: a 3xx means the token
        // was not accepted, and following it would yield HTML under a 200.
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Unlike the kagent proxy, nothing here is derived: an installation is
      // only in the map because an operator pointed at a model-manager there.
      // Not reaching it is therefore a real fault (down, misconfigured URL,
      // network), and a 503 — surfaced by the frontend as an unreadable
      // installation — is the honest answer.
      if ((error as Error)?.name === 'TimeoutError') {
        this.logger.debug(`${where} timed out`, { path, timeoutMs });
        throw new ServiceUnavailableError(
          `The ${where} did not respond within ${timeoutMs}ms.`,
        );
      }
      this.logger.debug(`${where} is not reachable`, {
        path,
        error: String(error),
      });
      throw new ServiceUnavailableError(`The ${where} is not reachable.`);
    }

    await this.throwForErrorStatus(response, where);

    if (response.status === 204) {
      return undefined;
    }

    // A 2xx with a non-JSON body is a sign-in page or some other door
    // answering in model-manager's place.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new AuthenticationError(
        `The ${where} returned a non-JSON response (content-type '${contentType}'), which usually means a sign-in page was served instead.`,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      this.logger.debug(`Failed to read the response body from ${where}`, {
        path,
        error: String(error),
      });
      throw new ServiceUnavailableError(
        `Could not read the response from the ${where}.`,
      );
    }
  }

  /**
   * Map an error status onto the error the caller should see.
   *
   * model-manager's own errors carry `{ error: { code, message } }` and the
   * `code` says what happened independent of the status, so it is read first
   * where present; the status decides for everything answered by a door in
   * front of model-manager (the gateway's JWT policy, a proxy).
   */
  private async throwForErrorStatus(
    response: Response,
    where: string,
  ): Promise<void> {
    if (response.ok) {
      return;
    }

    if (response.status >= 300 && response.status < 400) {
      throw new AuthenticationError(
        `The ${where} redirected to a sign-in page; the forwarded token was not accepted.`,
      );
    }

    const envelope = (await response.json().catch(() => undefined)) as
      ModelManagerErrorEnvelope | undefined;
    const code = envelope?.error?.code;
    const upstreamMessage = envelope?.error?.message;

    switch (code) {
      case 'invalid_request':
        throw new InputError(
          upstreamMessage ?? `The ${where} rejected the request.`,
        );
      case 'not_found':
        throw new NotFoundError(
          upstreamMessage ?? `The ${where} has no such model or job.`,
        );
      case 'conflict':
        throw new ConflictError(
          upstreamMessage ?? `The ${where} reported a conflict.`,
        );
      case 'unsupported':
        // The backend's capability flag for this operation is false; the
        // frontend should not have offered it. Forbidden rather than a 5xx —
        // it is a decision, not a fault.
        throw new NotAllowedError(
          `Capability not supported by the ${where}: ${
            upstreamMessage ?? 'this backend does not offer the operation.'
          }`,
        );
      case 'does_not_fit':
        throw new PreconditionFailedError(
          upstreamMessage ??
            `The ${where} refused the model: it does not fit the target node.`,
        );
      case 'backend_error':
        throw new ServiceUnavailableError(
          upstreamMessage ??
            `The serving backend behind the ${where} failed or is unreachable.`,
        );
      default:
        break;
    }

    // No (recognised) envelope: a door in front of model-manager answered.
    switch (response.status) {
      case 400:
        throw new InputError(
          upstreamMessage ?? `The ${where} rejected the request.`,
        );
      case 401:
        throw new AuthenticationError(
          `Not authenticated against the ${where}; the forwarded token was rejected.`,
        );
      case 403:
        throw new NotAllowedError(`Not authorized to use the ${where}.`);
      case 404:
        throw new NotFoundError(
          upstreamMessage ?? `The ${where} has no such model or job.`,
        );
      case 409:
        throw new ConflictError(
          upstreamMessage ?? `The ${where} reported a conflict.`,
        );
      case 412:
        throw new PreconditionFailedError(
          upstreamMessage ??
            `The ${where} refused the model: it does not fit the target node.`,
        );
      case 501:
        throw new NotAllowedError(`Capability not supported by the ${where}.`);
      default:
        this.logger.debug(`Unexpected status from ${where}`, {
          status: response.status,
        });
        throw new ServiceUnavailableError(
          upstreamMessage ??
            `The ${where} answered with HTTP ${response.status}.`,
        );
    }
  }
}
