import { toTopologyInputs } from './useMimirGatewayTopology';

describe('toTopologyInputs', () => {
  it('splits the combined query by metric name and ignores the rest', () => {
    const sample = (name: string) => ({
      metric: { __name__: name, namespace: 'a', name: 'b' },
      value: [0, '1'] as [number, string],
    });
    const inputs = toTopologyInputs([
      sample('gatewayapi_gateway_info'),
      sample('gatewayapi_httproute_status_parent_accepted'),
      sample('gatewayapi_httproute_status_parent_accepted'),
      sample('something_else'),
    ]);
    expect(inputs.gatewayInfo).toHaveLength(1);
    expect(inputs.routeAccepted).toHaveLength(2);
    // A metric the cluster doesn't export is empty, never missing: the join
    // then tells an older bundle apart from a failed load.
    expect(inputs.routeResolvedRefs).toEqual([]);
  });
});
