import {
  MCPServer,
  MCPServerSeverity,
  mcpServerStateSeverity,
  worstSeverity,
} from './k8s';

/** Placeholder for a missing family / management-cluster label. */
export const UNLABELED = '—';

export type StandardGroup = { family: string; servers: MCPServer[] };

/**
 * Partition a muster instance's MCPServer CRs into the two server shapes the
 * UI renders: standard servers (a `spec.family.name` groups equivalent
 * instances federated across management clusters) and integration servers
 * (singular servers with no family -- customer integrations and shared
 * services). Family presence is the discriminator.
 *
 * Shared by the MCP-servers manager and the dashboard fleet-health summary so
 * both group the fleet identically.
 */
export function partitionServers(servers: MCPServer[]): {
  standard: StandardGroup[];
  integration: MCPServer[];
} {
  const standardByFamily = new Map<string, MCPServer[]>();
  const integration: MCPServer[] = [];

  for (const server of servers) {
    const family = server.getFamily();
    if (family) {
      standardByFamily.set(family, [
        ...(standardByFamily.get(family) ?? []),
        server,
      ]);
    } else {
      integration.push(server);
    }
  }

  const standard = [...standardByFamily.entries()]
    .map(([family, group]) => ({ family, servers: group }))
    .sort((a, b) => a.family.localeCompare(b.family));
  integration.sort((a, b) => a.getName().localeCompare(b.getName()));

  return { standard, integration };
}

export type Representative = {
  /** The server whose shared config/auth/tools are shown for the family. */
  server: MCPServer;
  /**
   * Whether `server` legitimately stands in for the family on this screen: it is
   * the active installation's own server, or at least a connected one. When
   * false, no single MC should head the family (label it neutrally, e.g.
   * "kubernetes (fleet)") because the representative is an arbitrary fallback.
   */
  qualified: boolean;
};

/**
 * Choose the server that represents a federated family's shared config/auth/tools.
 *
 * A federated family is replicated across many management clusters whose auth
 * chains legitimately differ, so "which one do we show?" matters: showing an
 * arbitrary peer/customer MC misrepresents the family on another installation's
 * screen. The order (ADR muster-ui-iteration-2, D1) is:
 *
 * 1. the active installation's own server (`managementCluster === active`), else
 * 2. a connected server (`Connected`/`Running`), else
 * 3. the first server as a fallback, flagged `qualified: false` so the caller
 *    labels the family neutrally rather than by that server's MC.
 *
 * Note: severity `ok` is NOT a sufficient signal since `Auth Required` is now
 * `ok` -- list order would then surface an arbitrary (alphabetically-first) MC.
 */
export function selectRepresentative(
  servers: MCPServer[],
  activeInstallation?: string,
): Representative | undefined {
  if (servers.length === 0) {
    return undefined;
  }
  const own =
    activeInstallation !== undefined
      ? servers.find(s => s.getManagementCluster() === activeInstallation)
      : undefined;
  if (own) {
    return { server: own, qualified: true };
  }
  const connected = servers.find(
    s => s.getState() === 'Connected' || s.getState() === 'Running',
  );
  if (connected) {
    return { server: connected, qualified: true };
  }
  return { server: servers[0], qualified: false };
}

export type McPresence = {
  mc: string;
  severity: MCPServerSeverity;
  state: string;
  server: MCPServer;
};

/**
 * Collapse a family's federated instances into one health entry per management
 * cluster: the worst severity in that cluster and the worst-state server as the
 * representative for its diagnostics. Drives the per-MC pills shown in the
 * MCP-servers manager and the dashboard fleet-health summary.
 */
export function presenceByMc(servers: MCPServer[]): McPresence[] {
  const byMc = new Map<string, MCPServer[]>();
  for (const s of servers) {
    const mc = s.getManagementCluster() ?? UNLABELED;
    byMc.set(mc, [...(byMc.get(mc) ?? []), s]);
  }
  return [...byMc.entries()]
    .map(([mc, group]) => {
      const severity = group.reduce<MCPServerSeverity>(
        (acc, s) => worstSeverity(acc, mcpServerStateSeverity(s.getState())),
        'ok',
      );
      const worst = group.reduce((acc, s) =>
        mcpServerStateSeverity(s.getState()) === severity ? s : acc,
      );
      return {
        mc,
        severity,
        state: worst.getState() ?? 'unknown',
        server: worst,
      };
    })
    .sort((a, b) => a.mc.localeCompare(b.mc));
}
