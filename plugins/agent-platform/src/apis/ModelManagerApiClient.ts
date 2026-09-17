import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';
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
import {
  MODEL_MANAGER_TOOLS,
  type ModelManagerTool,
} from '../lib/modelManagerBackends';
import {
  SERVED_MODEL_AUTH_HEADER,
  type BackendScope,
  type ModelManagerApi,
  type TryServedModelResult,
} from './ModelManagerApi';
import { callModelManagerTool } from './ModelManagerToolsClient';

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

/** The `backend` argument of a scoped call, or nothing — every tool takes it as optional. */
function scopeArgs(scope?: BackendScope): Record<string, unknown> {
  return scope?.backend ? { backend: scope.backend } : {};
}

/** The route of the portal's backend that carries out a try of a served model. */
export const SERVED_MODEL_TRY_PATH = '/served-models/try';

/**
 * model-manager per installation, over the installation's muster as the
 * signed-in person — one `x_model-manager_<tool>` call per method through the
 * muster plugin's client, which mints the person's token for that muster;
 * muster runs the tool with the person's own grant for model-manager. No
 * model-manager URL, no REST client, no proxy route: the portal knows
 * model-manager only as the MCPServer its muster registers, which is also
 * what says whether an installation has one (`useModelManagerInstallations`).
 *
 * The answers are parsed with the forgiving schemas in `lib/modelManager.ts`
 * (the tools answer the JSON their REST routes do). The one exception is
 * {@link tryModel}: two completions against the served model's endpoint that
 * the portal's backend posts — the browser cannot reach the models Gateway
 * cross-origin — with the person's installation token in its own header.
 */
export class ModelManagerApiClient implements ModelManagerApi {
  private readonly musterApi: MusterApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesApi: KubernetesApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;

  constructor(options: {
    musterApi: MusterApi;
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesApi: KubernetesApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.musterApi = options.musterApi;
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesApi = options.kubernetesApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
  }

  private call<T = unknown>(
    installation: string,
    tool: ModelManagerTool,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    return callModelManagerTool<T>(this.musterApi, installation, tool, args);
  }

  async getBackend(installation: string): Promise<ModelManagerBackend> {
    const body = await this.call(installation, MODEL_MANAGER_TOOLS.getBackend);
    const parsed = modelManagerBackendSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} answered a backend descriptor this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async listBackends(installation: string): Promise<ModelManagerBackend[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.listBackends,
    );
    if (
      body === null ||
      typeof body !== 'object' ||
      !('backends' in (body as Record<string, unknown>))
    ) {
      throw upstreamError(
        `model-manager on ${installation} answered a backend list this portal cannot read.`,
      );
    }
    // `null` for none registered yet: model-manager's shipped state.
    return parseModelManagerList(body, 'backends', modelManagerBackendSchema);
  }

  async listModels(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerModel[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.listModels,
      scopeArgs(scope),
    );
    return parseModelManagerList(body, 'models', modelManagerModelSchema);
  }

  async listLoaded(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerLoadedModel[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.listLoadedModels,
      scopeArgs(scope),
    );
    return parseModelManagerList(body, 'loaded', modelManagerLoadedModelSchema);
  }

