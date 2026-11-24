import { MimirMetricSample } from '../../apis/mimir/types';
import {
  GatewayApiReferencegrantCreated,
  GatewayApiReferencegrantFromInfo,
  GatewayApiReferencegrantToInfo,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  buildReferenceGrants,
  grantPermitsBackend,
  grantPermitsGateways,
  referenceGrantFromEntry,
  referenceGrantToEntry,
} from './gatewayReferenceGrants';

function sample(
  metric: string,
  labels: Record<string, string>,
): MimirMetricSample {
  return { metric: { __name__: metric, ...labels }, value: [0, '1'] };
}

const mirror = { namespace: 'monitoring', name: 'loki-mirror' };

describe('buildReferenceGrants', () => {
  it('joins the from and to entries of each grant', () => {
    const grants = buildReferenceGrants([
      sample(GatewayApiReferencegrantCreated.name, mirror),
      sample(GatewayApiReferencegrantFromInfo.name, {
        ...mirror,
        from_group: 'gateway.networking.k8s.io',
        from_kind: 'HTTPRoute',
        from_namespace: 'loki',
      }),
      sample(GatewayApiReferencegrantToInfo.name, {
        ...mirror,
        to_kind: 'Service',
        to_name: 'alloy',
      }),
    ]);

    expect(grants).toEqual([
      {
        id: 'monitoring/loki-mirror',
        namespace: 'monitoring',
        name: 'loki-mirror',
        from: [
          {
            group: 'gateway.networking.k8s.io',
            kind: 'HTTPRoute',
            namespace: 'loki',
          },
        ],
        to: [{ group: '', kind: 'Service', name: 'alloy' }],
      },
    ]);
  });

  it('lists a grant with only its created series, and one without it', () => {
    const grants = buildReferenceGrants([
      sample(GatewayApiReferencegrantCreated.name, mirror),
      sample(GatewayApiReferencegrantToInfo.name, {
        namespace: 'payments',
        name: 'all',
        to_kind: 'Service',
      }),
    ]);

    expect(grants.map(grant => [grant.id, grant.from, grant.to])).toEqual([
      ['monitoring/loki-mirror', [], []],
      ['payments/all', [], [{ group: '', kind: 'Service' }]],
    ]);
  });

  it('counts duplicate series once and sorts grants and entries', () => {
    const from = (namespace: string) =>
      sample(GatewayApiReferencegrantFromInfo.name, {
        ...mirror,
        from_kind: 'HTTPRoute',
        from_namespace: namespace,
      });
    const to = (name?: string) =>
      sample(GatewayApiReferencegrantToInfo.name, {
        ...mirror,
        to_kind: 'Service',
        ...(name ? { to_name: name } : {}),
      });
    const grants = buildReferenceGrants([
      sample(GatewayApiReferencegrantCreated.name, {
        namespace: 'a',
        name: 'z',
      }),
      from('tempo'),
      from('loki'),
      from('loki'),
      to('b'),
      to(),
      to('a'),
      to('a'),
    ]);

    expect(grants.map(grant => grant.id)).toEqual([
      'a/z',
      'monitoring/loki-mirror',
    ]);
    expect(
      grants[1].from.map(entry => referenceGrantFromEntry(entry).label),
    ).toEqual(['HTTPRoute in loki', 'HTTPRoute in tempo']);
    expect(
      grants[1].to.map(entry => referenceGrantToEntry(entry).label),
    ).toEqual(['any Service', 'Service a', 'Service b']);
  });

  it('keeps entries of one kind in two groups apart, and names the other group', () => {
    const [grant] = buildReferenceGrants([
      sample(GatewayApiReferencegrantFromInfo.name, {
        ...mirror,
        from_group: 'gateway.networking.k8s.io',
        from_kind: 'HTTPRoute',
        from_namespace: 'loki',
      }),
      sample(GatewayApiReferencegrantFromInfo.name, {
        ...mirror,
        from_group: 'example.io',
        from_kind: 'HTTPRoute',
        from_namespace: 'loki',
      }),
      sample(GatewayApiReferencegrantToInfo.name, {
        ...mirror,
        to_kind: 'Backend',
        to_group: 'gateway.envoyproxy.io',
        to_name: 'alloy',
      }),
      sample(GatewayApiReferencegrantToInfo.name, {
        ...mirror,
        to_kind: 'Backend',
        to_name: 'alloy',
      }),
    ]);

    const from = grant.from.map(referenceGrantFromEntry);
    expect(from.map(entry => entry.label)).toEqual([
      'HTTPRoute (example.io) in loki',
      'HTTPRoute in loki',
    ]);
    expect(new Set(from.map(entry => entry.key)).size).toBe(2);
    const to = grant.to.map(referenceGrantToEntry);
    expect(to.map(entry => entry.label)).toEqual([
      'Backend alloy',
      'Backend (gateway.envoyproxy.io) alloy',
    ]);
    expect(new Set(to.map(entry => entry.key)).size).toBe(2);
  });

  it('skips series without a grant or an entry kind', () => {
    expect(
      buildReferenceGrants([
        sample(GatewayApiReferencegrantCreated.name, { name: 'x' }),
        sample(GatewayApiReferencegrantFromInfo.name, {
          ...mirror,
          from_namespace: 'loki',
        }),
        sample(GatewayApiReferencegrantToInfo.name, {
          ...mirror,
          to_name: 'alloy',
        }),
      ]),
    ).toEqual([
      {
        id: 'monitoring/loki-mirror',
        namespace: 'monitoring',
        name: 'loki-mirror',
        from: [],
        to: [],
      },
    ]);
  });
});

