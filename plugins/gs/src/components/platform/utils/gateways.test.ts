import type { GatewayPolicy } from '../../utils/gatewayPolicies';
import type { ReferenceGrant } from '../../utils/gatewayReferenceGrants';
import type {
  Gateway,
  HttpRoute,
  HttpRouteParent,
} from '../../utils/gatewayTopology';
import {
  buildGatewayViews,
  gatewayStatus,
  isTargetGateway,
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

  it("reads an ancestor without a namespace in the policy's namespace", () => {
    const shopEdge = gateway('shop', 'edge');
    const teamEdge = gateway('team-a', 'edge');
    const local = policy({
      namespace: 'shop',
      name: 'local',
      ancestors: [
        {
          id: 'a',
          kind: 'Gateway',
          name: 'edge',
          accepted: { status: 'true' },
        },
      ],
    });
    const placed = buildGatewayViews([shopEdge, teamEdge], [], [local]);
    expect(
      placed.gateways.map(v => [v.key, v.policies.map(r => r.policy.name)]),
    ).toEqual([
      ['shop/edge', ['local']],
      ['team-a/edge', []],
    ]);
  });

  it('counts a route once per Gateway, failing if any of its parents there fails', () => {
    const redirect = route('shop', 'web', [
      parent(main, { sectionName: 'http' }),
      parent(main, {
        sectionName: 'https',
        resolvedRefs: { status: 'false', reason: 'BackendNotFound' },
      }),
    ]);
    const [view] = buildGatewayViews([main], [redirect], []).gateways;
    expect(view.routes).toHaveLength(2);
    expect(view.routeCount).toBe(1);
    expect(view.failingRoutes).toBe(1);
  });

  describe('ReferenceGrants', () => {
    const gatewayApi = 'gateway.networking.k8s.io';
    const crossNamespace: HttpRoute = {
      ...route('shop', 'web', [parent(main)]),
      backends: {
        status: 'available',
        backends: [{ kind: 'Service', namespace: 'catalog', name: 'catalog' }],
        mayHaveMore: false,
      },
    };
    const viaListenerSet: HttpRoute = {
      ...crossNamespace,
      id: 'events/hooks',
      namespace: 'events',
      name: 'hooks',
      parents: [{ ...parent(main), kind: 'ListenerSet' }],
    };
    const grant = (
      namespace: string,
      name: string,
      fromKind: string,
      fromNamespace: string,
    ): ReferenceGrant => ({
      id: `${namespace}/${name}`,
      namespace,
      name,
      from: [{ group: gatewayApi, kind: fromKind, namespace: fromNamespace }],
      to: [{ group: '', kind: fromKind === 'Gateway' ? 'Secret' : 'Service' }],
    });
    const forShop = grant('catalog', 'for-shop', 'HTTPRoute', 'shop');
    const forEvents = grant('catalog', 'for-events', 'HTTPRoute', 'events');
    const forGateways = grant('certs', 'gateways', 'Gateway', 'payments');
    const unused = grant('legacy', 'unused', 'HTTPRoute', 'old');
    const placed = buildGatewayViews(
      [main, internal],
      [crossNamespace, viaListenerSet],
      [],
      [forShop, forEvents, forGateways, unused],
    );
    const viewOf = (key: string) =>
      placed.gateways.find(view => view.key === key)!;

    it('puts a grant under the Gateway whose route it lets reach a backend', () => {
      const rows = viewOf('envoy-gateway-system/main').referenceGrants;
      expect(rows.map(row => row.grant.name)).toEqual(['for-shop']);
      expect(rows[0].routes.map(r => r.name)).toEqual(['web']);
      expect(rows[0].gatewayNamespace).toBeUndefined();
      expect(rows[0].routesKnown).toBe(true);
    });

    it('puts a grant from Gateways under the Gateways of that namespace', () => {
      const rows = viewOf('payments/internal').referenceGrants;
      expect(rows.map(row => [row.grant.name, row.gatewayNamespace])).toEqual([
        ['gateways', 'payments'],
      ]);
    });

    it('leaves the others unattached, with the routes outside a Gateway they serve', () => {
      expect(
        placed.unattached.referenceGrants.map(row => [
          row.grant.name,
          row.routes.map(r => r.name),
        ]),
      ).toEqual([
        ['for-events', ['hooks']],
        ['unused', []],
      ]);
    });

    it('puts a grant under each Gateway a route of it is on', () => {
      const onBoth: HttpRoute = {
        ...crossNamespace,
        parents: [parent(main), parent(internal)],
      };
      const both = buildGatewayViews([main, internal], [onBoth], [], [forShop]);
      expect(
        both.gateways.map(view => [
          view.key,
          view.referenceGrants.map(row => row.id),
        ]),
      ).toEqual([
        [
          'envoy-gateway-system/main',
          ['envoy-gateway-system/main|catalog/for-shop'],
        ],
        ['payments/internal', ['payments/internal|catalog/for-shop']],
      ]);
      expect(both.unattached.referenceGrants).toEqual([]);
    });

    it('says when the backends are not known, rather than no route', () => {
      const unknown: HttpRoute = {
        ...crossNamespace,
        backends: { status: 'not-available', cause: 'not-exported' },
      };
      const unknownViews = buildGatewayViews([main], [unknown], [], [forShop]);
      expect(
        unknownViews.unattached.referenceGrants.map(r => r.routesKnown),
      ).toEqual([false]);
      const noTopology = buildGatewayViews([], [], [], [forShop], false);
      expect(
        noTopology.unattached.referenceGrants.map(r => r.routesKnown),
      ).toEqual([false]);
    });

    it('finds a Gateway by a grant on it', () => {
      expect(matchGateway(viewOf('payments/internal'), 'gatew')).toEqual({
        kind: 'ReferenceGrant',
        value: 'gateways',
      });
    });
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

describe('isTargetGateway', () => {
  it("needs the Gateway in the policy's namespace, not only its name", () => {
    const target = { kind: 'Gateway', name: 'main' };
    expect(
      isTargetGateway(
        target,
        policy({ namespace: 'envoy-gateway-system' }),
        main,
      ),
    ).toBe(true);
    expect(isTargetGateway(target, policy({ namespace: 'shop' }), main)).toBe(
      false,
    );
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
