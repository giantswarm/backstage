import type { GatewayPolicy } from '../../utils/gatewayPolicies';
import type {
  Gateway,
  HttpRoute,
  HttpRouteParent,
} from '../../utils/gatewayTopology';
import {
  buildGatewayViews,
  gatewayStatus,
  matchGateway,
  policyStatus,
  routeStatus,
} from './gateways';

const TRUE = { status: 'true' as const };

function gateway(namespace: string, name: string, over = {}): Gateway {
  return {
    id: `${namespace}/${name}`,
    namespace,
    name,
    accepted: TRUE,
    programmed: TRUE,
    listeners: [],
    ...over,
  };
}

function parent(gw: Gateway, over: Partial<HttpRouteParent> = {}) {
  return {
    kind: 'Gateway' as const,
    namespace: gw.namespace,
    name: gw.name,
    sectionName: 'https',
    accepted: TRUE,
    resolvedRefs: TRUE,
    ...over,
  };
}

function route(
  namespace: string,
  name: string,
  parents: HttpRouteParent[],
  hostnames: string[] = [],
): HttpRoute {
  return {
    id: `${namespace}/${name}`,
    namespace,
    name,
    hostnames,
    backends: {
      status: 'available',
      backends: [{ kind: 'Service', namespace, name: `${name}-svc` }],
      mayHaveMore: false,
    },
    parents,
  };
}

function policy(over: Partial<GatewayPolicy>): GatewayPolicy {
  return {
    id: `${over.namespace}/${over.name}`,
    kind: 'SecurityPolicy',
    namespace: 'default',
    name: 'p',
    targets: [],
    targetsLoaded: true,
    ancestors: [],
    status: { status: 'not-reported' },
    ...over,
  };
}

const main = gateway('envoy-gateway-system', 'main');
const internal = gateway('payments', 'internal');

