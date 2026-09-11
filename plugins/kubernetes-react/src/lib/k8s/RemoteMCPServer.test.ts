import { RemoteMCPServer, RemoteMCPServerInterface } from './RemoteMCPServer';

function makeServer(
  spec: Partial<NonNullable<RemoteMCPServerInterface['spec']>> = {},
): RemoteMCPServer {
  return new RemoteMCPServer(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'RemoteMCPServer',
      metadata: { name: 'pr-reviewer', namespace: 'kagent' },
      spec: {
        description: 'The muster gateway, scoped to pr-reviewer',
        url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
        protocol: 'STREAMABLE_HTTP',
        ...spec,
      },
    } as RemoteMCPServerInterface,
    'gazelle',
  );
}

describe('RemoteMCPServer', () => {
  it('is the v1alpha3 RemoteMCPServer, single version', () => {
    expect(RemoteMCPServer.group).toBe('kagent.dev');
    expect(RemoteMCPServer.kind).toBe('RemoteMCPServer');
    expect(RemoteMCPServer.plural).toBe('remotemcpservers');
    expect(RemoteMCPServer.supportedVersions).toEqual(['v1alpha3']);
  });

  it('reads the connection fields', () => {
    const server = makeServer();

    expect(server.getDescription()).toBe(
      'The muster gateway, scoped to pr-reviewer',
    );
    expect(server.getUrl()).toBe(
      'http://muster.agent-platform.svc.cluster.local:8090/mcp',
    );
    expect(server.getProtocol()).toBe('STREAMABLE_HTTP');
  });

  describe('headers', () => {
    const server = () =>
      makeServer({
        headersFrom: [
          { name: 'X-Muster-Toolset', value: 'preset:read-only' },
          {
            name: 'X-Api-Key',
            valueFrom: { type: 'Secret', name: 'keys', key: 'api' },
          },
        ],
      });

    it('lists every header entry verbatim', () => {
      expect(server().getHeadersFrom()).toHaveLength(2);
    });

    it('reads a literal header value case-insensitively', () => {
      expect(server().getHeaderValue('x-muster-toolset')).toBe(
        'preset:read-only',
      );
      expect(server().getHeader('X-MUSTER-TOOLSET')?.name).toBe(
        'X-Muster-Toolset',
      );
    });

    // A Secret-sourced value is not readable here and must not be guessed.
    it('reports no value for a header sourced from a Secret', () => {
      expect(server().getHeader('X-Api-Key')).toBeDefined();
      expect(server().getHeaderValue('X-Api-Key')).toBeUndefined();
    });

    it('reports nothing for an absent header or no headers at all', () => {
      expect(server().getHeaderValue('Authorization')).toBeUndefined();
      expect(makeServer().getHeadersFrom()).toEqual([]);
      expect(makeServer().getHeaderValue('X-Muster-Toolset')).toBeUndefined();
    });
  });
});
