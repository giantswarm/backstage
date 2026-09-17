import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  modelManagerFitResultSchema,
  modelManagerLoadAnswerSchema,
  type ModelManagerFitResult,
  type ModelManagerLoadAnswer,
} from '../lib/modelManager';
import {
  addBackendArgs,
  classifyModelManagerToolError,
  MODEL_MANAGER_TOOLS,
  modelManagerToolName,
  writeArgs,
  type AddBackendInput,
  type AddBackendResult,
  type BackendKind,
  type BackendWriteOptions,
  type ModelManagerTool,
  type RemoveBackendResult,
} from '../lib/modelManagerBackends';

/**
 * One model-manager tool call on one installation, as the signed-in person.
 *
 * The seam is the muster plugin's own client — the same one agent-manager's
 * and cluster-manager's tools go through: `musterApi.callTool()` sends the
 * person's token for the installation's muster, and muster runs the tool with
 * the person's own grant for model-manager, so what a write lands is written
 * as the person, under the person's RBAC. muster's proxy hands the tool's
 * JSON text back parsed; a tool that answered a bare string is parsed here.
 * What the call threw is classified: muster's "not connected" answers become
 * `ModelManagerNotConnectedError`, model-manager's refusals keep their status
 * word as `ModelManagerToolError` (see `classifyModelManagerToolError`).
 */
export async function callModelManagerTool<T>(
  musterApi: MusterApi,
  installation: string,
  tool: ModelManagerTool,
  args: Record<string, unknown> = {},
): Promise<T> {
  let result: unknown;
  try {
    result = await musterApi.callTool(
      modelManagerToolName(tool),
      args,
      installation,
    );
  } catch (error) {
    throw classifyModelManagerToolError(error);
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as T;
    } catch {
      throw new Error(
        `model-manager's ${tool} answered text, not JSON: ${result}`,
      );
    }
  }
  return result as T;
}

/** What `check_fit` and `load_model` judge or start: a preset by name or a model reference, on one backend. */
export type ServeRequest = {
  /** The preset name on kserve (`qwen3-4b-instruct`), the model reference on a host backend. */
  model: string;
  backend?: string;
};

/**
 * model-manager's backend-registration and serving tools on one installation,
 * called as the signed-in person ({@link callModelManagerTool}): the writes
 * of the backend registry and the two calls the Serve dialog makes. The
 * inventory reads and the per-model operations of the Models pages take the
 * same hop through `ModelManagerApiClient`.
 */
export class ModelManagerToolsClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private call<T>(
    tool: ModelManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    return callModelManagerTool<T>(
      this.musterApi,
      this.installation,
      tool,
      args,
    );
  }

  /**
   * `add_backend`: with `dryRun`, the rendered backend document and the
   * ConfigMap it would become, nothing written; otherwise the write as the
   * person (`mode: apply`, or `commit` once model-manager offers it).
   */
  addBackend(
    input: AddBackendInput,
    options: BackendWriteOptions = {},
  ): Promise<AddBackendResult> {
    return this.call<AddBackendResult>(
      MODEL_MANAGER_TOOLS.addBackend,
      addBackendArgs(input, options),
    );
  }

  /**
   * `check_fit`: whether the preset fits the backend — on a GPU pool judged
   * against the pool's instance shapes (`instanceType` names the node the
   * load would launch) — with the cache verdict (`cached`, `cacheSource`).
   * `fits: false` is an answer with a `reason`, not an error.
   */
  async checkFit(request: ServeRequest): Promise<ModelManagerFitResult> {
    const answer = await this.call<unknown>(MODEL_MANAGER_TOOLS.checkFit, {
      ...request,
    });
    return modelManagerFitResultSchema.parse(answer);
  }

  /**
   * `load_model`: starts serving as the person. On kserve the answer names
   * the object model-manager composed (`running.kind`, `running.resource`),
   * echoes the fit it was judged by and carries the initial timeline.
   */
  async loadModel(request: ServeRequest): Promise<ModelManagerLoadAnswer> {
    const answer = await this.call<unknown>(MODEL_MANAGER_TOOLS.loadModel, {
      ...request,
    });
    return modelManagerLoadAnswerSchema.parse(answer);
  }

  /**
   * `remove_backend`: with `dryRun`, the ConfigMap and the ModelConfigs that
   * would go; otherwise the unwire and the delete as the person.
   */
  removeBackend(
    kind: BackendKind,
    options: BackendWriteOptions = {},
  ): Promise<RemoveBackendResult> {
    return this.call<RemoveBackendResult>(MODEL_MANAGER_TOOLS.removeBackend, {
      kind,
      ...writeArgs(options),
    });
  }
}
