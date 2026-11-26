import { readFile } from 'node:fs/promises';
import type { Config } from '@backstage/config';
import type { LoggerService } from '@backstage/backend-plugin-api';

/**
 * The header that carries the portal backend's own workload identity to
 * muster's decision API and handoff endpoint (contract-muster-approval.md
 * §5b): its projected ServiceAccount token, audience `muster`. muster takes a
 * person's token of the portal's client there only together with it, so a
 * person's portal token that reached a browser, a forwarding server or an
 * agent runtime decides nothing on its own.
 */
export const MUSTER_CLIENT_WORKLOAD_HEADER = 'X-Muster-Approval-Client';

/**
 * Where the portal's pod mounts that token by default: the Agent Platform
 * chart projects it there (audience `muster`, rotated by the kubelet).
 */
export const DEFAULT_WORKLOAD_TOKEN_FILE =
  '/var/run/secrets/muster.giantswarm.io/serviceaccount/token';

/** Reads the current workload token; `undefined` when there is none. */
export type WorkloadTokenSource = () => Promise<string | undefined>;

/**
 * The portal backend's workload token for muster, read from
 * `muster.workloadTokenFile` (default `DEFAULT_WORKLOAD_TOKEN_FILE`) on every
 * call: the kubelet rotates a projected token in place, and `agentlab portal
 * dev` rewrites its file on every start. Without the file (the portal outside
 * Kubernetes, a chart that projects none) muster's inline approval and
 * sign-in handoff are refused, and the portal opens muster's own pages
 * instead, which is logged once. The token is never logged.
 */
export function workloadTokenSource(
  config: Config,
  logger: LoggerService,
): WorkloadTokenSource {
  const file =
    config.getOptionalString('muster.workloadTokenFile') ??
    DEFAULT_WORKLOAD_TOKEN_FILE;
  let missingLogged = false;
  return async () => {
    try {
      const token = (await readFile(file, 'utf8')).trim();
      if (token) {
        missingLogged = false;
        return token;
      }
    } catch {
      // Logged below, once.
    }
    if (!missingLogged) {
      missingLogged = true;
      logger.info(
        `No workload token for muster at ${file}: muster takes no inline approval decision and issues no sign-in handoff from this portal, which opens muster's pages instead`,
      );
    }
    return undefined;
  };
}

/** The workload header for a muster request, when there is a token. */
export function workloadHeaders(token: string | undefined): {
  [MUSTER_CLIENT_WORKLOAD_HEADER]?: string;
} {
  return token ? { [MUSTER_CLIENT_WORKLOAD_HEADER]: token } : {};
}
