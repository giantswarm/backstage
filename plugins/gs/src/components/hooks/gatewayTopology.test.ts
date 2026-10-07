import { MimirMetricSample } from '../../apis/mimir/types';
import {
  GatewayTopologyInputs,
  buildGatewayTopology,
  isRouteBroken,
} from './gatewayTopology';

function sample(
  labels: Record<string, string>,
  value: string = '1',
): MimirMetricSample {
  return { metric: labels, value: [1234567890, value] };
}

function inputs(
  overrides: Partial<GatewayTopologyInputs> = {},
): GatewayTopologyInputs {
  return {
    gatewayInfo: [],
    gatewayStatus: [],
    listenerInfo: [],
    listenerAttachedRoutes: [],
    routeParentInfo: [],
    routeHostnameInfo: [],
    routeStatusParentInfo: [],
    routeAccepted: [],
    routeResolvedRefs: [],
    ...overrides,
  };
}

const gw = { namespace: 'envoy-gateway-system', name: 'giantswarm-default' };
const route = { namespace: 'team-a', name: 'shop' };
const publicParent = {
  parent_namespace: 'envoy-gateway-system',
  parent_name: 'giantswarm-default',
  parent_section_name: 'https',
};

describe('buildGatewayTopology', () => {
  it('builds gateways with class, conditions and listeners', () => {
    const { gateways } = buildGatewayTopology(
      inputs({
        gatewayInfo: [
          sample({ ...gw, gatewayclass_name: 'giantswarm-default' }),
        ],
        gatewayStatus: [
          sample({ ...gw, type: 'Accepted' }, '1'),
          sample({ ...gw, type: 'Programmed' }, '0'),
        ],
        listenerInfo: [
          sample({
            ...gw,
            listener_name: 'https',
            protocol: 'HTTPS',
            port: '443',
            hostname: '*.example.com',
            tls_mode: 'Terminate',
          }),
          sample({
            ...gw,
            listener_name: 'http',
            protocol: 'HTTP',
            port: '80',
          }),
        ],
        listenerAttachedRoutes: [
          sample({ ...gw, listener_name: 'https' }, '3'),
        ],
      }),
    );

    expect(gateways).toHaveLength(1);
    expect(gateways[0]).toMatchObject({
      id: 'envoy-gateway-system/giantswarm-default',
      className: 'giantswarm-default',
      accepted: { status: 'true' },
      programmed: { status: 'false' },
    });
    expect(gateways[0].listeners.map(l => l.name)).toEqual(['http', 'https']);
    expect(gateways[0].listeners[1]).toMatchObject({
      protocol: 'HTTPS',
      port: '443',
      hostname: '*.example.com',
      tlsMode: 'Terminate',
      attachedRoutes: 3,
    });
    expect(gateways[0].listeners[0].attachedRoutes).toBeUndefined();
  });

  it('reports a missing gateway condition as not reported, not as healthy', () => {
    const { gateways } = buildGatewayTopology(
      inputs({ gatewayInfo: [sample(gw)] }),
    );
    expect(gateways[0].accepted).toEqual({ status: 'not-reported' });
    expect(gateways[0].programmed).toEqual({ status: 'not-reported' });
  });

  it('knows a gateway from its listeners when the info series is missing', () => {
    const { gateways } = buildGatewayTopology(
      inputs({ listenerInfo: [sample({ ...gw, listener_name: 'http' })] }),
    );
    expect(gateways.map(g => g.id)).toEqual([
      'envoy-gateway-system/giantswarm-default',
    ]);
  });

  it('joins route conditions with reasons to their parents', () => {
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [sample({ ...route, ...publicParent })],
        routeHostnameInfo: [
          sample({ ...route, hostname: 'shop.example.com' }),
          sample({ ...route, hostname: 'api.example.com' }),
        ],
        routeAccepted: [
          sample({ ...route, ...publicParent, reason: 'Accepted' }, '1'),
        ],
        routeResolvedRefs: [
          sample({ ...route, ...publicParent, reason: 'RefNotPermitted' }, '0'),
        ],
      }),
    );

    expect(routes).toHaveLength(1);
    expect(routes[0].hostnames).toEqual([
      'api.example.com',
      'shop.example.com',
    ]);
    expect(routes[0].parents).toEqual([
      {
        gatewayNamespace: 'envoy-gateway-system',
        gatewayName: 'giantswarm-default',
        sectionName: 'https',
        accepted: { status: 'true', reason: 'Accepted' },
        resolvedRefs: { status: 'false', reason: 'RefNotPermitted' },
      },
    ]);
    expect(isRouteBroken(routes[0])).toBe(true);
  });

  it('defaults a parentRef without namespace to the route namespace on both sides', () => {
    const local = { parent_name: 'local-gw', parent_section_name: '' };
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [sample({ ...route, ...local })],
        routeAccepted: [
          sample({
            ...route,
            parent_namespace: 'team-a',
            parent_name: 'local-gw',
            reason: 'Accepted',
          }),
        ],
      }),
    );
    expect(routes[0].parents[0]).toMatchObject({
      gatewayNamespace: 'team-a',
      sectionName: '',
      accepted: { status: 'true', reason: 'Accepted' },
    });
  });

  it('marks route conditions not available when status is written but no conditions are exported', () => {
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [sample({ ...route, ...publicParent })],
        routeStatusParentInfo: [sample({ ...route, ...publicParent })],
        routeAccepted: [],
        routeResolvedRefs: undefined,
      }),
    );
    expect(routes[0].parents[0].accepted).toEqual({ status: 'not-available' });
    expect(routes[0].parents[0].resolvedRefs).toEqual({
      status: 'not-available',
    });
    expect(isRouteBroken(routes[0])).toBe(false);
  });

  it('marks route conditions not reported when the controller wrote no status', () => {
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [sample({ ...route, ...publicParent })],
        routeStatusParentInfo: [],
        routeAccepted: [],
        routeResolvedRefs: [],
      }),
    );
    expect(routes[0].parents[0].accepted).toEqual({ status: 'not-reported' });
    expect(routes[0].parents[0].resolvedRefs).toEqual({
      status: 'not-reported',
    });
  });

  it('keeps the worst condition when several series share a parent', () => {
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [sample({ ...route, ...publicParent })],
        routeAccepted: [
          sample(
            {
              ...route,
              ...publicParent,
              controller_name: 'a',
              reason: 'Accepted',
            },
            '1',
          ),
          sample(
            {
              ...route,
              ...publicParent,
              controller_name: 'b',
              reason: 'NotAllowedByListeners',
            },
            '0',
          ),
          sample(
            {
              ...route,
              ...publicParent,
              controller_name: 'c',
              reason: 'Accepted',
            },
            '1',
          ),
        ],
      }),
    );
    expect(routes[0].parents[0].accepted).toEqual({
      status: 'false',
      reason: 'NotAllowedByListeners',
    });
  });

  it('reports what failed secondary queries would show as not available', () => {
    const { gateways, routes } = buildGatewayTopology(
      inputs({
        gatewayInfo: [sample(gw)],
        gatewayStatus: undefined,
        listenerInfo: [sample({ ...gw, listener_name: 'https' })],
        listenerAttachedRoutes: undefined,
        routeParentInfo: [sample({ ...route, ...publicParent })],
        routeHostnameInfo: undefined,
      }),
    );
    expect(gateways[0].accepted).toEqual({ status: 'not-available' });
    expect(gateways[0].listeners[0].attachedRoutes).toBeUndefined();
    expect(routes[0].hostnames).toBeUndefined();
  });

  it('marks a route condition not reported when other routes have one', () => {
    const other = { namespace: 'team-b', name: 'other' };
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [
          sample({ ...route, ...publicParent }),
          sample({ ...other, ...publicParent }),
        ],
        routeAccepted: [
          sample({ ...other, ...publicParent, reason: 'Accepted' }),
        ],
      }),
    );
    const shop = routes.find(r => r.name === 'shop');
    expect(shop?.parents[0].accepted).toEqual({ status: 'not-reported' });
  });

  it('ignores parents that are not Gateways and values that are not finite', () => {
    const { routes } = buildGatewayTopology(
      inputs({
        routeParentInfo: [
          sample({ ...route, ...publicParent, parent_kind: 'Gateway' }),
          sample({ ...route, parent_name: 'mesh', parent_kind: 'Service' }),
        ],
        routeAccepted: [sample({ ...route, ...publicParent }, 'NaN')],
      }),
    );
    expect(routes[0].parents).toHaveLength(1);
    // The only Accepted series was NaN, so nothing usable was exported, and
    // without a status entry the condition counts as not reported.
    expect(routes[0].parents[0].accepted).toEqual({ status: 'not-reported' });
  });
});
