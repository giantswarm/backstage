import { groupTools, ServerPrefixInfo } from './toolGrouping';

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
});
