import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

export type RemoteMCPServerInterface = crds.kagent.v1alpha3.RemoteMCPServer;

/** One `spec.headersFrom[]` entry: a header the server is called with, a literal value or a ConfigMap/Secret key. */
export type RemoteMCPServerHeader = NonNullable<
  NonNullable<RemoteMCPServerInterface['spec']>['headersFrom']
>[number];

/**
 * `kagent.dev/v1alpha3 RemoteMCPServer` — an MCP server an `AgentTemplate`
 * binds by name in its own namespace.
 *
 * On kagent API v2 the headers an agent calls a server with live here, on
 * `spec.headersFrom`, not on the template's tool binding. The Generic chart
 * renders one per agent, named after the agent, pointing at the muster gateway
 * and carrying the agent's toolset as the static `X-Muster-Toolset` header —
 * that per-agent server is the toolset's carrier, and reading it is how the
 * portal knows what an agent may reach.
 */
export class RemoteMCPServer extends KubeObject<RemoteMCPServerInterface> {
  static readonly supportedVersions = ['v1alpha3'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'RemoteMCPServer' as const;
  static readonly plural = 'remotemcpservers';

  getDescription() {
    return this.jsonData.spec?.description;
  }

  getUrl() {
    return this.jsonData.spec?.url;
  }

  getProtocol() {
    return this.jsonData.spec?.protocol;
  }

  getHeadersFrom(): RemoteMCPServerHeader[] {
    return [...(this.jsonData.spec?.headersFrom ?? [])];
  }

  /** The header entry of that name (case-insensitively, as HTTP treats header names). */
  getHeader(name: string): RemoteMCPServerHeader | undefined {
    const wanted = name.toLowerCase();
    return this.getHeadersFrom().find(
      header => header.name.toLowerCase() === wanted,
    );
  }

  /**
   * The literal value of one header. `undefined` when the header is absent, or
   * when it is sourced from a ConfigMap or Secret: a value that lives in a
   * Secret is not readable here, and must not be guessed.
   */
  getHeaderValue(name: string): string | undefined {
    return this.getHeader(name)?.value;
  }
}
