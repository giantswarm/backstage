import { MCPServer, MANAGEMENT_CLUSTER_LABEL } from './k8s';
import {
  partitionServers,
  presenceByMc,
  selectRepresentative,
} from './serverGrouping';

function makeServer(opts: {
  name: string;
  family?: string;
  mc?: string;
  state?: string;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        labels: opts.mc ? { [MANAGEMENT_CLUSTER_LABEL]: opts.mc } : {},
      },
      spec: opts.family ? { family: { name: opts.family } } : {},
      status: opts.state ? { state: opts.state } : {},
    } as never,
    opts.mc ?? 'gazelle',
  );
}

describe('partitionServers', () => {
  it('splits family servers (standard) from family-less ones (integration)', () => {
    const { standard, integration } = partitionServers([
      makeServer({ name: 'kubernetes-a', family: 'kubernetes', mc: 'alpha' }),
      makeServer({ name: 'kubernetes-b', family: 'kubernetes', mc: 'beta' }),
      makeServer({ name: 'prometheus-a', family: 'prometheus', mc: 'alpha' }),
      makeServer({ name: 'customer-integration' }),
    ]);

    expect(standard.map(g => g.family)).toEqual(['kubernetes', 'prometheus']);
    expect(standard[0].servers).toHaveLength(2);
    expect(integration.map(s => s.getName())).toEqual(['customer-integration']);
  });
});

describe('presenceByMc', () => {
  it('reports one entry per management cluster, sorted, with the worst state', () => {
    const presence = presenceByMc([
      makeServer({ name: 'k8s-beta', mc: 'beta', state: 'Failed' }),
      makeServer({ name: 'k8s-beta-2', mc: 'beta', state: 'Connected' }),
      makeServer({ name: 'k8s-alpha', mc: 'alpha', state: 'Connected' }),
    ]);

    expect(presence.map(p => p.mc)).toEqual(['alpha', 'beta']);
    expect(presence[0].severity).toBe('ok');
    expect(presence[1].severity).toBe('error');
    expect(presence[1].state).toBe('Failed');
  });

  it('treats Auth Required as healthy (not degraded)', () => {
    const presence = presenceByMc([
      makeServer({ name: 'k8s', mc: 'alpha', state: 'Auth Required' }),
    ]);
    expect(presence[0].severity).toBe('ok');
  });
});

describe('selectRepresentative', () => {
  // Federated families are listed in MC-alphabetical order, so the first server
  // is a peer/customer MC; selection must not default to it (ADR D1).
  const fleet = () => [
    makeServer({ name: 'k8s-agama', mc: 'agama', state: 'Auth Required' }),
    makeServer({ name: 'k8s-gazelle', mc: 'gazelle', state: 'Connected' }),
    makeServer({ name: 'k8s-zebra', mc: 'zebra', state: 'Auth Required' }),
  ];

  it('prefers the active installation own server over list order', () => {
    const rep = selectRepresentative(fleet(), 'gazelle');
    expect(rep?.server.getManagementCluster()).toBe('gazelle');
    expect(rep?.qualified).toBe(true);
  });

  it('prefers a connected server when the active installation has none of its own', () => {
    const rep = selectRepresentative(fleet(), 'not-in-fleet');
    expect(rep?.server.getManagementCluster()).toBe('gazelle');
    expect(rep?.qualified).toBe(true);
  });

  it('does not default to the first (Auth Required) server by list order', () => {
    const rep = selectRepresentative(
      [
        makeServer({ name: 'k8s-agama', mc: 'agama', state: 'Auth Required' }),
        makeServer({ name: 'k8s-beta', mc: 'beta', state: 'Connected' }),
      ],
      undefined,
    );
    expect(rep?.server.getManagementCluster()).toBe('beta');
  });

  it('falls back to the first server but flags it unqualified when none own/connected', () => {
    const rep = selectRepresentative(
      [
        makeServer({ name: 'k8s-agama', mc: 'agama', state: 'Auth Required' }),
        makeServer({ name: 'k8s-zebra', mc: 'zebra', state: 'Failed' }),
      ],
      'gazelle',
    );
    expect(rep?.server.getManagementCluster()).toBe('agama');
    expect(rep?.qualified).toBe(false);
  });

  it('returns undefined for an empty fleet', () => {
    expect(selectRepresentative([], 'gazelle')).toBeUndefined();
  });
});