  async pullModel(
    installation: string,
    request: {
      model: string;
      wire?: boolean;
      preset?: string;
      node?: string;
    } & BackendScope,
  ): Promise<{ job: ModelManagerJob; created: boolean }> {
    const body = await this.call<{ job?: unknown; created?: unknown }>(
      installation,
      MODEL_MANAGER_TOOLS.pullModel,
      compact(request),
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
    } & BackendScope,
  ): Promise<ModelManagerModel> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.loadModel,
      compact(request),
    );
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
    request: { model?: string; preset?: string; node?: string } & BackendScope,
  ): Promise<ModelManagerFitResult> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.checkFit,
      compact(request),
    );
    const parsed = modelManagerFitResultSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} answered a fit check this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async listPresets(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerPreset[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.listPresets,
      scopeArgs(scope),
    );
    return parseModelManagerList(body, 'presets', modelManagerPresetSchema);
  }

  async searchModels(
    installation: string,
    query: string,
    limit?: number,
    scope?: BackendScope,
  ): Promise<ModelManagerSearchResult[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.searchModels,
      {
        query,
        ...(limit !== undefined && { limit }),
        ...scopeArgs(scope),
      },
    );
    return parseModelManagerList(
      body,
      'results',
      modelManagerSearchResultSchema,
    );
  }

  async listNodes(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerNode[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.listNodes,
      scopeArgs(scope),
    );
    return parseModelManagerList(body, 'nodes', modelManagerNodeSchema);
  }

  async unloadModel(
    installation: string,
    model: string,
    scope?: BackendScope,
  ): Promise<void> {
    await this.call(installation, MODEL_MANAGER_TOOLS.unloadModel, {
      model,
      ...scopeArgs(scope),
    });
  }

  async tryModel(
    installation: string,
    request: { model: string; url: string },
  ): Promise<TryServedModelResult> {
    const baseUrl = await this.discoveryApi.getBaseUrl('agent-platform');
    const token = await getInstallationOidcToken(
      this.kubernetesApi,
      this.kubernetesAuthProvidersApi,
      installation,
    );
    const response = await this.fetchApi.fetch(
      `${baseUrl}${SERVED_MODEL_TRY_PATH}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SERVED_MODEL_AUTH_HEADER]: token,
        },
        body: JSON.stringify({ installation, ...request }),
      },
    );
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(
        errorData?.error?.message ??
          `The portal's backend did not answer the try of ${request.model} on ${installation} (status ${response.status}).`,
      );
    }
    const body = (await response.json().catch(() => undefined)) as
      TryServedModelResult | undefined;
    if (!body || typeof body.with?.status !== 'number') {
      throw upstreamError(
        `The portal's backend did not answer the try of ${request.model} on ${installation}.`,
      );
    }
    return body;
  }

  async deleteModel(
    installation: string,
    model: string,
    options: { unwire?: boolean } & BackendScope = {},
  ): Promise<void> {
    await this.call(installation, MODEL_MANAGER_TOOLS.deleteModel, {
      model,
      ...(options.unwire === false && { unwire: false }),
      ...scopeArgs(options),
    });
  }

  async wireModel(
    installation: string,
    model: string,
    scope?: BackendScope,
  ): Promise<ModelConfigRef | undefined> {
    const body = await this.call<{ modelConfig?: unknown }>(
      installation,
      MODEL_MANAGER_TOOLS.wireModel,
      { model, ...scopeArgs(scope) },
    );
    const parsed = modelConfigRefSchema.safeParse(body?.modelConfig);
    return parsed.success ? parsed.data : undefined;
  }

  async unwireModel(
    installation: string,
    model: string,
    scope?: BackendScope,
  ): Promise<void> {
    await this.call(installation, MODEL_MANAGER_TOOLS.unwireModel, {
      model,
      ...scopeArgs(scope),
    });
  }

  async listJobs(
    installation: string,
    scope?: BackendScope,
  ): Promise<ModelManagerJob[]> {
    const body = await this.call(
      installation,
      MODEL_MANAGER_TOOLS.listJobs,
      scopeArgs(scope),
    );
    return parseModelManagerList(body, 'jobs', modelManagerJobSchema);
  }

  async getJob(installation: string, id: string): Promise<ModelManagerJob> {
    const body = await this.call(installation, MODEL_MANAGER_TOOLS.getJob, {
      id,
    });
    const parsed = modelManagerJobSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} answered a job this portal cannot read.`,
      );
    }
    return parsed.data;
  }

  async cancelJob(installation: string, id: string): Promise<ModelManagerJob> {
    const body = await this.call(installation, MODEL_MANAGER_TOOLS.cancelJob, {
      id,
    });
    const parsed = modelManagerJobSchema.safeParse(body);
    if (!parsed.success) {
      throw upstreamError(
        `model-manager on ${installation} cancelled the job but answered a job this portal cannot read.`,
      );
    }
    return parsed.data;
  }
}

/** The request's fields that are set — a tool refuses `null` where it expects a string. */
function compact(request: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(request).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}
