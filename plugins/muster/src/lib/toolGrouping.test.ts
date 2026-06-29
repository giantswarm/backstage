import { groupTools, ServerPrefixInfo, toolsForServer } from './toolGrouping';

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
