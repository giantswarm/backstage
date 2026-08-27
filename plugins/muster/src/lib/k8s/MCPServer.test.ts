import {
  MCPServer,
  MCPServerState,
  mcpServerStateSeverity,
  serversHealthSummary,
} from './MCPServer';

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

function makeStateServer(state: MCPServerState, name = 'srv'): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: { type: 'streamable-http' },
      status: { state },
    } as never,
    'gazelle',
  );
}

describe('MCPServer sigv4 accessors', () => {
  it('reads the signing configuration and the request metadata', () => {
    const server = makeServer({
      type: 'streamable-http',
      url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
      auth: {
        type: 'sigv4',
        sigv4: { region: 'eu-central-1', service: 'aws-mcp' },
      },
      meta: { AWS_REGION: 'eu-central-1' },
    });

    expect(server.getAuth()?.sigv4).toEqual({
      region: 'eu-central-1',
      service: 'aws-mcp',
    });
    expect(server.getMeta()).toEqual({ AWS_REGION: 'eu-central-1' });
  });

  it('reports that a sigv4 server has no sign-in a user could complete', () => {
    // muster classifies a 401 from a sigv4 server as a connection failure, not
    // "Auth Required" — the credential is muster's own machine identity, so no
    // user login could ever fix it.
    expect(
      makeServer({
        type: 'streamable-http',
        auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } },
      }).canAuthenticateInteractively(),
    ).toBe(false);

    for (const auth of [undefined, { type: 'none' }, { type: 'oauth' }]) {
      expect(
        makeServer({
          type: 'streamable-http',
          ...(auth ? { auth } : {}),
        }).canAuthenticateInteractively(),
      ).toBe(true);
    }
  });
});

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

describe('serversHealthSummary', () => {
  function fleet(healthy: number, unhealthy: number): MCPServer[] {
    return [
      ...Array.from({ length: healthy }, (_, i) =>
        makeStateServer('Auth Required', `ok-${i}`),
      ),
      ...Array.from({ length: unhealthy }, (_, i) =>
        makeStateServer('Failed', `bad-${i}`),
      ),
    ];
  }

  it('counts ok-severity servers (Auth Required is healthy)', () => {
    const { healthy, total } = serversHealthSummary([
      makeStateServer('Connected'),
      makeStateServer('Auth Required'),
      makeStateServer('Failed'),
    ]);
    expect(healthy).toBe(2);
    expect(total).toBe(3);
  });

  it('stays ok when only a few remote backends are down (5/55)', () => {
    // The gazelle steady state: 5 federated backends Failed out of 55 must not
    // paint the stat amber.
    expect(serversHealthSummary(fleet(50, 5)).tone).toBe('ok');
  });

  it('warns once a meaningful fraction is unhealthy', () => {
    expect(serversHealthSummary(fleet(49, 6)).tone).toBe('warning');
  });

  it('is ok for an all-healthy or empty fleet', () => {
    expect(serversHealthSummary(fleet(12, 0)).tone).toBe('ok');
    expect(serversHealthSummary([]).tone).toBe('ok');
  });
});
