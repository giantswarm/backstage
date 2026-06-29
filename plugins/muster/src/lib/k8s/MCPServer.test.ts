import { MCPServer, mcpServerStateSeverity } from './MCPServer';

function makeServer(spec: Record<string, unknown>, name = 'srv'): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec,
    } as never,
    'gazelle',
  );
}

describe('MCPServer.getToolNamePrefix', () => {
  it('prefers the family name (family servers share a prefix)', () => {
    const server = makeServer(
      {
        type: 'streamable-http',
        family: { name: 'kubernetes' },
        toolPrefix: 'k8s',
      },
      'kubernetes-agama',
    );
    expect(server.getToolNamePrefix()).toBe('x_kubernetes');
  });

  it('falls back to toolPrefix when no family', () => {
    const server = makeServer(
      { type: 'streamable-http', toolPrefix: 'prom' },
      'prometheus-alba',
    );
    expect(server.getToolNamePrefix()).toBe('x_prom');
  });

  it('falls back to the server name when neither is set', () => {
    const server = makeServer({ type: 'streamable-http' }, 'discovery-obs');
    expect(server.getToolNamePrefix()).toBe('x_discovery-obs');
  });
});

describe('mcpServerStateSeverity', () => {
  it('maps states to coarse severities', () => {
    expect(mcpServerStateSeverity('Connected')).toBe('ok');
    expect(mcpServerStateSeverity('Stopped')).toBe('warning');
    expect(mcpServerStateSeverity('Failed')).toBe('error');
    expect(mcpServerStateSeverity(undefined)).toBe('unknown');
  });

  it('treats Auth Required as healthy, not a warning', () => {
    expect(mcpServerStateSeverity('Auth Required')).toBe('ok');
  });
});