describe('grantPermitsBackend', () => {
  const grant = {
    id: 'payments/from-shop',
    namespace: 'payments',
    name: 'from-shop',
    from: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'HTTPRoute',
        namespace: 'shop',
      },
    ],
    to: [{ group: '', kind: 'Service', name: 'payments' }],
  };
  const backend = { kind: 'Service', namespace: 'payments', name: 'payments' };

  it('lets a route in the from namespace reach the named Service', () => {
    expect(grantPermitsBackend(grant, 'shop', backend)).toBe(true);
  });

  it('refuses another route namespace, Service, group or kind', () => {
    expect(grantPermitsBackend(grant, 'api', backend)).toBe(false);
    expect(
      grantPermitsBackend(grant, 'shop', { ...backend, name: 'ledger' }),
    ).toBe(false);
    expect(
      grantPermitsBackend(
        { ...grant, to: [{ group: 'example.io', kind: 'Service' }] },
        'shop',
        backend,
      ),
    ).toBe(false);
    expect(
      grantPermitsBackend(
        {
          ...grant,
          from: [
            {
              group: 'gateway.networking.k8s.io',
              kind: 'GRPCRoute',
              namespace: 'shop',
            },
          ],
        },
        'shop',
        backend,
      ),
    ).toBe(false);
  });

  it('needs no grant, so matches none, within one namespace', () => {
    expect(grantPermitsBackend(grant, 'payments', backend)).toBe(false);
  });

  it('matches any Service when the grant names none', () => {
    expect(
      grantPermitsBackend(
        { ...grant, to: [{ group: '', kind: 'Service' }] },
        'shop',
        { ...backend, name: 'ledger' },
      ),
    ).toBe(true);
  });
});

describe('grantPermitsGateways', () => {
  const grant = {
    id: 'certs/gateways',
    namespace: 'certs',
    name: 'gateways',
    from: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        namespace: 'envoy-gateway-system',
      },
    ],
    to: [{ group: '', kind: 'Secret' }],
  };

  it('lets Gateways of the from namespace reference into its own', () => {
    expect(grantPermitsGateways(grant, 'envoy-gateway-system')).toBe(true);
    expect(grantPermitsGateways(grant, 'payments')).toBe(false);
  });
});
