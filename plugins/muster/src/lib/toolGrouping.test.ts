import { MCPServer } from './k8s';
import {
  groupTools,
  ServerPrefixInfo,
  serverPrefixInfos,
  shortToolName,
  toolsForRow,
  toolsForServer,
} from './toolGrouping';

const servers: ServerPrefixInfo[] = [
  {
    prefix: 'x_kubernetes-gazelle',
    serverName: 'kubernetes-gazelle',
    managementCluster: 'gazelle',
    family: 'kubernetes',
  },
  {
    prefix: 'x_prometheus-gazelle',
    serverName: 'prometheus-gazelle',
    managementCluster: 'gazelle',
    family: 'prometheus',
  },
  {
    prefix: 'x_kubernetes-alba',
    serverName: 'kubernetes-alba',
    managementCluster: 'alba',
    family: 'kubernetes',
  },
];

const tool = (name: string) => ({ name });

describe('groupTools', () => {
  it('sorts Core first, Workflows second, then servers, Other last', () => {
    const groups = groupTools(
      [
        tool('x_kubernetes-gazelle_get_pods'),
        tool('workflow_deploy'),
        tool('core_service_list'),
        tool('weird_tool'),
      ],
      servers,
    );
    expect(groups.map(g => g.kind)).toEqual([
      'core',
      'workflow',
      'server',
      'other',
    ]);
  });

  it('groups server tools by management cluster', () => {
    const groups = groupTools(
      [
        tool('x_kubernetes-gazelle_get_pods'),
        tool('x_prometheus-gazelle_query'),
        tool('x_kubernetes-alba_get_pods'),
      ],
      servers,
    );
    const gazelle = groups.find(g => g.key === 'gazelle');
    const alba = groups.find(g => g.key === 'alba');
    expect(gazelle?.tools).toHaveLength(2);
    expect(alba?.tools).toHaveLength(1);
  });

  it('falls back to a per-segment section when the prefix is unknown', () => {
    const groups = groupTools([tool('x_mystery_do_thing')], []);
    expect(groups[0].key).toBe('Server: mystery');
  });

  it('derives a server bucket subtitle from the family set, not the first server', () => {
    const groups = groupTools(
      [
        tool('x_kubernetes-gazelle_get_pods'),
        tool('x_prometheus-gazelle_query'),
      ],
      servers,
    );
    const gazelle = groups.find(g => g.key === 'gazelle');
    expect(gazelle?.subtitle).toBe('kubernetes, prometheus');
  });

  // A federated family dedupes the same tool across many management clusters
  // into one tool (same prefix). It must not be attributed to an arbitrary peer
  // MC by list order (ADR D1) -- it goes under a neutral fleet label.
  describe('shared/federated tools (one prefix, many management clusters)', () => {
    const fleet: ServerPrefixInfo[] = [
      {
        prefix: 'x_kubernetes',
        serverName: 'agama-mcp-kubernetes',
        managementCluster: 'agama',
        family: 'kubernetes',
      },
      {
        prefix: 'x_kubernetes',
        serverName: 'gazelle-mcp-kubernetes',
        managementCluster: 'gazelle',
        family: 'kubernetes',
      },
      {
        prefix: 'x_prometheus',
        serverName: 'agama-mcp-prometheus',
        managementCluster: 'agama',
        family: 'prometheus',
      },
      {
        prefix: 'x_prometheus',
        serverName: 'gazelle-mcp-prometheus',
        managementCluster: 'gazelle',
        family: 'prometheus',
      },
      {
        prefix: 'x_pd',
        serverName: 'pd',
        managementCluster: 'gazelle',
      },
    ];

    it('buckets shared tools under a neutral family fleet label, never a peer MC', () => {
      const groups = groupTools(
        [
          tool('x_kubernetes_list'),
          tool('x_kubernetes_get'),
          tool('x_prometheus_query'),
        ],
        fleet,
      );
      const keys = groups.map(g => g.key);
      expect(keys).toContain('Kubernetes (fleet)');
      expect(keys).toContain('Prometheus (fleet)');
      // The alphabetically-first peer cluster must not head the core toolset.
      expect(keys).not.toContain('agama');
    });

    it('splits the families so a fleet group is never mislabelled by one family', () => {
      const groups = groupTools(
        [tool('x_kubernetes_list'), tool('x_prometheus_query')],
        fleet,
      );
      const k8s = groups.find(g => g.key === 'Kubernetes (fleet)');
      const prom = groups.find(g => g.key === 'Prometheus (fleet)');
      expect(k8s?.tools).toHaveLength(1);
      expect(prom?.tools).toHaveLength(1);
      expect(k8s?.subtitle).toBe('2 clusters');
    });

    it('keeps a single-MC integration server under its own MC bucket', () => {
      const groups = groupTools(
        [tool('x_pd_list_services'), tool('x_kubernetes_list')],
        fleet,
      );
      const gazelle = groups.find(g => g.key === 'gazelle');
      expect(gazelle?.tools.map(t => t.name)).toEqual(['x_pd_list_services']);
      expect(
        groups.find(g => g.key === 'Kubernetes (fleet)')?.tools,
      ).toHaveLength(1);
    });
  });

  describe('toolsForServer', () => {
    const fleet: ServerPrefixInfo[] = [
      {
        prefix: 'x_runbooks',
        serverName: 'runbooks',
        managementCluster: 'gazelle',
      },
      {
        prefix: 'x_kubernetes',
        serverName: 'gazelle-mcp-kubernetes',
        managementCluster: 'gazelle',
        family: 'kubernetes',
      },
    ];
    const tools = [
      tool('x_runbooks_search'),
      tool('x_runbooks_get'),
      tool('x_kubernetes_list'),
      tool('workflow_runbook-driven'),
    ];

    it('scopes to a server by prefix, not by description substring', () => {
      const scoped = toolsForServer(tools, 'runbooks', fleet);
      expect(scoped?.prefix).toBe('x_runbooks');
      expect(scoped?.tools.map(t => t.name)).toEqual([
        'x_runbooks_search',
        'x_runbooks_get',
      ]);
    });

    it('returns undefined for an unknown server so the caller can fall back', () => {
      expect(toolsForServer(tools, 'nope', fleet)).toBeUndefined();
    });
  });
});

