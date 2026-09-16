import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

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
 * model-manager's backend-registration tools on one installation, called as
 * the signed-in person.
 *
 * The seam is the muster plugin's own client — the same one agent-manager's
 * tools go through: `musterApi.callTool()` sends the person's token for the
 * installation's muster, and muster runs the tool with the person's own grant
 * for model-manager, so the ConfigMap an add writes and the ModelConfigs a
 * remove drops are written as the person, under the person's RBAC. The
 * inventory reads (backends, models, nodes) stay on the REST seam of
 * `ModelManagerApiClient`; only the writes of the backend registry come here.
 */
export class ModelManagerToolsClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private async call<T>(
    tool: ModelManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        modelManagerToolName(tool),
        args,
        this.installation,
      );
    } catch (error) {
      throw classifyModelManagerToolError(error);
    }
    // The proxy parses a JSON text payload for us; a tool that answered a
    // bare string is parsed here.
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
