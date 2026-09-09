import { KubeObject, KubeObjectInterface } from './KubeObject';

/** `headersFrom[]` — a header the server is called with; a literal value or a Secret key. */
export interface RemoteMCPServerHeader {
  name: string;
  value?: string;
  valueFrom?: { type?: string; valueRef?: string; key?: string };
}

export interface RemoteMCPServerInterface extends KubeObjectInterface {
  spec?: {
    description?: string;
    protocol?: 'SSE' | 'STREAMABLE_HTTP';
    url?: string;
    headersFrom?: RemoteMCPServerHeader[];
    timeout?: string;
    sseReadTimeout?: string;
    terminateOnClose?: boolean;
    tls?: unknown;
  };
  status?: {
    observedGeneration?: number;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
    discoveredTools?: unknown[];
  };
}

/**
 * `kagent.dev/v1alpha3 RemoteMCPServer` — an MCP server an AgentTemplate binds
 * by name. On kagent `main` the headers an agent calls a server with live here
 * (`spec.headersFrom`), not on the template's tool binding: a toolset is a copy
 * of the platform's gateway server carrying the `X-Muster-Toolset` header.
 *
 * Typed locally: `@giantswarm/k8s-types` carries no v1alpha3 yet.
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

  /** The literal value of one header, when it is set inline. */
  getHeaderValue(name: string): string | undefined {
    return this.getHeadersFrom().find(
      header => header.name.toLowerCase() === name.toLowerCase(),
    )?.value;
  }
}
