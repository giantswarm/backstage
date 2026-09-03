import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { getInstallationOidcToken } from '../lib/installationOidcToken';
import {
  modelConfigRefSchema,
  modelManagerBackendSchema,
  modelManagerFitResultSchema,
  modelManagerJobSchema,
  modelManagerLoadedModelSchema,
  modelManagerModelSchema,
  modelManagerNodeSchema,
  modelManagerPresetSchema,
  modelManagerSearchResultSchema,
  parseModelManagerList,
  type ModelConfigRef,
  type ModelManagerBackend,
  type ModelManagerFitResult,
  type ModelManagerJob,
  type ModelManagerLoadedModel,
  type ModelManagerModel,
  type ModelManagerNode,
  type ModelManagerPreset,
  type ModelManagerSearchResult,
} from '../lib/modelManager';
import { MODEL_MANAGER_AUTH_HEADER, ModelManagerApi } from './ModelManagerApi';

export const modelManagerApiRef = createApiRef<ModelManagerApi>({
  id: 'plugin.agent-platform.model-manager',
});

/**
 * An answer that arrived but could not be read as the contract says. Named so
 * the caller's failure path surfaces it (unlike `NotFoundError` /
 * `ServiceUnavailableError`, which the serving source reads as "unreachable").
 */
function upstreamError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstreamError';
  return error;
}

/**
 * Encode a model reference for a path segment of the proxy: the whole
 * reference in one segment (`/` becomes `%2F`), which Express decodes back
 * into the wildcard's parts. Slashes must not survive encoding here, or
 * `hf.co/org/repo` would read as three segments of the proxy's own route.
 */
function encodeModelRef(ref: string): string {
  return encodeURIComponent(ref);
}

/**
 * Client for the model-manager REST API, via the agent-platform-backend
 * pass-through.
 *
 * Every call mints the target installation's Dex ID token and forwards it in
 * `MODEL_MANAGER_AUTH_HEADER` (a mint failure fails just that installation,
 * which is what lets the fleet fan-out degrade one installation at a time),
 * then parses the answer with the forgiving schemas in `lib/modelManager.ts`.
 */
