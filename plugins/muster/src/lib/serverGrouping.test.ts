import { MCPServer, MANAGEMENT_CLUSTER_LABEL } from './k8s';
import {
  familyCoverage,
  fleetManagementClusters,
  orderPresenceDegradedFirst,
  partitionServers,
  presenceByMc,
  selectRepresentative,
  summarizePresence,
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

describe('orderPresenceDegradedFirst', () => {
  it('puts failed before disconnected before healthy, alphabetical within a band', () => {
    const presence = presenceByMc([
      makeServer({ name: 'a', mc: 'agama', state: 'Connected' }),
      makeServer({ name: 'b', mc: 'zebra', state: 'Failed' }),
      makeServer({ name: 'c', mc: 'garm', state: 'Disconnected' }),
      makeServer({ name: 'd', mc: 'alba', state: 'Auth Required' }),
      makeServer({ name: 'e', mc: 'beta', state: 'Failed' }),
    ]);

    expect(orderPresenceDegradedFirst(presence).map(p => p.mc)).toEqual([
      'beta',
      'zebra',
      'garm',
      'agama',
      'alba',
    ]);
  });
});

describe('summarizePresence', () => {
  const mcName = (i: number) => `mc-${String(i).padStart(2, '0')}`;
  const fleet = (size: number, degraded: string[]) =>
    presenceByMc(
      Array.from({ length: size }, (_, i) =>
        makeServer({
          name: `k8s-${i}`,
          mc: mcName(i),
          state: degraded.includes(mcName(i)) ? 'Failed' : 'Connected',
        }),
      ),
    );

  it('shows every degraded cluster first and folds the healthy remainder', () => {
    const { shown, folded } = summarizePresence(
      fleet(24, ['mc-17', 'mc-05']),
      10,
    );

    expect(shown).toHaveLength(10);
    expect(shown.slice(0, 2).map(p => p.mc)).toEqual(['mc-05', 'mc-17']);
    expect(shown.slice(2).every(p => p.severity === 'ok')).toBe(true);
    expect(folded).toBe(14);
  });

  it('never folds a degraded cluster, even past the limit', () => {
    const all = Array.from({ length: 12 }, (_, i) => mcName(i));
    const { shown, folded } = summarizePresence(fleet(12, all), 10);

    expect(shown).toHaveLength(12);
    expect(folded).toBe(0);
  });

  it('shows a single leftover rather than folding it into "+1 more"', () => {
    const { shown, folded } = summarizePresence(fleet(11, []), 10);

    expect(shown).toHaveLength(11);
    expect(folded).toBe(0);
  });

  it('leaves a short row alone', () => {
    const { shown, folded } = summarizePresence(fleet(3, []), 10);

    expect(shown).toHaveLength(3);
    expect(folded).toBe(0);
  });
});

describe('fleetManagementClusters / familyCoverage', () => {
  const kubernetes = {
    family: 'kubernetes',
    servers: ['agama', 'alba', 'gaggle', 'garm'].map(mc =>
      makeServer({
        name: `k8s-${mc}`,
        family: 'kubernetes',
        mc,
        state: mc === 'garm' ? 'Failed' : 'Connected',
      }),
    ),
  };
  // A family mid-rollout: deployed on two of the four clusters.
  const capi = {
    family: 'capi',
    servers: ['gaggle', 'garm'].map(mc =>
      makeServer({
        name: `capi-${mc}`,
        family: 'capi',
        mc,
        state: 'Connected',
      }),
    ),
  };

  it('unions the clusters of every family, sorted', () => {
    expect(fleetManagementClusters([capi, kubernetes])).toEqual([
      'agama',
      'alba',
      'gaggle',
      'garm',
    ]);
  });

  it('reports a partially rolled-out family as missing from the rest of the fleet', () => {
    const coverage = familyCoverage(
      capi,
      fleetManagementClusters([capi, kubernetes]),
    );

    expect(coverage.present.map(p => p.mc)).toEqual(['gaggle', 'garm']);
    expect(coverage.missing).toEqual(['agama', 'alba']);
    expect(coverage.degraded).toEqual([]);
    expect(coverage.fleetSize).toBe(4);
  });

  it('reports a fully deployed family with its degraded clusters first', () => {
    const coverage = familyCoverage(
      kubernetes,
      fleetManagementClusters([capi, kubernetes]),
    );

    expect(coverage.missing).toEqual([]);
    expect(coverage.present.map(p => p.mc)).toEqual([
      'garm',
      'agama',
      'alba',
      'gaggle',
    ]);
    expect(coverage.degraded.map(p => p.mc)).toEqual(['garm']);
  });
});
