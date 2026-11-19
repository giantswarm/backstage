import { FIXTURE_INSTALLATIONS } from '../fixtureMode';
import {
  GatewayApiGatewayInfo,
  GatewayApiHttprouteParentInfo,
  GatewayApiHttprouteRuleBackendInfo,
  GatewayApiHttprouteStatusParentAccepted,
} from '../mimirMetrics';
import { baseDataSet } from './dataSet';
import { gatewayApiSeries, gatewayApiSeriesOf } from './gatewayApiSeries';
import { MAX_NAME_LENGTH } from './names';
import { scenarioDataSet } from './scenarios';

const installation = FIXTURE_INSTALLATIONS[0];

function clustersWith(
  series: ReturnType<typeof gatewayApiSeriesOf>,
  metric: string,
): Set<string> {
  return new Set(
    series
      .filter(s => s.labels.__name__ === metric)
      .map(s => s.labels.cluster_id),
  );
}

function routesOn(
  series: ReturnType<typeof gatewayApiSeriesOf>,
  cluster: string,
): string[] {
  return series
    .filter(
      s =>
        s.labels.__name__ === GatewayApiHttprouteParentInfo.name &&
        s.labels.cluster_id === cluster,
    )
    .map(s => s.labels.name);
}

describe('gatewayApiSeries', () => {
  const data = baseDataSet();
  const series = gatewayApiSeriesOf(data, installation);
  const workload = data.clusters.filter(
    c => c.installation === installation && c.kind === 'workload',
  );

  it('gives every workload cluster a Gateway, and the management cluster none', () => {
    const withGateway = clustersWith(series, GatewayApiGatewayInfo.name);
    expect([...withGateway].sort()).toEqual(workload.map(c => c.name).sort());
    const management = data.clusters.filter(
      c => c.installation === installation && c.kind === 'management',
    );
    expect(management.filter(c => withGateway.has(c.name))).toEqual([]);
  });

  it('leaves the conditions and backends out on every third workload cluster', () => {
    const withBackends = clustersWith(
      series,
      GatewayApiHttprouteRuleBackendInfo.name,
    );
    const withConditions = clustersWith(
      series,
      GatewayApiHttprouteStatusParentAccepted.name,
    );
    workload.forEach((cluster, index) => {
      const older = index % 3 === 2;
      expect(withBackends.has(cluster.name)).toBe(!older);
      expect(withConditions.has(cluster.name)).toBe(!older);
    });
  });

  it('builds the series once per data set and installation', () => {
    expect(gatewayApiSeries(data, installation)).toBe(
      gatewayApiSeries(data, installation),
    );
  });

  it('has nothing in the empty scenario', () => {
    expect(gatewayApiSeriesOf(scenarioDataSet('empty'), installation)).toEqual(
      [],
    );
  });

  it('gives the first cluster hundreds of routes in the many scenario', () => {
    const many = scenarioDataSet('many');
    const first = many.clusters.find(
      c => c.installation === installation && c.kind === 'workload',
    )!;
    const routes = routesOn(gatewayApiSeriesOf(many, installation), first.name);
    expect(routes.length).toBeGreaterThanOrEqual(150);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('names routes as long as a Kubernetes name may be in the long-names scenario', () => {
    const long = scenarioDataSet('long-names');
    const first = long.clusters.find(
      c => c.installation === installation && c.kind === 'workload',
    )!;
    const routes = routesOn(gatewayApiSeriesOf(long, installation), first.name);
    expect(routes.some(name => name.length === MAX_NAME_LENGTH)).toBe(true);
    expect(routes.every(name => name.length <= MAX_NAME_LENGTH)).toBe(true);
  });
});
