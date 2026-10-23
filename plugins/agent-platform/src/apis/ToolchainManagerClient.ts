import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  TOOLCHAIN_MANAGER_TOOLS,
  ToolchainManagerError,
  classifyToolchainManagerError,
  toolchainManagerToolName,
  type AddSourceInput,
  type AddSourceResult,
  type BuildStatusResult,
  type CreateToolchainResult,
  type PackageSearch,
  type ToolchainDescribeResult,
  type ToolchainList,
  type ToolchainManagerTool,
  type ToolchainSource,
  type WrittenToolchain,
} from '../lib/toolchainManager';

/**
 * The toolchain-manager's tools on one installation, called as the signed-in
 * person.
 *
 * The seam is the muster plugin's own client, as for the workspace-manager:
 * `musterApi.callTool()` sends the person's token for the installation's
 * muster, which forwards the person's identity and attaches their grant of
 * the toolchain-manager's GitHub App. No toolchain-manager URL and no proxy
 * route: the portal knows it only as `x_toolchain-manager_<tool>` in muster.
 * Every failure is a {@link ToolchainManagerError}; a `grant_required` answer
 * is data, which the page turns into muster's sign-in.
 */
export class ToolchainManagerClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private async call<T>(
    tool: ToolchainManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        toolchainManagerToolName(tool),
        args,
        this.installation,
      );
    } catch (error) {
      throw classifyToolchainManagerError(error);
    }
    // The proxy parses the tool's JSON for us; a bare string is a JSON text
    // the proxy left alone, or prose where the data was expected.
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        throw new ToolchainManagerError(
          'failed',
          `toolchain-manager's ${tool} answered text, not JSON: ${result}`,
        );
      }
    }
    return result as T;
  }

  /** The toolchains the installation offers, each with its versions. */
  async listToolchains(): Promise<ToolchainList> {
    const result = await this.call<ToolchainList>(
      TOOLCHAIN_MANAGER_TOOLS.listToolchains,
      {},
    );
    return { ...result, toolchains: result.toolchains ?? [] };
  }

  /** One version of a toolchain (the newest without one), as its image declares it. */
  describeToolchain(input: {
    name: string;
    source?: string;
    version?: string;
  }): Promise<ToolchainDescribeResult> {
    return this.call<ToolchainDescribeResult>(
      TOOLCHAIN_MANAGER_TOOLS.describeToolchain,
      { ...input },
    );
  }

  /** The installation's toolchain sources, configured and added. */
  async listSources(): Promise<ToolchainSource[]> {
    const result = await this.call<{ sources?: ToolchainSource[] }>(
      TOOLCHAIN_MANAGER_TOOLS.listSources,
      {},
    );
    return result.sources ?? [];
  }

  /** Adds a repository the person maintains as a source. */
  addSource(input: AddSourceInput): Promise<AddSourceResult> {
    return this.call<AddSourceResult>(TOOLCHAIN_MANAGER_TOOLS.addSource, {
      ...input,
    });
  }

  /** A package source's packages whose name contains `query`. */
  async searchPackages(query: string): Promise<PackageSearch> {
    const result = await this.call<PackageSearch>(
      TOOLCHAIN_MANAGER_TOOLS.searchPackages,
      { query },
    );
    return { ...result, packages: result.packages ?? [] };
  }

  /** A new toolchain's Dockerfile from the picked packages; writes nothing. */
  addPackages(input: {
    name: string;
    packages: string[];
  }): Promise<WrittenToolchain> {
    return this.call<WrittenToolchain>(TOOLCHAIN_MANAGER_TOOLS.addPackages, {
      ...input,
    });
  }

  /** Opens the pull request, as the person, that adds the toolchain to a source. */
  createToolchain(input: {
    dockerfile: string;
    name: string;
    source: string;
  }): Promise<CreateToolchainResult> {
    return this.call<CreateToolchainResult>(
      TOOLCHAIN_MANAGER_TOOLS.createToolchain,
      { ...input },
    );
  }

  /** Where the toolchain's pull request is, from its checks to its release. */
  buildStatus(input: {
    name: string;
    source: string;
    pull?: number;
  }): Promise<BuildStatusResult> {
    return this.call<BuildStatusResult>(TOOLCHAIN_MANAGER_TOOLS.buildStatus, {
      ...input,
    });
  }
}