export class ModelManagerApiClient implements ModelManagerApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesApi: KubernetesApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesApi: KubernetesApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesApi = options.kubernetesApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
  }

  async listInstallations(): Promise<string[]> {
    const body = await this.request<{ installations?: { name?: string }[] }>(
      'GET',
      '/model-manager/installations',
    );
    return (body?.installations ?? [])
      .map(installation => installation.name)
      .filter((name): name is string => Boolean(name));
  }

  async getBackend(installation: string): Promise<ModelManagerBackend> {
    const body = await this.request('GET', '/model-manager/backend', {
      installation,
    });
    const parsed = modelManagerBackendSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} answered a backend descriptor this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async listModels(installation: string): Promise<ModelManagerModel[]> {
    const body = await this.request('GET', '/model-manager/models', {
      installation,
    });
    return parseModelManagerList(body, 'models', modelManagerModelSchema);
  }

  async listLoaded(installation: string): Promise<ModelManagerLoadedModel[]> {
    const body = await this.request('GET', '/model-manager/loaded', {
      installation,
    });
    return parseModelManagerList(body, 'loaded', modelManagerLoadedModelSchema);
  }

  async pullModel(
    installation: string,
    request: { model: string; wire?: boolean; preset?: string; node?: string },
  ): Promise<{ job: ModelManagerJob; created: boolean }> {
    const body = await this.request<{ job?: unknown; created?: unknown }>(
      'POST',
      '/model-manager/models/pull',
      { installation, body: request },
    );
    const job = modelManagerJobSchema.safeParse(body?.job);
    if (!job.success) {
      throw upstreamError(
        `model-manager on ${installation} accepted the pull of ${request.model} but did not return a job to follow. Check the downloads list.`,
      );
    }
    return { job: job.data, created: body?.created !== false };
  }

  async loadModel(
    installation: string,
    request: {
      model?: string;
      keepAlive?: string;
      preset?: string;
      node?: string;
    },
  ): Promise<ModelManagerModel> {
    const body = await this.request('POST', '/model-manager/models/load', {
      installation,
      body: request,
    });
    const parsed = modelManagerModelSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} loaded ${request.model ?? request.preset} but answered a model this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async fitCheck(
    installation: string,
    request: { model?: string; preset?: string; node?: string },
  ): Promise<ModelManagerFitResult> {
    const body = await this.request('POST', '/model-manager/models/fit-check', {
      installation,
      body: request,
    });
    const parsed = modelManagerFitResultSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} answered a fit check this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async listPresets(installation: string): Promise<ModelManagerPreset[]> {
    const body = await this.request('GET', '/model-manager/presets', {
      installation,
    });
    return parseModelManagerList(body, 'presets', modelManagerPresetSchema);
  }

  async searchModels(
    installation: string,
    query: string,
    limit?: number,
  ): Promise<ModelManagerSearchResult[]> {
    const body = await this.request('GET', '/model-manager/search', {
      installation,
      query: {
        q: query,
        ...(limit !== undefined && { limit: String(limit) }),
      },
    });
    return parseModelManagerList(
      body,
      'results',
      modelManagerSearchResultSchema,
    );
  }

  async listNodes(installation: string): Promise<ModelManagerNode[]> {
    const body = await this.request('GET', '/model-manager/nodes', {
      installation,
    });
    return parseModelManagerList(body, 'nodes', modelManagerNodeSchema);
  }

  async unloadModel(installation: string, model: string): Promise<void> {
    await this.request('POST', '/model-manager/models/unload', {
      installation,
      body: { model },
    });
  }

  async deleteModel(
    installation: string,
    model: string,
    options: { unwire?: boolean } = {},
  ): Promise<void> {
    const query = options.unwire === false ? { unwire: 'false' } : undefined;
    await this.request(
      'DELETE',
      `/model-manager/models/${encodeModelRef(model)}`,
      { installation, query },
    );
  }

  async wireModel(
    installation: string,
    model: string,
  ): Promise<ModelConfigRef | undefined> {
    const body = await this.request<{ modelConfig?: unknown }>(
      'POST',
      '/model-manager/models/wire',
      { installation, body: { model } },
    );
    const parsed = modelConfigRefSchema.safeParse(body?.modelConfig);
    return parsed.success ? parsed.data : undefined;
  }

  async unwireModel(installation: string, model: string): Promise<void> {
    await this.request('POST', '/model-manager/models/unwire', {
      installation,
      body: { model },
    });
  }

  async listJobs(installation: string): Promise<ModelManagerJob[]> {
    const body = await this.request('GET', '/model-manager/jobs', {
      installation,
    });
    return parseModelManagerList(body, 'jobs', modelManagerJobSchema);
  }

  async getJob(installation: string, id: string): Promise<ModelManagerJob> {
    const body = await this.request(
      'GET',
      `/model-manager/jobs/${encodeURIComponent(id)}`,
      { installation },
    );
    const parsed = modelManagerJobSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} answered a job this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async cancelJob(installation: string, id: string): Promise<ModelManagerJob> {
    const body = await this.request(
      'DELETE',
      `/model-manager/jobs/${encodeURIComponent(id)}`,
      { installation },
    );
    const parsed = modelManagerJobSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} cancelled the job but answered a job this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  /**
   * One proxy round-trip: resolve the route, mint and attach the
   * installation's token, send, and map the status onto an error name.
   *
   * An empty or non-JSON success body resolves to `undefined` — a delete that
   * happened must not be reported as a failure because it said nothing.
   */
  private async request<T = unknown>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: {
      installation?: string;
      body?: unknown;
      query?: Record<string, string>;
    } = {},
  ): Promise<T | undefined> {
    const baseUrl = await this.discoveryApi.getBaseUrl('agent-platform');
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {};
    if (options.installation) {
      url.searchParams.set('installation', options.installation);
      headers[MODEL_MANAGER_AUTH_HEADER] = await getInstallationOidcToken(
        this.kubernetesApi,
        this.kubernetesAuthProvidersApi,
        options.installation,
      );
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchApi.fetch(url.toString(), {
      method,
      headers,
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });

    await this.throwIfNotOk(response);

    if (response.status === 204) {
      return undefined;
    }
    return (await response.json().catch(() => undefined)) as T | undefined;
  }

  /**
   * Map status codes onto error names.
   *
   * These names matter twice over: the plugin's QueryClientProvider
   * short-circuits its retry predicate on them, and the serving source
   * classifies an installation as unreadable on any of them while the
   * mutations show the message; a 412 (`PreconditionFailedError`) is the
   * fit check's refusal, shown where it was asked. A 400 is a request this proxy or
   * model-manager refused — the message says which field — and stays a plain
   * error, except that an unknown installation (outside the configured set)
   * reads as "no model-manager here".
   */
  private async throwIfNotOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const message =
      errorData?.error?.message ??
      `model-manager request failed with status ${response.status}`;
    const error = new Error(message);
    if (
      response.status === 400 &&
      /Unknown model-manager installation|No model-manager installation/.test(
        message,
      )
    ) {
      error.name = 'NotFoundError';
    }
    if (response.status === 401) {
      error.name = 'UnauthorizedError';
    }
    if (response.status === 403) {
      error.name = 'ForbiddenError';
    }
    if (response.status === 404) {
      error.name = 'NotFoundError';
    }
    if (response.status === 409) {
      error.name = 'ConflictError';
    }
    if (response.status === 412) {
      // A fit check refused the model: the message carries the numbers.
      error.name = 'PreconditionFailedError';
    }
    if (response.status === 503) {
      error.name = 'ServiceUnavailableError';
    }
    throw error;
  }
}
