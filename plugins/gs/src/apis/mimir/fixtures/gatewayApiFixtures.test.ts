import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';
import {
  FIXTURE_INSTALLATIONS,
  GatewayApiGatewayInfo,
  GatewayApiGatewayListenerInfo,
  GatewayApiGatewayStatus,
  GatewayApiGatewayStatusListenerAttachedRoutes,
  GatewayApiHttprouteHostnameInfo,
  GatewayApiHttprouteParentInfo,
  GatewayApiHttprouteRuleBackendInfo,
  GatewayApiHttprouteStatusParentAccepted,
  GatewayApiHttprouteStatusParentInfo,
  GatewayApiHttprouteStatusParentResolvedRefs,
} from '@giantswarm/backstage-plugin-gs-common';
import { clusterMetricsSelector } from '../../../components/hooks/promql';
import { buildGatewayTopology } from '../../../components/utils/gatewayTopology';
import {
  buildGatewayPolicies,
  policyMetrics,
} from '../../../components/utils/gatewayPolicies';
import { MimirFixtureApi } from './MimirFixtureApi';

const NOW = Date.UTC(2026, 10, 16, 12);
const data = createFixtureDataSet({ now: NOW });
const mimir = new MimirFixtureApi(
  () => data,
  () => NOW,
);
const installation = FIXTURE_INSTALLATIONS[0];
const workload = data.clusters.filter(
  c =>
    c.installation === installation &&
    c.kind === 'workload' &&
    c.state === 'ready',
);

/** The samples of one metric on a cluster, queried as the Gateways tab does. */
async function samples(names: string[], cluster: string) {
  const answer = await mimir.query({
    installationName: installation,
    query: clusterMetricsSelector(names, cluster),
  });
  return answer.data.result;
}

/** The topology the Gateways tab builds for a cluster. */
async function topologyOf(cluster: string) {
  const one = (metric: { name: string }) => samples([metric.name], cluster);
  return buildGatewayTopology({
    gatewayInfo: await one(GatewayApiGatewayInfo),
    gatewayStatus: await one(GatewayApiGatewayStatus),
    listenerInfo: await one(GatewayApiGatewayListenerInfo),
    listenerAttachedRoutes: await one(
      GatewayApiGatewayStatusListenerAttachedRoutes,
    ),
    routeParentInfo: await one(GatewayApiHttprouteParentInfo),
    routeHostnameInfo: await one(GatewayApiHttprouteHostnameInfo),
    routeStatusParentInfo: await one(GatewayApiHttprouteStatusParentInfo),
    routeAccepted: await one(GatewayApiHttprouteStatusParentAccepted),
    routeResolvedRefs: await one(GatewayApiHttprouteStatusParentResolvedRefs),
    routeRuleBackendInfo: await one(GatewayApiHttprouteRuleBackendInfo),
  });
}

async function policiesOf(cluster: string) {
  return buildGatewayPolicies({
    created: await samples(
      policyMetrics.map(m => m.created),
      cluster,
    ),
    info: await samples(
      policyMetrics.map(m => m.info),
      cluster,
    ),
    targetInfo: await samples(
      policyMetrics.map(m => m.targetInfo),
      cluster,
    ),
    ancestorAccepted: await samples(
      policyMetrics.map(m => m.ancestorAccepted),
      cluster,
    ),
  });
}

describe('the fixture Gateway API series, as the Gateways tab reads them', () => {
  it('shows every state of the tab on a cluster with the current bundles', async () => {
    const { gateways, routes } = await topologyOf(workload[0].name);
    const gatewayByName = new Map(gateways.map(g => [g.name, g]));
    expect([...gatewayByName.keys()].sort()).toEqual([
      'giantswarm-default',
      'legacy-edge',
      'payments-internal',
    ]);
    const main = gatewayByName.get('giantswarm-default')!;
    expect(main).toMatchObject({
      accepted: { status: 'true' },
      programmed: { status: 'true' },
    });
    expect(main.listeners.map(l => l.name)).toEqual(['http', 'https']);
    expect(gatewayByName.get('legacy-edge')?.programmed).toEqual({
      status: 'false',
      reason: 'AddressNotAssigned',
    });

    const byName = new Map(routes.map(route => [route.name, route]));
    expect(byName.get('storefront')?.backends).toMatchObject({
      status: 'available',
      backends: [
        { name: 'storefront', weight: '90' },
        { name: 'storefront-next', namespace: 'shop-preview', weight: '10' },
      ],
    });
    expect(byName.get('checkout')?.parents[0].resolvedRefs).toEqual({
      status: 'false',
      reason: 'RefNotPermitted',
    });
    expect(byName.get('public-api')?.backends).toMatchObject({
      status: 'available',
      backends: [
        { name: 'api', weight: undefined },
        { name: 'api-canary', weight: undefined },
      ],
    });
    expect(byName.get('catalog')?.backends).toMatchObject({
      mayHaveMore: true,
    });
    // On two Gateways, the internal one rejecting its hostname.
    expect(
      byName
        .get('public-api')
        ?.parents.map(p => [p.name, p.accepted.status])
        .sort(),
    ).toEqual([
      ['giantswarm-default', 'true'],
      ['payments-internal', 'false'],
    ]);
    expect(byName.get('admin-console')?.parents[0].accepted).toEqual({
      status: 'not-reported',
    });
    expect(byName.get('event-webhooks')?.parents[0]).toMatchObject({
      kind: 'ListenerSet',
      accepted: { status: 'false', reason: 'NotAllowedByListeners' },
    });
    expect(byName.get('old-shop-redirect')?.backends).toEqual({
      status: 'available',
      backends: [],
      mayHaveMore: false,
    });
  });

  it('shows what older bundles do not export on every third cluster', async () => {
    const { routes } = await topologyOf(workload[2].name);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.backends).toEqual({
        status: 'not-available',
        cause: 'not-exported',
      });
    }
    const storefront = routes.find(route => route.name === 'storefront');
    expect(storefront?.parents[0].accepted).toEqual({
      status: 'not-available',
      cause: 'not-exported',
    });
  });

  it('serves policies that are accepted, rejected and unattached', async () => {
    const policies = await policiesOf(workload[0].name);
    const byName = new Map(policies.map(policy => [policy.name, policy]));
    expect(byName.get('storefront-timeouts')?.ancestors[0].accepted).toEqual({
      status: 'true',
      reason: 'Accepted',
    });
    expect(byName.get('checkout-basic-auth')?.ancestors[0].accepted).toEqual({
      status: 'false',
      reason: 'Invalid',
    });
    expect(byName.get('storefront-retired-oidc')?.ancestors).toEqual([]);
  });

  it('has no Gateway on the management cluster', async () => {
    const management = data.clusters.find(
      c => c.installation === installation && c.kind === 'management',
    );
    expect(management).toBeDefined();
    const { gateways, routes } = await topologyOf(management!.name);
    expect(gateways).toEqual([]);
    expect(routes).toEqual([]);
  });
});
