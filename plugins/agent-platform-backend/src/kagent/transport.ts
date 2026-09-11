import type { Transport } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';

/** One installation's kagent controller. */
export interface KagentInstallationConfig {
  /** Installation name, as in `gs.installations`. */
  name: string;
  /**
   * The gRPC origin of the kagent controller route — `https://<host>[:port]`,
   * no path. The service paths (`/kagent.api.v1alpha1.AgentInstanceService/…`,
   * `/lf.a2a.v1.A2AService/…`) are what the transport appends.
   */
  apiBaseUrl: string;
}

/**
 * Derive the controller's gRPC origin for an installation from its base domain.
 *
 * The hostname matches the `agent-platform-connectivity` chart's kagent
 * hostname (`kagent.<codename>.<base>`, exactly `kagent.<baseDomain>`), on
 * which the chart's `GRPCRoute` serves the controller's services through
 * agentgateway. No path: gRPC is matched by service, not by prefix.
 *
 * Returns undefined when the installation has no `baseDomain`.
 */
export function deriveKagentApiBaseUrl(
  baseDomain: string | undefined,
): string | undefined {
  if (!baseDomain) {
    return undefined;
  }
  return `https://kagent.${baseDomain}`;
}

/** Whether a configured URL is absolute and http(s), so a transport can use it. */
export function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The native gRPC transport toward one installation's controller.
 *
 * **HTTP/2 end to end**, deliberately: the controller serves gRPC, gRPC-Web and
 * A2A on one h2c port, and the connectivity chart's route carries native gRPC
 * over h2 through agentgateway — so this process speaks gRPC the way any other
 * client of that route does, and the same route serves Swarmgeist. An `https://`
 * origin negotiates h2 over TLS (Node's `http2` honours `NODE_EXTRA_CA_CERTS`,
 * which is how a private CA reaches this process); an `http://` origin is
 * plaintext h2c, which only an in-cluster Service URL should ever be.
 *
 * One transport per installation, shared by every call: connect-node keeps the
 * HTTP/2 session alive between calls and reopens it when it drops.
 */
export function createKagentTransport(
  installation: KagentInstallationConfig,
): Transport {
  // connect-node's gRPC transport is HTTP/2 only — gRPC has no HTTP/1.1 form —
  // so nothing here can fall back to gRPC-Web.
  return createGrpcTransport({ baseUrl: installation.apiBaseUrl });
}
