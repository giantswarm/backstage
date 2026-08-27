import type { McpServerTransport } from './mcpServerDefinition';

/**
 * The transport verdict of muster's `core_mcpserver_detect`: one of the two
 * registrable transports, or `unknown` when the probe was inconclusive
 * (unreachable server, or responses that fit neither transport).
 */
export type DetectedTransport = McpServerTransport | 'unknown';

/** Parsed result of a `core_mcpserver_detect` call. */
export interface TransportDetection {
  transport: DetectedTransport;
  /** The server answered a probe at the HTTP level (401 challenges count). */
  reachable: boolean;
  /** A probe was answered with a 401 challenge: OAuth before handshake. */
  requiresAuth: boolean;
  /** Server implementation info, when a handshake completed. */
  serverName?: string;
  serverVersion?: string;
  /** Human-readable explanation of how the verdict was reached. */
  detail?: string;
}

/**
 * Parses a raw `core_mcpserver_detect` result defensively. Returns undefined
 * for anything that doesn't carry a recognizable transport verdict, so callers
 * degrade to manual selection instead of acting on a malformed response.
 */
export function parseTransportDetection(
  raw: unknown,
): TransportDetection | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const result = raw as Record<string, unknown>;
  const transport = result.transport;
  if (
    transport !== 'streamable-http' &&
    transport !== 'sse' &&
    transport !== 'unknown'
  ) {
    return undefined;
  }
  return {
    transport,
    reachable: result.reachable === true,
    requiresAuth: result.requiresAuth === true,
    serverName:
      typeof result.serverName === 'string' ? result.serverName : undefined,
    serverVersion:
      typeof result.serverVersion === 'string'
        ? result.serverVersion
        : undefined,
    detail: typeof result.detail === 'string' ? result.detail : undefined,
  };
}
