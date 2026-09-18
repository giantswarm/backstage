import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  CLUSTER_MANAGER_TOOLS,
  DEFAULT_ACCELERATORS,
  classifyClusterManagerError,
  clusterManagerToolName,
  type ClusterManagerInfo,
  type ClusterManagerTool,
  type CreateNodePoolInput,
  type DeleteNodePoolInput,
  type ClusterApiStatus,
  type ManagedCluster,
  type ManagedClustersResult,
  type NodePoolWriteResult,
  type NodePoolsResult,
  type WriteMode,
  type CreateNodePoolSchema,
} from '../lib/clusterManager';

export type WriteOptions = {
  dryRun?: boolean;
  mode?: WriteMode;
};

/**
 * cluster-manager's tools on one installation, called as the signed-in person.
 *
 * The seam is the muster plugin's own client: `musterApi.callTool()` sends the
 * person's token for the installation's muster and muster runs the tool with
 * the person's own grant for the server — so the HelmRelease a create writes
 * names the person, not a ServiceAccount. No cluster-manager URL, no REST
 * client, no proxy route: the portal knows cluster-manager only as
 * `x_cluster-manager_<tool>` in muster.
 */
export class ClusterManagerClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private async call<T>(
    tool: ClusterManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        clusterManagerToolName(tool),
        args,
        this.installation,
      );
    } catch (error) {
      throw classifyClusterManagerError(error);
    }
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        throw new Error(
          `cluster-manager's ${tool} answered text, not JSON: ${result}`,
        );
      }
    }
    return result as T;
  }

  /** The version, the write modes offered (apply, commit) and the tool names. */
  getInfo(): Promise<ClusterManagerInfo> {
    return this.call<ClusterManagerInfo>(CLUSTER_MANAGER_TOOLS.getInfo, {});
  }

  /**
   * The installation's clusters with the marks the tool reports, and whether
   * the Cluster API is served at all (none listed where it is not).
   */
  async listClusters(): Promise<ManagedClustersResult> {
    const result = await this.call<{
      clusters?: ManagedCluster[] | null;
      clusterApi?: ClusterApiStatus;
    }>(CLUSTER_MANAGER_TOOLS.listClusters, {});
    return { clusters: result.clusters ?? [], clusterApi: result.clusterApi };
  }

  /** The MachinePools of one cluster, with both Kubernetes versions. */
  listNodePools(cluster: string, namespace?: string): Promise<NodePoolsResult> {
    return this.call<NodePoolsResult>(CLUSTER_MANAGER_TOOLS.listNodePools, {
      cluster,
      ...(namespace ? { namespace } : {}),
    });
  }

  /**
   * `create_node_pool`: with `dryRun` the rendered manifests and nothing
   * written; with `mode: apply` the objects landed as the person; with
   * `mode: commit` a pull request as the person (once the server offers it).
   */
  createNodePool(
    input: CreateNodePoolInput,
    options: WriteOptions = {},
  ): Promise<NodePoolWriteResult> {
    return this.call<NodePoolWriteResult>(
      CLUSTER_MANAGER_TOOLS.createNodePool,
      {
        ...compact(input),
        ...writeArgs(options),
      },
    );
  }

  /**
   * `delete_node_pool`: refused while the pool runs nodes unless `force`; the
   * refusal names them. With the cluster's last pool the operator release
   * cluster-manager created and the registered backend go too.
   */
  deleteNodePool(
    input: DeleteNodePoolInput,
    options: WriteOptions & { force?: boolean } = {},
  ): Promise<NodePoolWriteResult> {
    return this.call<NodePoolWriteResult>(
      CLUSTER_MANAGER_TOOLS.deleteNodePool,
      {
        ...compact(input),
        ...writeArgs(options),
        ...(options.force ? { force: true } : {}),
      },
    );
  }

  /**
   * What this installation's `create_node_pool` takes, as muster describes
   * the tool: the curated accelerators (the `accelerator` enum, the shipped
   * list when the schema cannot be read) and the arguments it declares — so
   * the form offers only what the installation's cluster-manager takes
   * (`zones`, `cache`), and nothing at all of them when the schema cannot be
   * read.
   */
  async createNodePoolSchema(): Promise<CreateNodePoolSchema> {
    try {
      const detail = await this.musterApi.describeTool(
        clusterManagerToolName(CLUSTER_MANAGER_TOOLS.createNodePool),
        this.installation,
      );
      const schema = (detail as { inputSchema?: unknown })?.inputSchema as
        { properties?: Record<string, { enum?: unknown }> } | undefined;
      const properties = schema?.properties ?? {};
      const values = properties.accelerator?.enum;
      return {
        accelerators:
          Array.isArray(values) && values.every(v => typeof v === 'string')
            ? (values as string[])
            : [...DEFAULT_ACCELERATORS],
        arguments: Object.keys(properties),
      };
    } catch {
      // The schema is a convenience; the shipped list stands in, and no
      // argument the schema might have offered is assumed.
      return { accelerators: [...DEFAULT_ACCELERATORS], arguments: [] };
    }
  }
}

/** Only what the person set: an omitted argument keeps the tool's default. */
function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) =>
        value !== undefined &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    ),
  ) as Partial<T>;
}

function writeArgs(options: WriteOptions): Record<string, unknown> {
  return {
    ...(options.dryRun ? { dryRun: true } : {}),
    mode: options.mode ?? 'apply',
  };
}
