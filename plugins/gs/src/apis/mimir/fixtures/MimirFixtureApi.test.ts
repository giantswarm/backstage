import {
  createFixtureDataSet,
  setFixtureScenarioForTests,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { MimirFixtureApi, mimirFixtureApi } from './MimirFixtureApi';

const NOW = Date.UTC(2026, 10, 16, 12);
const data = createFixtureDataSet({ now: NOW });
const mimir = new MimirFixtureApi(
  () => data,
  () => NOW,
);
const COST = 'agentgateway_gen_ai_client_cost_usd_total';
const SPEND_30D = 2.28683445;

function query(promql: string, installationName = 'fennel') {
  return mimir.query({ installationName, query: promql });
}

describe('MimirFixtureApi', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('answers the gateway series of a data set built at a fixed time', async () => {
    const answer = await query(`sum(increase(${COST}[30d]))`);
    // The same seed and time give the same figure: fennel's spend over the
    // 30 days before 2026-11-16 12:00 UTC.
    expect(Number(answer.data.result[0].value[1])).toBeCloseTo(SPEND_30D, 6);
    expect(answer.data.result[0].value[0]).toBe(NOW / 1000);
  });

  it('evaluates at the data set’s time, so the figures hold while a page stays open', async () => {
    jest.useFakeTimers({ now: NOW + 3 * 60 * 60 * 1000 });
    try {
      const open = new MimirFixtureApi(() => data);
      const answer = await open.query({
        installationName: 'fennel',
        query: `sum(increase(${COST}[30d]))`,
      });
      expect(Number(answer.data.result[0].value[1])).toBeCloseTo(SPEND_30D, 6);
    } finally {
      jest.useRealTimers();
    }
  });

  it('answers no series, without a warning, for a metric it has none of', async () => {
    const answer = await query(
      'max by (cluster_id, node, resource) (kube_node_status_capacity{cluster_id=~"fennel"}) * on (cluster_id, node) group_left (nodepool) (max by (cluster_id, node, nodepool) (kube_node_labels{cluster_id=~"fennel"}))',
    );
    expect(answer.data.result).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers no series and warns for a query it cannot evaluate', async () => {
    const answer = await query(`topk(3, ${COST})`);
    expect(answer).toEqual({
      status: 'success',
      data: { resultType: 'vector', result: [] },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Fixture Mimir answers no series'),
    );
  });

  it('answers one point per step of a range', async () => {
    const day = 86400;
    const end = Math.floor(NOW / 1000 / day) * day;
    const answer = await mimir.queryRange({
      installationName: 'fennel',
      query: `sum by (gen_ai_response_model) (increase(${COST}[1d]))`,
      start: String(end - 6 * day),
      end: String(end),
      step: String(day),
    });
    expect(answer.data.result).toHaveLength(1);
    expect(answer.data.result[0].values).toHaveLength(7);
  });

  it('fails for an installation fixture mode does not serve', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(query('up', 'elsewhere')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    error.mockRestore();
  });
});

describe('the fixture Mimir in each scenario', () => {
  afterEach(() => setFixtureScenarioForTests(undefined));
  const spend = async () =>
    (
      await mimirFixtureApi().query({
        installationName: 'fennel',
        query: `sum(increase(${COST}[30d]))`,
        oidcToken: undefined,
      })
    ).data.result;

  it('answers the spend of the scenario’s data set', async () => {
    setFixtureScenarioForTests('empty');
    expect(await spend()).toEqual([]);
    setFixtureScenarioForTests('many');
    const started = Date.now();
    const [many] = await spend();
    expect(Number(many.value[1])).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('never answers in loading, and fails as the backend does in error', async () => {
    setFixtureScenarioForTests('loading');
    const settled = jest.fn();
    spend().then(settled, settled);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(settled).not.toHaveBeenCalled();

    setFixtureScenarioForTests('error');
    await expect(spend()).rejects.toMatchObject({ status: 503 });
  });
});