function mcpServer(
  name: string,
  spec: { family?: string; toolPrefix?: string } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: {
        ...(spec.family
          ? { family: { name: spec.family, instanceArg: 'management_cluster' } }
          : {}),
        ...(spec.toolPrefix ? { toolPrefix: spec.toolPrefix } : {}),
      },
    } as never,
    'gazelle',
  );
}

describe('toolsForRow', () => {
  const walrus = mcpServer('walrus-mcp-kubernetes', { family: 'kubernetes' });
  const gazelle = mcpServer('gazelle-mcp-kubernetes', { family: 'kubernetes' });
  const foo = mcpServer('foo');
  const fooBar = mcpServer('foo_bar');
  const all = [walrus, gazelle, foo, fooBar];
  const prefixes = serverPrefixInfos(all);
  const names = (tools: { name: string }[]) => tools.map(t => t.name);

  const catalogue = [
    tool('x_kubernetes_get_pods'),
    // muster's per-instance fallback for a tool the instances disagree on.
    tool('x_walrus-mcp-kubernetes_describe'),
    tool('x_foo_list'),
    tool('x_foo_bar_list'),
    tool('core_workflow_list'),
    tool('workflow_deploy'),
  ];

  it('gives a family its grouped tools and its instances’ own ones', () => {
    expect(
      names(
        toolsForRow(
          catalogue,
          { kind: 'family', family: 'kubernetes', servers: [walrus, gazelle] },
          prefixes,
        ),
      ),
    ).toEqual(['x_kubernetes_get_pods', 'x_walrus-mcp-kubernetes_describe']);
  });

  it('attributes a tool to the longest matching prefix', () => {
    expect(
      names(toolsForRow(catalogue, { kind: 'server', server: foo }, prefixes)),
    ).toEqual(['x_foo_list']);
    expect(
      names(
        toolsForRow(catalogue, { kind: 'server', server: fooBar }, prefixes),
      ),
    ).toEqual(['x_foo_bar_list']);
  });

  it('gives muster its core and workflow tools', () => {
    expect(names(toolsForRow(catalogue, { kind: 'core' }, prefixes))).toEqual([
      'core_workflow_list',
      'workflow_deploy',
    ]);
  });

  it('uses a toolPrefix where the CR sets one', () => {
    const prefixed = mcpServer('aws-root', { toolPrefix: 'aws' });
    expect(
      names(
        toolsForRow(
          [tool('x_aws_list_buckets'), tool('x_aws-root_list_buckets')],
          { kind: 'server', server: prefixed },
          serverPrefixInfos([prefixed]),
        ),
      ),
    ).toEqual(['x_aws_list_buckets']);
  });
});

describe('shortToolName', () => {
  const prefixes = serverPrefixInfos([
    mcpServer('walrus-mcp-kubernetes', { family: 'kubernetes' }),
    mcpServer('foo'),
    mcpServer('foo_bar'),
  ]);

  it('strips the prefix of the server offering the tool', () => {
    expect(shortToolName('x_kubernetes_get_pods', prefixes)).toBe('get_pods');
    expect(shortToolName('x_foo_bar_list', prefixes)).toBe('list');
    expect(shortToolName('x_walrus-mcp-kubernetes_describe', prefixes)).toBe(
      'describe',
    );
  });

  it('strips `core_` from muster’s own tools', () => {
    expect(shortToolName('core_workflow_list', prefixes)).toBe('workflow_list');
  });

  it('leaves a name nothing matches whole', () => {
    expect(shortToolName('workflow_deploy', prefixes)).toBe('workflow_deploy');
    expect(shortToolName('x_unknown_tool', prefixes)).toBe('x_unknown_tool');
  });
});
