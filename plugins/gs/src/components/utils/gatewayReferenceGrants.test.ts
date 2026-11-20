import { MimirMetricSample } from '../../apis/mimir/types';
import {
  GatewayApiReferencegrantCreated,
  GatewayApiReferencegrantFromInfo,
  GatewayApiReferencegrantToInfo,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  buildReferenceGrants,
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