describe('buildGatewayViews', () => {
  const api = route(
    'api',
    'public-api',
    [
      parent(main),
      parent(internal, {
        sectionName: 'internal',
        accepted: { status: 'false', reason: 'NoMatchingListenerHostname' },
      }),
    ],
    ['api.example.com'],
  );
  const ledger = route('payments', 'ledger', [parent(internal)]);
  const webhooks = route('events', 'webhooks', [
    {
      ...parent(main),
      kind: 'ListenerSet',
      namespace: 'events',
      name: 'events-https',
    },
  ]);
  const orphan = route('shop', 'orphan', []);
  const onGateway = policy({
    namespace: 'payments',
    name: 'ip-allow',
    targets: [{ kind: 'Gateway', name: 'internal', source: 'targetRefs' }],
  });
  const onRoute = policy({
    namespace: 'payments',
    name: 'ledger-retries',
    targets: [{ kind: 'HTTPRoute', name: 'ledger', source: 'targetRefs' }],
  });
  const byAncestor = policy({
    namespace: 'api',
    name: 'api-timeouts',
    ancestors: [
      {
        id: 'a',
        kind: 'Gateway',
        namespace: 'envoy-gateway-system',
        name: 'main',
        accepted: { status: 'false', reason: 'Invalid' },
      },
    ],
  });
  const byLabels = policy({ namespace: 'shop', name: 'by-labels' });

  const views = buildGatewayViews(
    [main, internal],
    [api, ledger, webhooks, orphan],
    [onGateway, onRoute, byAncestor, byLabels],
  );
  const byKey = new Map(views.gateways.map(v => [v.key, v]));

  it('puts a route under each Gateway it has a parent on', () => {
    expect(
      byKey.get('envoy-gateway-system/main')!.routes.map(r => r.route.name),
    ).toEqual(['public-api']);
    const internalRows = byKey.get('payments/internal')!.routes;
    expect(internalRows.map(r => r.route.name)).toEqual([
      'public-api',
      'ledger',
    ]);
    expect(byKey.get('payments/internal')!.failingRoutes).toBe(1);
    expect(byKey.get('envoy-gateway-system/main')!.failingRoutes).toBe(0);
  });

  it('places policies by ancestor, Gateway target or route target', () => {
    expect(
      byKey.get('payments/internal')!.policies.map(r => r.policy.name),
    ).toEqual(['ip-allow', 'ledger-retries']);
    const mainPolicies = byKey.get('envoy-gateway-system/main')!.policies;
    expect(mainPolicies.map(r => r.policy.name)).toEqual(['api-timeouts']);
    expect(mainPolicies[0].status).toEqual({
      status: 'false',
      reason: 'Invalid',
    });
  });

  it('names the policies that target a route on its row', () => {
    const ledgerRow = byKey
      .get('payments/internal')!
      .routes.find(r => r.route.name === 'ledger')!;
    expect(ledgerRow.policies.map(p => p.name)).toEqual(['ledger-retries']);
  });

  it('leaves ListenerSet routes, routes without parents and unplaced policies unattached', () => {
    expect(views.unattached.routes.map(r => r.route.name)).toEqual([
      'webhooks',
      'orphan',
    ]);
    expect(views.unattached.routes[1].parent).toBeUndefined();
    expect(views.unattached.policies.map(r => r.policy.name)).toEqual([
      'by-labels',
    ]);
  });

  it('orders failing Gateways first', () => {
    const broken = gateway('x', 'broken', {
      programmed: { status: 'false', reason: 'AddressNotAssigned' },
    });
    expect(
      buildGatewayViews([main, broken], [], []).gateways.map(
        v => v.gateway.name,
      ),
    ).toEqual(['broken', 'main']);
  });

  describe('matchGateway', () => {
    it('finds a hostname, naming its route', () => {
      expect(matchGateway(byKey.get('payments/internal')!, 'API.exam')).toEqual(
        { kind: 'Hostname', value: 'api.example.com', route: 'public-api' },
      );
    });

    it('finds a backend, a namespace and a policy', () => {
      const view = byKey.get('payments/internal')!;
      expect(matchGateway(view, 'ledger-svc')).toEqual({
        kind: 'Backend',
        value: 'ledger-svc',
        route: 'ledger',
      });
      expect(matchGateway(view, 'ip-allow')).toEqual({
        kind: 'Policy',
        value: 'ip-allow',
      });
      expect(
        matchGateway(byKey.get('envoy-gateway-system/main')!, 'api'),
      ).toEqual({
        kind: 'Hostname',
        value: 'api.example.com',
        route: 'public-api',
      });
    });

    it('finds nothing for an empty query or a miss', () => {
      const view = byKey.get('payments/internal')!;
      expect(matchGateway(view, '  ')).toBeUndefined();
      expect(matchGateway(view, 'nothing-like-it')).toBeUndefined();
    });
  });
});

describe('statuses', () => {
  it('reads "Programmed" for a healthy Gateway, the failing condition otherwise', () => {
    expect(gatewayStatus(main)).toEqual({
      tone: 'success',
      label: 'Programmed',
    });
    expect(
      gatewayStatus(
        gateway('a', 'b', {
          programmed: { status: 'false', reason: 'AddressNotAssigned' },
        }),
      ),
    ).toEqual({
      tone: 'danger',
      label: 'Not programmed',
      reason: 'AddressNotAssigned',
    });
  });

  it('names the failing route condition, or that none is reported', () => {
    expect(routeStatus(parent(main))).toEqual({
      tone: 'success',
      label: 'Accepted',
    });
    expect(
      routeStatus(
        parent(main, {
          resolvedRefs: { status: 'false', reason: 'RefNotPermitted' },
        }),
      ),
    ).toMatchObject({ label: 'Refs not resolved', reason: 'RefNotPermitted' });
    expect(
      routeStatus(parent(main, { accepted: { status: 'not-reported' } })),
    ).toMatchObject({ tone: 'warning', label: 'Not reported' });
  });

  it('says a policy Envoy Gateway skipped has no status, and why', () => {
    const row = {
      id: 'x',
      policy: policy({ name: 'gone' }),
      status: { status: 'not-reported' as const },
    };
    expect(policyStatus(row)).toMatchObject({
      tone: 'warning',
      label: 'No status reported',
    });
  });
});
